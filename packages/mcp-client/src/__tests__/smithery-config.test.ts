import { describe, it, expect } from 'vitest';
import {
  createSmitheryUrl,
  parseDotNotationConfig,
  decodeBase64Config,
  validateConfigWithSchema,
  mergeConfigurations,
  ConfigTransformer,
  ConfigCache
} from '../smithery/config.mjs';
import { z } from 'zod';

describe('Smithery Configuration', () => {
  describe('createSmitheryUrl', () => {
    it('should generate valid authenticated URLs', () => {
      const url = createSmitheryUrl('https://server.example.com', {
        apiKey: 'test-key',
        profile: 'dev',
        config: { debug: true }
      });
      
      expect(url.pathname).toBe('/mcp');
      expect(url.searchParams.get('api_key')).toBe('test-key');
      expect(url.searchParams.get('profile')).toBe('dev');
      expect(url.searchParams.has('config')).toBe(true);
    });
    
    it('should handle URLs already ending with /mcp', () => {
      const url = createSmitheryUrl('https://server.example.com/mcp', {
        apiKey: 'test-key'
      });
      
      expect(url.pathname).toBe('/mcp');
      expect(url.href).not.toContain('/mcp/mcp');
    });
    
    it('should work without options', () => {
      const url = createSmitheryUrl('https://server.example.com');
      
      expect(url.pathname).toBe('/mcp');
      expect(url.searchParams.toString()).toBe('');
    });
  });
  
  describe('parseDotNotationConfig', () => {
    it('should parse dot-notation parameters', () => {
      const params = new URLSearchParams({
        'server.host': 'localhost',
        'server.port': '8080',
        'debug': 'true',
        'nested.deep.value': '42'
      });
      
      const config = parseDotNotationConfig(params);
      
      expect(config).toEqual({
        server: {
          host: 'localhost',
          port: 8080
        },
        debug: true,
        nested: {
          deep: {
            value: 42
          }
        }
      });
    });
    
    it('should skip reserved parameters', () => {
      const params = new URLSearchParams({
        'config': 'should-be-ignored',
        'api_key': 'should-be-ignored',
        'profile': 'should-be-ignored',
        'valid.param': 'included'
      });
      
      const config = parseDotNotationConfig(params);
      
      expect(config).toEqual({
        valid: {
          param: 'included'
        }
      });
    });
    
    it('should handle plain objects', () => {
      const params = {
        'server.host': 'localhost',
        'server.port': '8080'
      };
      
      const config = parseDotNotationConfig(params);
      
      expect(config).toEqual({
        server: {
          host: 'localhost',
          port: 8080
        }
      });
    });
  });
  
  describe('decodeBase64Config', () => {
    it('should decode base64 encoded config', () => {
      const original = { test: 'value', nested: { prop: 123 } };
      const encoded = Buffer.from(JSON.stringify(original)).toString('base64');
      
      const decoded = decodeBase64Config(encoded);
      
      expect(decoded).toEqual(original);
    });
    
    it('should throw on invalid base64', () => {
      expect(() => decodeBase64Config('invalid-base64!')).toThrow();
    });
  });
  
  describe('validateConfigWithSchema', () => {
    const schema = z.object({
      server: z.object({
        host: z.string(),
        port: z.number().min(1).max(65535)
      }),
      debug: z.boolean().optional()
    });
    
    it('should validate valid config', () => {
      const config = {
        server: { host: 'localhost', port: 8080 },
        debug: true
      };
      
      const result = validateConfigWithSchema(config, schema);
      
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(config);
      expect(result.errors).toBeUndefined();
    });
    
    it('should provide detailed errors for invalid config', () => {
      const config = {
        server: { host: 123, port: 99999 }
      };
      
      const result = validateConfigWithSchema(config, schema);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(2);
      
      const hostError = result.errors!.find(e => e.param === 'server.host');
      expect(hostError).toBeDefined();
      expect(hostError!.received).toBe(123);
      
      const portError = result.errors!.find(e => e.param === 'server.port');
      expect(portError).toBeDefined();
      expect(portError!.received).toBe(99999);
    });
  });
  
  describe('mergeConfigurations', () => {
    it('should merge configs with correct priority', () => {
      const base = { a: 1, b: { c: 2 } };
      const override1 = { b: { d: 3 } };
      const override2 = { a: 4, b: { c: 5 } };
      
      const merged = mergeConfigurations(base, override1, override2);
      
      expect(merged).toEqual({
        a: 4,
        b: { c: 5, d: 3 }
      });
    });
    
    it('should handle undefined sources', () => {
      const config = { test: 'value' };
      const merged = mergeConfigurations(undefined, config, undefined);
      
      expect(merged).toEqual(config);
    });
  });
  
  describe('ConfigTransformer', () => {
    it('should transform legacy config to Smithery format', () => {
      const legacy = {
        host: 'localhost',
        port: 8080,
        other: 'value'
      };
      
      const smithery = ConfigTransformer.toSmithery(legacy);
      
      expect(smithery).toEqual({
        server: {
          host: 'localhost',
          port: 8080
        },
        other: 'value'
      });
    });
    
    it('should transform Smithery config back to legacy', () => {
      const smithery = {
        server: {
          host: 'localhost',
          port: 8080
        },
        other: 'value'
      };
      
      const legacy = ConfigTransformer.fromSmithery(smithery);
      
      expect(legacy).toEqual({
        host: 'localhost',
        port: 8080,
        other: 'value'
      });
    });
  });
  
  describe('ConfigCache', () => {
    it('should cache and retrieve configs', () => {
      const cache = new ConfigCache(1000);
      const config = { test: 'value' };
      
      cache.set('key1', config);
      
      expect(cache.get('key1')).toEqual(config);
      expect(cache.get('nonexistent')).toBeNull();
    });
    
    it('should expire cached configs after TTL', async () => {
      const cache = new ConfigCache(100); // 100ms TTL
      const config = { test: 'value' };
      
      cache.set('key1', config);
      expect(cache.get('key1')).toEqual(config);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(cache.get('key1')).toBeNull();
    });
    
    it('should clear all cached configs', () => {
      const cache = new ConfigCache();
      
      cache.set('key1', { a: 1 });
      cache.set('key2', { b: 2 });
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });
});