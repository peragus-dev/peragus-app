import type { Request, Response, NextFunction } from 'express';

// Core Security Types
export interface SecurityConfig {
  jwt: JWTConfig;
  rateLimit: RateLimitConfig;
  encryption: EncryptionConfig;
  audit: AuditConfig;
  cors: CORSConfig;
}

export interface JWTConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
  algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  store?: string; // Redis connection string
}

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
}

export interface AuditConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  destination: 'console' | 'file' | 'database';
  retention: number; // days
}

export interface CORSConfig {
  origin: string | string[] | boolean;
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

// Authentication & Authorization Types
export interface User {
  id: string;
  email: string;
  password?: string; // For authentication
  roles: Role[];
  permissions: Permission[];
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isActive: boolean;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface JWTPayload {
  sub: string; // user id
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

// Request Types
export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: JWTPayload;
  sessionID: string;  // Made required
  sessionId?: string; // Keep this for backward compatibility
  validatedData?: Record<string, unknown>;
}

export interface SecurityContext {
  user?: User;
  permissions: Set<string>;
  roles: Set<string>;
  sessionId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

// Middleware Types
export type SecurityMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export interface ValidationSchema {
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
}

export interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime: Date;
}

// Audit & Logging Types
export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;
  userId: string | undefined; // Explicitly allow undefined
  sessionId: string | undefined; // Explicitly allow undefined
  ipAddress: string;
  userAgent: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export const SecurityEventType = {
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  ACCESS_DENIED: 'access_denied',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  DATA_ACCESS: 'data_access',
  CONFIGURATION_CHANGE: 'configuration_change',
  SECURITY_VIOLATION: 'security_violation',
  SYSTEM_ERROR: 'system_error'
} as const;

export type SecurityEventType = typeof SecurityEventType[keyof typeof SecurityEventType];

export const SecuritySeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type SecuritySeverity = typeof SecuritySeverity[keyof typeof SecuritySeverity];

// Validation Types
export interface FieldErrorDetail {
  field: string;
  message: string;
  value?: any;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: FieldErrorDetail[];
  sanitizedData?: any;
}

// Encryption Types
export interface EncryptionResult {
  encrypted: string;
  iv: string;
  salt: string;
  tag?: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  salt: string;
  tag?: string;
}

// Security Headers
export interface SecurityHeaders {
  'Content-Security-Policy'?: string;
  'X-Content-Type-Options': 'nosniff';
  'X-Frame-Options': 'DENY' | 'SAMEORIGIN';
  'X-XSS-Protection': '1; mode=block';
  'Strict-Transport-Security'?: string;
  'Referrer-Policy': string;
  'Permissions-Policy'?: string;
}

// API Key Management
export interface APIKey {
  id: string;
  name: string;
  key: string;
  hashedKey: string;
  permissions: Permission[];
  isActive: boolean;
  expiresAt?: Date;
  lastUsed?: Date;
  createdBy: string;
  createdAt: Date;
}

// Session Management
export interface SecureSession {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  lastActivity: Date;
  metadata?: Record<string, any>;
}

// Threat Detection
export interface ThreatIndicator {
  type: 'ip' | 'user' | 'pattern';
  value: string;
  severity: SecuritySeverity;
  description: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface SecurityAlert {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  title: string;
  description: string;
  indicators: ThreatIndicator[];
  affectedResources: string[];
  recommendedActions: string[];
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: Date;
  updatedAt: Date;
}

// Error Types
export class SecurityError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details: Record<string, any>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details || {}; // Provide a default empty object if details is undefined
  }
}

export class AuthenticationError extends SecurityError {
  constructor(message: string = 'Authentication failed', details?: Record<string, any>) {
    super(message, 'AUTHENTICATION_FAILED', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends SecurityError {
  constructor(message: string = 'Access denied', details?: Record<string, any>) {
    super(message, 'ACCESS_DENIED', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends SecurityError {
  public readonly errors: FieldErrorDetail[];

  constructor(
    message: string = 'Validation failed', 
    details?: { errors: FieldErrorDetail[] } | FieldErrorDetail[]
  ) {
    super(message, 'VALIDATION_FAILED', 400, Array.isArray(details) ? { errors: details } : details);
    this.name = 'ValidationError';
    this.errors = Array.isArray(details) 
      ? details 
      : details?.errors || [];
  }

  // Helper method to create a ValidationError from a single error
  static fromSingleError(error: Omit<FieldErrorDetail, 'code'> & { code?: string }): ValidationError {
    const fieldError: FieldErrorDetail = {
      field: error.field,
      message: error.message,
      value: error.value,
      code: error.code || 'VALIDATION_ERROR'
    };
    return new ValidationError(error.message, [fieldError]);
  }

  // Helper method to create a ValidationError from multiple errors
  static fromErrors(errors: FieldErrorDetail[]): ValidationError {
    if (errors.length === 0) {
      return new ValidationError('Validation failed', []);
    }
    // Use the first error's message as the main message, or a default if not available
    const firstError = errors[0];
    const message = firstError?.message || 'Validation failed';
    return new ValidationError(message, errors);
  }
}

export class RateLimitError extends SecurityError {
  constructor(message: string = 'Rate limit exceeded', details?: Record<string, any>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, details);
    this.name = 'RateLimitError';
  }
}

// Configuration Validation
export interface SecurityConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Metrics Types
export interface SecurityMetrics {
  authentication: {
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    blockedAttempts: number;
  };
  authorization: {
    totalChecks: number;
    allowedRequests: number;
    deniedRequests: number;
  };
  rateLimit: {
    totalRequests: number;
    limitedRequests: number;
    blockedRequests: number;
  };
  threats: {
    detectedThreats: number;
    blockedThreats: number;
    falsePositives: number;
  };
}