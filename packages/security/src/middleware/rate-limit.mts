import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, RateLimitConfig, RateLimitInfo } from '../types/security.mjs';
import { RateLimitError, SecurityEventType, SecuritySeverity, type SecurityEvent } from '../types/security.mjs';
import { auditLogger } from '../audit/logger.mjs';
import { randomUUID } from 'crypto';

export interface RateLimitStore {
  get(key: string): Promise<RateLimitInfo | null>;
  set(key: string, info: RateLimitInfo): Promise<void>;
  increment(key: string): Promise<RateLimitInfo>;
  reset(key: string): Promise<void>;
}

/**
 * In-memory rate limit store (for development/testing)
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitInfo>();

  async get(key: string): Promise<RateLimitInfo | null> {
    const info = this.store.get(key);
    if (!info) return null;

    // Check if window has expired
    if (Date.now() > info.resetTime.getTime()) {
      this.store.delete(key);
      return null;
    }

    return info;
  }

  async set(key: string, info: RateLimitInfo): Promise<void> {
    this.store.set(key, info);
  }

  async increment(key: string): Promise<RateLimitInfo> {
    const existing = await this.get(key);
    
    if (!existing) {
      const newInfo: RateLimitInfo = {
        limit: 100, // Default limit
        current: 1,
        remaining: 99,
        resetTime: new Date(Date.now() + 60000) // 1 minute window
      };
      await this.set(key, newInfo);
      return newInfo;
    }

    const updated: RateLimitInfo = {
      ...existing,
      current: existing.current + 1,
      remaining: Math.max(0, existing.remaining - 1)
    };

    await this.set(key, updated);
    return updated;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, info] of this.store.entries()) {
      if (now > info.resetTime.getTime()) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private store: RateLimitStore;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = config;
    this.store = store || new MemoryRateLimitStore();

    // Start cleanup interval for memory store
    if (this.store instanceof MemoryRateLimitStore) {
      // Cleanup is handled in the MemoryRateLimitStore class
      this.cleanupInterval = setInterval(() => {
        // No-op as cleanup is handled internally
      }, 60000); // 1 minute interval
    }
  }

  /**
   * Check if request should be rate limited
   */
  async checkLimit(key: string, limit?: number): Promise<RateLimitInfo> {
    const effectiveLimit = limit ?? this.config.maxRequests;
    const now = Date.now();
    const resetTime = new Date(now + this.config.windowMs);
    
    const info = await this.store.increment(key);
    
    // If this is a new entry or the window has passed, reset the counter
    if (!info || now > info.resetTime.getTime()) {
      info.current = 1;
      info.limit = effectiveLimit;
      info.resetTime = resetTime;
      info.remaining = effectiveLimit - 1;
    } else {
      info.remaining = Math.max(0, effectiveLimit - info.current);
    }
    
    await this.store.set(key, info);
    return info;
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    await this.store.reset(key);
  }

  /**
   * Get current rate limit info
   */
  async getLimitInfo(key: string): Promise<RateLimitInfo | null> {
    return await this.store.get(key);
  }

  /**
   * Generate rate limit key from request
   */
  generateKey(req: AuthenticatedRequest, keyGenerator?: (req: AuthenticatedRequest) => string): string {
    if (keyGenerator) {
      return keyGenerator(req);
    }

    // Default key generation strategy
    const userId = req.user?.id;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const endpoint = req.route?.path || req.path || 'unknown';

    if (userId) {
      return `user:${userId}:${endpoint}`;
    }

    return `ip:${ip}:${endpoint}`;
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig,
  options?: {
    store?: RateLimitStore;
    keyGenerator?: (req: AuthenticatedRequest) => string;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    onLimitReached?: (req: AuthenticatedRequest, res: Response) => void;
  }
) {
  const rateLimiter = new RateLimiter(config, options?.store);

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const key = rateLimiter.generateKey(req, options?.keyGenerator);
      const limitInfo = await rateLimiter.checkLimit(key);

      // Set rate limit headers
      if (config.standardHeaders) {
        res.set({
          'RateLimit-Limit': limitInfo.limit.toString(),
          'RateLimit-Remaining': limitInfo.remaining.toString(),
          'RateLimit-Reset': Math.ceil(limitInfo.resetTime.getTime() / 1000).toString()
        });
      }

      if (config.legacyHeaders) {
        res.set({
          'X-RateLimit-Limit': limitInfo.limit.toString(),
          'X-RateLimit-Remaining': limitInfo.remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(limitInfo.resetTime.getTime() / 1000).toString()
        });
      }

      // Check if limit exceeded
      if (limitInfo.current > limitInfo.limit) {
        // Generate rate limit key for logging
        const rateLimitKey = rateLimiter.generateKey(req, options?.keyGenerator);
        
        // Log rate limit exceeded event
        const event: Omit<SecurityEvent, 'id' | 'timestamp'> & { id: string; timestamp: Date } = {
          id: randomUUID(),
          type: SecurityEventType.RATE_LIMIT_EXCEEDED,
          severity: SecuritySeverity.MEDIUM,
          timestamp: new Date(),
          userId: req.user?.id,
          sessionId: req.sessionID,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || '',
          resource: req.path,
          action: 'rate_limit_exceeded',
          outcome: 'blocked',
          details: {
            key: rateLimitKey,
            limit: limitInfo.limit,
            current: limitInfo.current,
            remaining: limitInfo.remaining,
            resetTime: limitInfo.resetTime
          }
        };
        
        await auditLogger.logSecurityEvent(event);
        
        // Call the onLimitReached callback if provided
        if (options?.onLimitReached) {
          await options.onLimitReached(req, res);
        }
        
        throw new RateLimitError('Rate limit exceeded', {
          limit: limitInfo.limit,
          current: limitInfo.current,
          remaining: limitInfo.remaining,
          resetTime: limitInfo.resetTime
        });
      }

      // Store rate limit info on request for later use
      (req as any).rateLimit = limitInfo;

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          details: error.details
        });
      } else {
        console.error('Rate limiting error:', error);
        next(); // Continue on rate limiter errors
      }
    }
  };
}

