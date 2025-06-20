import { z } from 'zod';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, ValidationSchema, FieldErrorDetail, ValidationResult } from '../types/security.mts';
import { ValidationError as ValidationErrorClass } from '../types/security.mts';
import { auditLogger } from '../audit/logger.mjs';
import { SecurityEventType, SecuritySeverity } from '../types/security.mts';

// Path traversal prevention patterns
const DANGEROUS_PATH_PATTERNS = [
  /\.\./,           // Parent directory traversal
  /\/\//,           // Double slashes
  /\\\\|\\\//,      // Windows path separators
  /\0/,             // Null bytes
  /%2e%2e/i,        // URL encoded ..
  /%2f/i,           // URL encoded /
  /%5c/i,           // URL encoded \
  /\$\{.*\}/,       // Template injection
  /`.*`/,           // Backtick injection
  /\|/,             // Pipe commands
  /;/,              // Command chaining
  /&/,              // Command chaining
  />/,              // Output redirection
  /</,              // Input redirection
];

// Command injection prevention patterns
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$(){}[\]]/,  // Shell metacharacters
  /\$\(.*\)/,        // Command substitution
  /`.*`/,            // Backtick execution
  /\|\|/,            // OR operator
  /&&/,              // AND operator
  />/,               // Redirection
  /</,               // Redirection
  /\*/,              // Wildcards
  /\?/,              // Wildcards
];

