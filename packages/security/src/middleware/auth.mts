import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import {
  AuthenticatedRequest,
  User,
  JWTPayload,
  AuthToken,
  SecurityConfig,
  SecurityEventType,
  SecuritySeverity
} from '../types/security.mts';
import { AuthenticationError } from '../types/security.mts';
import { auditLogger } from '../audit/logger.mjs';

// Validation schemas
const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  rememberMe: z.boolean().optional().default(false)
});

const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1)
});

export class AuthenticationService {
  private config: SecurityConfig;
  private userStore: Map<string, User> = new Map();
  private refreshTokens: Set<string> = new Set();
  private apiKeys: Map<string, { userId: string; permissions: string[] }> = new Map();

  constructor(config: SecurityConfig) {
    this.config = config;
  }

  /**
   * Generate JWT tokens for authenticated user
   */
  async generateTokens(user: User): Promise<AuthToken> {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id,
      email: user.email,
      roles: user.roles.map(r => r.name),
      permissions: user.permissions.map(p => `${p.resource}:${p.action}`),
      iss: this.config.jwt.issuer,
      aud: this.config.jwt.audience
    };

    // Use a type assertion to ensure compatibility with the jwt.sign method
    const secretKey = this.config.jwt.secret;
    const signOptions = {
      expiresIn: this.config.jwt.expiresIn,
      algorithm: this.config.jwt.algorithm
    };
    
    // Cast the payload and options to avoid type errors
    const accessToken = jwt.sign(payload as object, secretKey, signOptions as jwt.SignOptions);

    const refreshPayload = { sub: user.id, type: 'refresh' };
    const refreshOptions = {
      expiresIn: this.config.jwt.refreshExpiresIn,
      algorithm: this.config.jwt.algorithm
    };
    
    // Cast the payload and options to avoid type errors
    const refreshToken = jwt.sign(refreshPayload, secretKey, refreshOptions as jwt.SignOptions);

    this.refreshTokens.add(refreshToken);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseExpiresIn(this.config.jwt.expiresIn),
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<JWTPayload> {
    try {
      // Use type assertions to ensure compatibility with jwt.verify
      const secretKey = this.config.jwt.secret;
      const verifyOptions = {
        algorithms: [this.config.jwt.algorithm],
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience
      };
      
      const decoded = jwt.verify(token, secretKey, verifyOptions as jwt.VerifyOptions) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AuthenticationError('Token expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw new AuthenticationError('Token verification failed');
    }
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(email: string, password: string): Promise<User> {
    // In production, this would query a database
    const user = Array.from(this.userStore.values()).find(u => u.email === email);
    
    if (!user || !user.isActive) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Verify password (in production, compare with hashed password)
    const isValidPassword = await bcrypt.compare(password, user.password || '');
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Update last login
    user.lastLogin = new Date();
    this.userStore.set(user.id, user);

    return user;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthToken> {
    if (!this.refreshTokens.has(refreshToken)) {
      throw new AuthenticationError('Invalid refresh token');
    }

    try {
      const decoded = jwt.verify(refreshToken, this.config.jwt.secret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid token type');
      }

      const user = this.userStore.get(decoded.sub);
      if (!user || !user.isActive) {
        throw new AuthenticationError('User not found or inactive');
      }

      // Remove old refresh token and generate new tokens
      this.refreshTokens.delete(refreshToken);
      return await this.generateTokens(user);
    } catch (error) {
      this.refreshTokens.delete(refreshToken);
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey: string): Promise<{ userId: string; permissions: string[] }> {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) {
      throw new AuthenticationError('Invalid API key');
    }

    const user = this.userStore.get(keyData.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('User associated with API key is inactive');
    }

    return keyData;
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
  }

  /**
   * Revoke all user tokens
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    // In production, maintain a blacklist or use token versioning
    const tokensToRevoke = Array.from(this.refreshTokens).filter(token => {
      try {
        const decoded = jwt.verify(token, this.config.jwt.secret) as any;
        return decoded.sub === userId;
      } catch {
        return false;
      }
    });

    tokensToRevoke.forEach(token => this.refreshTokens.delete(token));
  }

  private parseExpiresIn(expiresIn: string | number): number {
    // If expiresIn is already a number, return it directly (assuming it's in seconds)
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }
    
    // Handle string format
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const [, value, unit] = match;
    // Ensure value is a string before parsing
    const num = parseInt(value || '0', 10);

    if (isNaN(num)) return 3600; // Default 1 hour if parseInt fails

    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 3600;
      case 'd': return num * 86400;
      default: return 3600;
    }
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.userStore.get(id);
  }
}

/**
 * Authentication middleware factory
 */
export function createAuthMiddleware(authService: AuthenticationService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;

      let user: User | undefined;
      let token: JWTPayload | undefined;

      // Try API key authentication first
      if (apiKey) {
        try {
          const keyData = await authService.validateAPIKey(apiKey);
          user = await authService.getUserById(keyData.userId);
          
          await auditLogger.logSecurityEvent({
            type: SecurityEventType.AUTHENTICATION,
            severity: SecuritySeverity.LOW,
            userId: keyData.userId,
            sessionId: req.sessionId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path,
            action: 'api_key_auth',
            outcome: 'success',
            details: { method: 'api_key' }
          });
        } catch (error) {
          await auditLogger.logSecurityEvent({
            type: SecurityEventType.AUTHENTICATION,
            severity: SecuritySeverity.MEDIUM,
            userId: undefined,
            sessionId: req.sessionId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path,
            action: 'api_key_auth',
            outcome: 'failure',
            details: { method: 'api_key', error: error instanceof Error ? error.message : String(error) }
          });
          throw error;
        }
      }
      // Try JWT authentication
      else if (authHeader?.startsWith('Bearer ')) {
        const accessToken = authHeader.substring(7);
        
        try {
          token = await authService.verifyToken(accessToken);
          user = await authService.getUserById(token.sub);

          if (!user || !user.isActive) {
            throw new AuthenticationError('User not found or inactive');
          }

          await auditLogger.logSecurityEvent({
            type: SecurityEventType.AUTHENTICATION,
            severity: SecuritySeverity.LOW,
            userId: token.sub,
            sessionId: req.sessionId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path,
            action: 'jwt_auth',
            outcome: 'success',
            details: { method: 'jwt' }
          });
        } catch (error) {
          await auditLogger.logSecurityEvent({
            type: SecurityEventType.AUTHENTICATION,
            severity: SecuritySeverity.MEDIUM,
            userId: undefined,
            sessionId: req.sessionId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path,
            action: 'jwt_auth',
            outcome: 'failure',
            details: { method: 'jwt', error: error instanceof Error ? error.message : String(error) }
          });
          throw error;
        }
      }
      // No authentication provided
      else {
        await auditLogger.logSecurityEvent({
          type: SecurityEventType.ACCESS_DENIED,
          severity: SecuritySeverity.MEDIUM,
          userId: undefined,
          sessionId: req.sessionId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || '',
          resource: req.path,
          action: 'access_attempt',
          outcome: 'blocked',
          details: { reason: 'no_authentication' }
        });
        throw new AuthenticationError('Authentication required');
      }

      // Attach user and token to request
      if (user) req.user = user;
      if (token) req.token = token;
      
      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    }
  };
}

/**
 * Optional authentication middleware (doesn't fail if no auth provided)
 */
export function createOptionalAuthMiddleware(authService: AuthenticationService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const apiKey = req.headers['x-api-key'] as string;

      if (authHeader?.startsWith('Bearer ') || apiKey) {
        // Use the main auth middleware if authentication is provided
        return createAuthMiddleware(authService)(req, res, next);
      }

      // No authentication provided, continue without user context
      next();
    } catch (error) {
      // Log error but don't fail the request
      console.error('Optional authentication failed:', error);
      next();
    }
  };
}