/**
 * Adaptive rate limiting based on user type and endpoint
 */
export function createAdaptiveRateLimitMiddleware(
  baseConfig: RateLimitConfig,
  options?: {
    store?: RateLimitStore;
    userLimits?: Record<string, number>; // role -> limit multiplier
    endpointLimits?: Record<string, number>; // endpoint -> limit override
  }
) {
  // Initialize store with default if not provided
  const store = options?.store || new MemoryRateLimitStore();

  // Generate a unique key for rate limiting based on user, role, and endpoint
  const keyGenerator = (req: AuthenticatedRequest) => {
    const userId = req.user?.id;
    const ip = req.ip || 'unknown';
    const endpoint = req.route?.path || req.path || 'unknown';
    const userRole = req.user?.roles?.[0]?.name || 'anonymous';

    return `${userRole}:${userId || ip}:${endpoint}`;
  };

  // Handle rate limit exceeded events
  const onLimitReached = async (req: AuthenticatedRequest, res: Response) => {
    const userRole = req.user?.roles?.[0]?.name || 'anonymous';
    
    // Log security event for rate limit exceeded
    const event: Omit<SecurityEvent, 'id' | 'timestamp'> & { id: string; timestamp: Date } = {
      id: randomUUID(),
      type: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: userRole === 'admin' ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
      timestamp: new Date(),
      userId: req.user?.id,
      sessionId: req.sessionID,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent') || '',
      resource: req.path,
      action: 'RATE_LIMIT_EXCEEDED',
      outcome: 'blocked',
      details: {
        userRole,
        endpoint: req.path
      }
    };
    await auditLogger.logSecurityEvent(event);

    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      details: {
        message: `Rate limit exceeded for ${userRole} users`,
        retryAfter: baseConfig.windowMs / 1000
      }
    });
  };

  // Create and return the rate limit middleware with the adaptive configuration
  return createRateLimitMiddleware(baseConfig, {
    store,
    keyGenerator,
    onLimitReached
  });
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter {
  private windows = new Map<string, number[]>();
  private windowSize: number;
  private maxRequests: number;

  constructor(windowSizeMs: number, maxRequests: number) {
    this.windowSize = windowSizeMs;
    this.maxRequests = maxRequests;

    // Cleanup old windows periodically
    setInterval(() => this.cleanup(), windowSizeMs / 10);
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const window = this.windows.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = window.filter(timestamp => now - timestamp < this.windowSize);
    
    // Check if we can allow this request
    if (validRequests.length >= this.maxRequests) {
      this.windows.set(key, validRequests);
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.windows.set(key, validRequests);
    return true;
  }

  getRemainingRequests(key: string): number {
    const now = Date.now();
    const window = this.windows.get(key) || [];
    const validRequests = window.filter(timestamp => now - timestamp < this.windowSize);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }

  getResetTime(key: string): Date {
    const window = this.windows.get(key) || [];
    if (window.length === 0) {
      return new Date(Date.now() + this.windowSize);
    }

    const oldestRequest = Math.min(...window);
    return new Date(oldestRequest + this.windowSize);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, window] of this.windows.entries()) {
      const validRequests = window.filter(timestamp => now - timestamp < this.windowSize);
      if (validRequests.length === 0) {
        this.windows.delete(key);
      } else {
        this.windows.set(key, validRequests);
      }
    }
  }
}

/**
 * Circuit breaker pattern for external services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }
}

// Pre-configured rate limiters for common use cases
export const RateLimitPresets = {
  // Strict limits for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false
  },

  // Moderate limits for API endpoints
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
    skipSuccessfulRequests: true,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false
  },

  // Generous limits for static content
  static: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000,
    skipSuccessfulRequests: true,
    skipFailedRequests: true,
    standardHeaders: false,
    legacyHeaders: false
  },

  // Very strict limits for sensitive operations
  sensitive: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    standardHeaders: true,
    legacyHeaders: false
  }
};