// SQL injection prevention patterns
const SQL_INJECTION_PATTERNS = [
  /('|(\\')|(;)|(\\;))/i,                    // Single quotes and semicolons
  /((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,  // 'or
  /((\%27)|(\'))((\%75)|u|(\%55))((\%6E)|n|(\%4E))((\%69)|i|(\%49))((\%6F)|o|(\%4F))((\%6E)|n|(\%4E))/i, // 'union
  /((\%27)|(\'))((\%73)|s|(\%53))((\%65)|e|(\%45))((\%6C)|l|(\%4C))((\%65)|e|(\%45))((\%63)|c|(\%43))((\%74)|t|(\%54))/i, // 'select
  /exec(\s|\+)+(s|x)p\w+/i,                 // exec stored procedures
  /union[\s\w]*select/i,                    // union select
  /select[\s\w]*from/i,                     // select from
  /insert[\s\w]*into/i,                     // insert into
  /delete[\s\w]*from/i,                     // delete from
  /update[\s\w]*set/i,                      // update set
  /drop[\s\w]*table/i,                      // drop table
];

// XSS prevention patterns
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,           // Script tags
  /<iframe[^>]*>.*?<\/iframe>/gi,           // Iframe tags
  /<object[^>]*>.*?<\/object>/gi,           // Object tags
  /<embed[^>]*>/gi,                         // Embed tags
  /<link[^>]*>/gi,                          // Link tags
  /<meta[^>]*>/gi,                          // Meta tags
  /javascript:/gi,                          // JavaScript protocol
  /vbscript:/gi,                            // VBScript protocol
  /data:/gi,                                // Data protocol
  /on\w+\s*=/gi,                            // Event handlers
  /expression\s*\(/gi,                      // CSS expressions
  /url\s*\(/gi,                             // CSS url()
];

export class InputValidator {
  /**
   * Validate file paths to prevent path traversal attacks
   */
  static validateFilePath(path: string): ValidationResult {
    const errors: FieldErrorDetail[] = [];

    if (!path || typeof path !== 'string') {
      errors.push({
        field: 'path',
        message: 'Path is required and must be a string',
        value: path,
        code: 'INVALID_PATH_TYPE'
      });
      return { isValid: false, errors };
    }

    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATH_PATTERNS) {
      if (pattern.test(path)) {
        errors.push({
          field: 'path',
          message: 'Path contains potentially dangerous characters',
          value: path,
          code: 'DANGEROUS_PATH_PATTERN'
        });
      }
    }

    // Normalize and validate path
    const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/');
    
    // Check if path tries to escape base directory
    if (normalizedPath.includes('../') || normalizedPath.startsWith('/')) {
      errors.push({
        field: 'path',
        message: 'Path must not escape base directory',
        value: path,
        code: 'PATH_TRAVERSAL_ATTEMPT'
      });
    }

    // Check path length
    if (path.length > 255) {
      errors.push({
        field: 'path',
        message: 'Path is too long (max 255 characters)',
        value: path,
        code: 'PATH_TOO_LONG'
      });
    }

    const sanitizedPath = this.sanitizePath(normalizedPath);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedPath
    };
  }

  /**
   * Validate command strings to prevent command injection
   */
  static validateCommand(command: string): ValidationResult {
    const errors: FieldErrorDetail[] = [];

    if (!command || typeof command !== 'string') {
      errors.push({
        field: 'command',
        message: 'Command is required and must be a string',
        value: command,
        code: 'INVALID_COMMAND_TYPE'
      });
      return { isValid: false, errors };
    }
    
    // Ensure command is a non-empty string after this point
    const commandStr = String(command);

    // Check for command injection patterns
    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(commandStr)) {
        errors.push({
          field: 'command',
          message: 'Command contains potentially dangerous characters for command injection.',
          value: commandStr,
          code: 'DANGEROUS_COMMAND_PATTERN'
        });
      }
    }

    // Whitelist allowed commands
    const allowedCommands = ['npm', 'node', 'prettier', 'tsc', 'eslint'];
    const commandParts = commandStr.trim().split(/\s+/);
    if (commandParts.length === 0) {
      errors.push({
        field: 'command',
        message: 'Empty command provided',
        value: commandStr,
        code: 'EMPTY_COMMAND'
      });
      return { isValid: false, errors };
    }
    
    const baseCommand = commandParts[0];
    if (!baseCommand) {
      errors.push({
        field: 'command',
        message: 'Invalid command format',
        value: commandStr,
        code: 'INVALID_COMMAND_FORMAT'
      });
      return { isValid: false, errors };
    }
    
    if (!allowedCommands.includes(baseCommand)) {
      errors.push({
        field: 'command',
        message: `Command '${baseCommand}' is not allowed`,
        value: commandStr,
        code: 'COMMAND_NOT_ALLOWED'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: command.trim()
    };
  }

  /**
   * Validate SQL queries to prevent SQL injection
   */
  static validateSQLQuery(query: string): ValidationResult {
    const errors: FieldErrorDetail[] = [];

    if (!query || typeof query !== 'string') {
      errors.push({
        field: 'query',
        message: 'SQL query is required and must be a string',
        value: query,
        code: 'INVALID_SQL_QUERY_TYPE'
      });
      return { isValid: false, errors };
    }

    // Check for SQL injection patterns
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(query)) {
        errors.push({
          field: 'query',
          message: 'SQL query contains potentially dangerous characters for SQL injection.',
          value: query,
          code: 'DANGEROUS_SQL_PATTERN'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: query.trim()
    };
  }

  /**
   * Validate and sanitize HTML content to prevent XSS
   */
  static validateHTML(html: string): ValidationResult {
    const errors: FieldErrorDetail[] = [];

    if (!html || typeof html !== 'string') {
      errors.push({
        field: 'html',
        message: 'HTML content is required and must be a string',
        value: html,
        code: 'INVALID_HTML_TYPE'
      });
      return { isValid: false, errors };
    }

    // Check for XSS patterns
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(html)) {
        errors.push({
          field: 'html',
          message: 'HTML content contains potentially dangerous characters for XSS.',
          value: html,
          code: 'DANGEROUS_HTML_PATTERN'
        });
      }
    }

    const sanitizedHTML = this.sanitizeHTML(html);

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedHTML
    };
  }

  /**
   * Sanitize file path
   */
  private static sanitizePath(path: string): string {
    return path
      .replace(/\.\./g, '')
      .replace(/\/+/g, '/')
      .replace(/^\//, '')
      .trim();
  }

  /**
   * Sanitize HTML content
   */
  private static sanitizeHTML(html: string): string {
    return html
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }
}

/**
 * Create validation middleware for request validation
 */
export function createValidationMiddleware(schema: ValidationSchema) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body, query, params, headers } = req;
      const validatedData: Record<string, unknown> = {};
      const validationErrors: FieldErrorDetail[] = [];

      if (schema.body) {
        const result = schema.body.safeParse(body);
        if (!result.success) {
          const errors: FieldErrorDetail[] = result.error.errors.map(
            (e: z.ZodIssue & { input?: unknown }) => ({
              field: e.path.join('.'),
              message: e.message,
              value: 'input' in e ? e.input : undefined,
              code: String(e.code)
            })
          );
          validationErrors.push(...errors);
        } else {
          validatedData.body = result.data;
        }
      }

      if (schema.query) {
        const result = schema.query.safeParse(query);
        if (!result.success) {
          const errors: FieldErrorDetail[] = result.error.errors.map(
            (e: z.ZodIssue & { input?: unknown }) => ({
              field: e.path.join('.'),
              message: e.message,
              value: 'input' in e ? e.input : undefined,
              code: String(e.code)
            })
          );
          validationErrors.push(...errors);
        } else {
          validatedData.query = result.data;
        }
      }

      if (schema.params) {
        const result = schema.params.safeParse(params);
        if (!result.success) {
          const errors: FieldErrorDetail[] = result.error.errors.map(
            (e: z.ZodIssue & { input?: unknown }) => ({
              field: e.path.join('.'),
              message: e.message,
              value: 'input' in e ? e.input : undefined,
              code: String(e.code)
            })
          );
          validationErrors.push(...errors);
        } else {
          validatedData.params = result.data;
        }
      }

      if (schema.headers) {
        const result = schema.headers.safeParse(headers);
        if (!result.success) {
          const errors: FieldErrorDetail[] = result.error.errors.map(
            (e: z.ZodIssue & { input?: unknown }) => ({
              field: e.path.join('.'),
              message: e.message,
              value: 'input' in e ? e.input : undefined,
              code: String(e.code)
            })
          );
          validationErrors.push(...errors);
        } else {
          // Be careful with mutating req.headers, usually not recommended
          // For validation purposes, it's better to pass validated headers separately
          // or attach to a custom request property.
          validatedData.headers = result.data;
        }
      }

      if (validationErrors.length > 0) {
        const logEvent: any = {
          type: SecurityEventType.SECURITY_VIOLATION,
          severity: SecuritySeverity.MEDIUM,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || '',
          resource: req.path || '',
          action: 'validation_failed',
          outcome: 'blocked',
          details: { errors: validationErrors, originalRequest: { body, query, params } }
        };
        if (req.user?.id) {
          logEvent.userId = req.user.id;
        }
        await auditLogger.logSecurityEvent(logEvent);
        throw new ValidationErrorClass('Validation failed', { errors: validationErrors });
      }

      // Attach validated data to request for downstream handlers
      req.validatedData = validatedData;

      next();
    } catch (error) {
      if (error instanceof ValidationErrorClass) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          details: error.details
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
 * File path validation middleware
 */
export function validateFilePathMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for file path in body, query, or params
      const filePaths: string[] = [];
      
      if (req.body?.file) filePaths.push(req.body.file);
      if (req.body?.path) filePaths.push(req.body.path);
      if (req.query?.file) filePaths.push(req.query.file as string);
      if (req.query?.path) filePaths.push(req.query.path as string);
      if (req.params?.file) filePaths.push(req.params.file);
      if (req.params?.path) filePaths.push(req.params.path);

      for (const path of filePaths) {
        const validation = InputValidator.validateFilePath(path);
        if (!validation.isValid) {
          const logEvent: any = {
            type: SecurityEventType.SECURITY_VIOLATION,
            severity: SecuritySeverity.HIGH,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path || '',
            action: 'path_traversal_attempt',
            outcome: 'blocked',
            details: { path, errors: validation.errors }
          };
          if (req.user?.id) {
            logEvent.userId = req.user.id;
          }
          await auditLogger.logSecurityEvent(logEvent);

          throw new ValidationErrorClass('Invalid file path', { errors: validation.errors });
        }
      }

      next();
    } catch (error) {
      if (error instanceof ValidationErrorClass) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          details: error.details
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
 * Command validation middleware
 */
export function validateCommandMiddleware() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check for commands in body
      if (req.body?.command) {
        const validation = InputValidator.validateCommand(req.body.command);
        if (!validation.isValid) {
          const logEvent: any = {
            type: SecurityEventType.SECURITY_VIOLATION,
            severity: SecuritySeverity.CRITICAL,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || '',
            resource: req.path || '',
            action: 'command_injection_attempt',
            outcome: 'blocked',
            details: { command: req.body.command, errors: validation.errors }
          };
          if (req.user?.id) {
            logEvent.userId = req.user.id;
          }
          await auditLogger.logSecurityEvent(logEvent);

          throw new ValidationErrorClass('Invalid command', { errors: validation.errors });
        }
        req.body.command = validation.sanitizedData;
      }

      next();
    } catch (error) {
      if (error instanceof ValidationErrorClass) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message,
          code: error.code,
          details: error.details
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

// Common validation schemas
export const CommonSchemas = {
  // File operations
  fileOperation: z.object({
    file: z.string().min(1).max(255),
    content: z.string().optional()
  }),

  // MCP tool call
  mcpToolCall: z.object({
    serverId: z.string().min(1).max(100),
    toolName: z.string().min(1).max(100),
    arguments: z.record(z.any()).optional()
  }),

  // Session operations
  sessionOperation: z.object({
    sessionId: z.string().uuid(),
    action: z.enum(['create', 'update', 'delete', 'read'])
  }),

  // User authentication
  userAuth: z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128)
  }),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
};