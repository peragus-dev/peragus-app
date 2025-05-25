import { auditLogger } from './audit/logger.mjs';
import { AuthenticationService, createAuthMiddleware, createOptionalAuthMiddleware } from './middleware/auth.mjs';
import { createAdaptiveRateLimitMiddleware, createRateLimitMiddleware, RateLimiter } from './middleware/rate-limit.mjs';
import { createSecurityHeadersMiddleware, SecurityHeaderPresets } from './middleware/security-headers.mjs';
import { validateCommandMiddleware, validateFilePathMiddleware } from './middleware/validation.mjs';

// Security Framework Main Export
export * from './types/security.mjs';

// Middleware exports
export { 
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createLoginHandler,
  createRefreshHandler,
  createLogoutHandler,
  AuthenticationService
} from './middleware/auth.mjs';

export {
  createValidationMiddleware,
  validateFilePathMiddleware,
  validateCommandMiddleware,
  InputValidator,
  CommonSchemas
} from './middleware/validation.mjs';

export {
  createRateLimitMiddleware,
  createAdaptiveRateLimitMiddleware,
  RateLimiter,
  MemoryRateLimitStore,
  SlidingWindowRateLimiter,
  CircuitBreaker,
  RateLimitPresets
} from './middleware/rate-limit.mjs';

export {
  createSecurityHeadersMiddleware,
  createSecureCORSMiddleware,
  createResponseSanitizationMiddleware,
  createErrorSanitizationMiddleware,
  createAPISecurityMiddleware,
  SecurityHeaderPresets
} from './middleware/security-headers.mjs';

// Audit and logging exports
export {
  auditLogger,
  AuditLogger
} from './audit/logger.mjs';

// Security configuration and utilities
export interface SecurityFrameworkConfig {
  authentication: {
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    enableAdaptive: boolean;
  };
  validation: {
    enablePathValidation: boolean;
    enableCommandValidation: boolean;
    enableSQLValidation: boolean;
    enableXSSProtection: boolean;
  };
  audit: {
    enabled: boolean;
    level: 'error' | 'warn' | 'info' | 'debug';
    retention: number;
  };
  headers: {
    enableCSP: boolean;
    enableHSTS: boolean;
    strictMode: boolean;
  };
}

/**
 * Default security configuration
 */
export const defaultSecurityConfig: SecurityFrameworkConfig = {
  authentication: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiresIn: '15m',
    refreshExpiresIn: '7d',
    issuer: 'srcbook-mcp',
    audience: 'srcbook-api'
  },
  rateLimit: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    enableAdaptive: true
  },
  validation: {
    enablePathValidation: true,
    enableCommandValidation: true,
    enableSQLValidation: true,
    enableXSSProtection: true
  },
  audit: {
    enabled: true,
    level: 'info',
    retention: 30 // days
  },
  headers: {
    enableCSP: true,
    enableHSTS: true,
    strictMode: process.env.NODE_ENV === 'production'
  }
};

/**
 * Security framework initialization
 */
export class SecurityFramework {
  private config: SecurityFrameworkConfig;
  private authService?: AuthenticationService;
  private rateLimiter?: RateLimiter;

  constructor(config: Partial<SecurityFrameworkConfig> = {}) {
    this.config = { ...defaultSecurityConfig, ...config };
  }

