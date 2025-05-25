import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/security.mjs';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: {
    directives?: Record<string, string | string[]>;
    reportOnly?: boolean;
    reportUri?: string;
  };
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  frameOptions?: 'DENY' | 'SAMEORIGIN' | string;
  contentTypeOptions?: boolean;
  xssProtection?: boolean;
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless';
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none';
  crossOriginResourcePolicy?: 'same-site' | 'same-origin' | 'cross-origin';
}

/**
 * Security headers middleware
 */
export function createSecurityHeadersMiddleware(config?: SecurityHeadersConfig) {
  // The request parameter is part of the middleware signature but not used directly
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Content Security Policy
    if (config?.contentSecurityPolicy) {
      const cspConfig = config?.contentSecurityPolicy || {};
      const directives = {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'media-src': ["'self'"],
        'object-src': ["'none'"],
        'child-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        ...cspConfig.directives
      };

      const cspValue = Object.entries(directives)
        .map(([directive, sources]) => `${directive} ${Array.isArray(sources) ? sources.join(' ') : sources}`)
        .join('; ');

      const headerName = cspConfig.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
      res.setHeader(headerName, cspValue);

      if (cspConfig.reportUri) {
        res.setHeader('Report-To', JSON.stringify({
          group: 'csp-endpoint',
          max_age: 10886400,
          endpoints: [{ url: cspConfig.reportUri }]
        }));
      }
    }

    // HSTS (HTTP Strict Transport Security)
    if (config?.hsts) {
      const hstsConfig = config?.hsts || {};
      const maxAge = hstsConfig.maxAge || 31536000; // 1 year default
      let hstsValue = `max-age=${maxAge}`;
      
      if (hstsConfig.includeSubDomains !== false) {
        hstsValue += '; includeSubDomains';
      }
      
      if (hstsConfig.preload) {
        hstsValue += '; preload';
      }
      
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // X-Frame-Options
    if (config?.frameOptions) {
      const frameOptions = config?.frameOptions || 'DENY';
      res.setHeader('X-Frame-Options', frameOptions);
    }

    // X-Content-Type-Options
    if (config?.contentTypeOptions !== false) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    if (config?.xssProtection !== false) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Referrer-Policy
    if (config?.referrerPolicy) {
      const referrerPolicy = config?.referrerPolicy || 'strict-origin-when-cross-origin';
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    // Permissions-Policy (formerly Feature-Policy)
    if (config?.permissionsPolicy) {
      const policies = Object.entries(config.permissionsPolicy)
        .map(([feature, allowlist]) => `${feature}=(${allowlist.join(' ')})`)
        .join(', ');
      res.setHeader('Permissions-Policy', policies);
    }

    // Cross-Origin-Embedder-Policy
    if (config?.crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', config.crossOriginEmbedderPolicy);
    }

    // Cross-Origin-Opener-Policy
    if (config?.crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', config.crossOriginOpenerPolicy);
    }

    // Cross-Origin-Resource-Policy
    if (config?.crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', config.crossOriginResourcePolicy);
    }

    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    next();
  };
}

/**
 * CORS middleware with security considerations
 */
export function createSecureCORSMiddleware(options?: {
  origin?: string | string[] | boolean | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void);
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
}) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    // These are used in the CORS logic but not directly referenced
    // const requestMethod = req.headers['access-control-request-method'];
    // const requestHeaders = req.headers['access-control-request-headers'];

    // Handle origin
    if (options?.origin) {
      if (typeof options.origin === 'boolean') {
        if (options.origin) {
          res.setHeader('Access-Control-Allow-Origin', '*');
        }
      } else if (typeof options.origin === 'string') {
        res.setHeader('Access-Control-Allow-Origin', options.origin);
      } else if (Array.isArray(options.origin)) {
        if (origin && options.origin.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
        }
      } else if (typeof options.origin === 'function') {
        options.origin(origin, (err, allow) => {
          if (err) {
            return next(err);
          }
          if (allow && origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
          }
        });
      }
    }

    // Handle methods
    if (options?.methods) {
      res.setHeader('Access-Control-Allow-Methods', options.methods.join(', '));
    } else {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }

    // Handle headers
    if (options?.allowedHeaders) {
      res.setHeader('Access-Control-Allow-Headers', options.allowedHeaders.join(', '));
    } else if (req.headers['access-control-request-headers']) {
      res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
    } else {
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
    }

    // Handle credentials
    if (options?.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle max age
    if (options?.maxAge) {
      res.setHeader('Access-Control-Max-Age', options.maxAge.toString());
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(options?.optionsSuccessStatus || 204).end();
      return;
    }

    next();
  };
}