/**
 * Login endpoint handler
 */
export function createLoginHandler(authService: AuthenticationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, rememberMe } = LoginSchema.parse(req.body);

      const user = await authService.authenticateUser(email, password);
      const tokens = await authService.generateTokens(user);

      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.LOW,
        userId: user.id,
        sessionId: req.sessionID,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        resource: req.path,
        action: 'login',
        outcome: 'success',
        details: { email, rememberMe }
      });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            roles: user.roles.map(r => r.name)
          },
          tokens
        }
      });
    } catch (error) {
      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.MEDIUM,
        userId: undefined,
        sessionId: req.sessionID,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        resource: req.path,
        action: 'login',
        outcome: 'failure',
        details: { error: error instanceof Error ? error.message : String(error) }
      });

      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    }
  };
}

/**
 * Refresh token endpoint handler
 */
export function createRefreshHandler(authService: AuthenticationService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { refreshToken } = RefreshTokenSchema.parse(req.body);
      const tokens = await authService.refreshAccessToken(refreshToken);

      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.LOW,
        userId: undefined,
        sessionId: req.sessionID,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        resource: req.path,
        action: 'refresh_token',
        outcome: 'success',
        details: {}
      });

      res.json({
        success: true,
        data: { tokens }
      });
    } catch (error) {
      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.MEDIUM,
        userId: undefined,
        sessionId: req.sessionID,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || '',
        resource: req.path,
        action: 'refresh_token',
        outcome: 'failure',
        details: { error: error instanceof Error ? error.message : String(error) }
      });

      if (error instanceof AuthenticationError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    }
  };
}

/**
 * Logout endpoint handler
 */
export function createLogoutHandler(authService: AuthenticationService) {
  return async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }

      if (req.user) {
        await auditLogger.logSecurityEvent({
          type: SecurityEventType.AUTHENTICATION,
          severity: SecuritySeverity.LOW,
          userId: req.user.id,
          sessionId: req.sessionId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || '',
          resource: req.path,
          action: 'logout',
          outcome: 'success',
          details: {}
        });
      }

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}