  /**
   * Initialize the security framework
   */
  async initialize(): Promise<void> {
    // Initialize authentication service
    this.authService = new AuthenticationService({
      jwt: {
        secret: this.config.authentication.jwtSecret,
        expiresIn: this.config.authentication.jwtExpiresIn,
        refreshExpiresIn: this.config.authentication.refreshExpiresIn,
        issuer: this.config.authentication.issuer,
        audience: this.config.authentication.audience,
        algorithm: 'HS256'
      },
      rateLimit: {
        windowMs: this.config.rateLimit.windowMs,
        maxRequests: this.config.rateLimit.maxRequests,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        standardHeaders: true,
        legacyHeaders: false
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32,
        ivLength: 16,
        saltLength: 32,
        iterations: 100000
      },
      audit: {
        enabled: this.config.audit.enabled,
        level: this.config.audit.level,
        format: 'json',
        destination: 'console',
        retention: this.config.audit.retention
      },
      cors: {
        origin: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        credentials: true,
        maxAge: 86400
      }
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiter({
      windowMs: this.config.rateLimit.windowMs,
      maxRequests: this.config.rateLimit.maxRequests,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      standardHeaders: true,
      legacyHeaders: false
    });

    // Configure audit logger
    auditLogger.updateConfig({
      enabled: this.config.audit.enabled,
      level: this.config.audit.level,
      format: 'json',
      destination: 'console',
      retention: this.config.audit.retention
    });

    console.log('Security framework initialized successfully');
  }

  /**
   * Get authentication middleware
   */
  getAuthMiddleware() {
    if (!this.authService) {
      throw new Error('Security framework not initialized');
    }
    return createAuthMiddleware(this.authService);
  }

  /**
   * Get optional authentication middleware
   */
  getOptionalAuthMiddleware() {
    if (!this.authService) {
      throw new Error('Security framework not initialized');
    }
    return createOptionalAuthMiddleware(this.authService);
  }

  /**
   * Get validation middleware
   */
  getValidationMiddleware() {
    const middlewares = [];

    if (this.config.validation.enablePathValidation) {
      middlewares.push(validateFilePathMiddleware());
    }

    if (this.config.validation.enableCommandValidation) {
      middlewares.push(validateCommandMiddleware());
    }

    return middlewares;
  }

  /**
   * Get rate limiting middleware
   */
  getRateLimitMiddleware() {
    if (!this.rateLimiter) {
      throw new Error('Security framework not initialized');
    }

    if (this.config.rateLimit.enableAdaptive) {
      return createAdaptiveRateLimitMiddleware({
        windowMs: this.config.rateLimit.windowMs,
        maxRequests: this.config.rateLimit.maxRequests,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        standardHeaders: true,
        legacyHeaders: false
      });
    }

    return createRateLimitMiddleware({
      windowMs: this.config.rateLimit.windowMs,
      maxRequests: this.config.rateLimit.maxRequests,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      standardHeaders: true,
      legacyHeaders: false
    });
  }

  /**
   * Get security headers middleware
   */
  getSecurityHeadersMiddleware() {
    const preset = this.config.headers.strictMode ? 
      SecurityHeaderPresets.strict : 
      SecurityHeaderPresets.web;

    return createSecurityHeadersMiddleware(preset);
  }

  /**
   * Get authentication service
   */
  getAuthService(): AuthenticationService {
    if (!this.authService) {
      throw new Error('Security framework not initialized');
    }
    return this.authService;
  }

  /**
   * Get security configuration
   */
  getConfig(): SecurityFrameworkConfig {
    return { ...this.config };
  }

  /**
   * Update security configuration
   */
  updateConfig(updates: Partial<SecurityFrameworkConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.rateLimiter) {
      this.rateLimiter.destroy();
    }
    console.log('Security framework cleaned up');
  }
}

/**
 * Create a pre-configured security framework instance
 */
export function createSecurityFramework(config?: Partial<SecurityFrameworkConfig>): SecurityFramework {
  return new SecurityFramework(config);
}

/**
 * Security utilities
 */
export const SecurityUtils = {
  /**
   * Generate a secure random string
   */
  generateSecureRandom(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  /**
   * Validate environment configuration
   */
  validateEnvironment(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check JWT secret
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production') {
      if (process.env.NODE_ENV === 'production') {
        errors.push('JWT_SECRET must be set in production');
      } else {
        warnings.push('JWT_SECRET should be set for security');
      }
    }

    // Check HTTPS in production
    if (process.env.NODE_ENV === 'production' && !process.env.HTTPS) {
      warnings.push('HTTPS should be enabled in production');
    }

    // Check database encryption
    if (!process.env.DB_ENCRYPTION_KEY) {
      warnings.push('Database encryption key not set');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Get security recommendations
   */
  getSecurityRecommendations(): string[] {
    return [
      'Use HTTPS in production',
      'Set strong JWT secrets',
      'Enable database encryption',
      'Implement proper session management',
      'Use rate limiting on all endpoints',
      'Validate all user inputs',
      'Log security events',
      'Regular security audits',
      'Keep dependencies updated',
      'Use security headers',
      'Implement CSRF protection',
      'Use secure password policies',
      'Enable audit logging',
      'Monitor for suspicious activity',
      'Implement proper error handling'
    ];
  }
};

// Export singleton instance for convenience
export const securityFramework = new SecurityFramework();