/**
 * Security middleware that removes sensitive information from responses
 */
export function createResponseSanitizationMiddleware() {
  // The request parameter is part of the middleware signature but not used directly
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Override res.json to sanitize responses
    const originalJson = res.json;
    
    res.json = function(obj: any) {
      if (obj && typeof obj === 'object') {
        // Remove sensitive fields from responses
        const sanitized = sanitizeResponseObject(obj);
        return originalJson.call(this, sanitized);
      }
      return originalJson.call(this, obj);
    };

    next();
  };
}

/**
 * Sanitize response object by removing sensitive fields
 */
function sanitizeResponseObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeResponseObject);
  }

  const sensitiveFields = [
    'password',
    'secret',
    'token',
    'key',
    'hash',
    'salt',
    'private',
    'confidential',
    'internal',
    'debug'
  ];

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Skip sensitive fields
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeResponseObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Middleware to prevent information disclosure in error responses
 */
export function createErrorSanitizationMiddleware() {
  // The next parameter is part of the error handling middleware signature but not used directly
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error: any, _req: AuthenticatedRequest, res: Response, _next: NextFunction): void => {
    // Don't expose stack traces in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const sanitizedError: any = {
      success: false,
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR'
    };

    // Only include stack trace in development
    if (isDevelopment && error.stack) {
      sanitizedError.stack = error.stack;
    }

    // Include additional details if they exist and are safe
    if (error.details && typeof error.details === 'object') {
      sanitizedError.details = sanitizeResponseObject(error.details);
    }

    const statusCode = error.statusCode || error.status || 500;
    res.status(statusCode).json(sanitizedError);
  };
}

/**
 * Middleware to add security-related response headers for API responses
 */
export function createAPISecurityMiddleware() {
  // The request parameter is part of the middleware signature but not used directly
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (_req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // Prevent caching of sensitive API responses
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // Add security headers specific to API responses
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Ensure JSON content type for API responses
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }

    next();
  };
}

/**
 * Pre-configured security header sets
 */
export const SecurityHeaderPresets = {
  // Strict security for production APIs
  strict: {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'none'"],
        'script-src': ["'none'"],
        'style-src': ["'none'"],
        'img-src': ["'none'"],
        'font-src': ["'none'"],
        'connect-src': ["'none'"],
        'media-src': ["'none'"],
        'object-src': ["'none'"],
        'child-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameOptions: 'DENY',
    contentTypeOptions: true,
    xssProtection: true,
    referrerPolicy: 'no-referrer',
    crossOriginEmbedderPolicy: 'require-corp' as const,
    crossOriginOpenerPolicy: 'same-origin' as const,
    crossOriginResourcePolicy: 'same-origin' as const
  },

  // Moderate security for web applications
  web: {
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'font-src': ["'self'", 'https:'],
        'connect-src': ["'self'"],
        'media-src': ["'self'"],
        'object-src': ["'none'"],
        'child-src': ["'self'"],
        'frame-ancestors': ["'self'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true
    },
    frameOptions: 'SAMEORIGIN',
    contentTypeOptions: true,
    xssProtection: true,
    referrerPolicy: 'strict-origin-when-cross-origin'
  },

  // Relaxed security for development
  development: {
    contentSecurityPolicy: false,
    hsts: false,
    frameOptions: 'SAMEORIGIN',
    contentTypeOptions: true,
    xssProtection: true,
    referrerPolicy: 'strict-origin-when-cross-origin'
  }
};