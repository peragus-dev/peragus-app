/**
 * Graceful Degradation Manager
 * Provides fallback mechanisms and service degradation strategies
 */

import { EventEmitter } from 'events';
import {
  DegradationConfigSchema,
  DegradationLevel,
  type DegradationConfig,
  type DegradationState,
  type ErrorRecoveryEvent} from '../types/index.mjs';

export class GracefulDegradationManager extends EventEmitter {
  private readonly serviceId: string;
  private config: DegradationConfig;
  private currentState: DegradationState;
  private fallbackCache = new Map<string, { data: any; timestamp: Date; ttl: number }>();
  private rateLimitTracker = new Map<string, { count: number; resetTime: Date }>();
  private readonly startTime = new Date();

  constructor(serviceId: string, config: Partial<DegradationConfig> = {}) {
    super();
    this.serviceId = serviceId;
    this.config = DegradationConfigSchema.parse(config);
    
    this.currentState = {
      currentLevel: DegradationLevel.NONE,
      activeSince: new Date(),
      reason: 'Initial state',
      affectedServices: [],
      fallbacksActive: [],
      metrics: {
        requestsServed: 0,
        fallbacksUsed: 0,
        cacheHits: 0,
        cacheMisses: 0
      }
    };

    // Start cleanup intervals
    this.startCleanupTasks();
  }

  /**
   * Execute function with degradation protection
   */
  async execute<T>(
    operationName: string,
    primaryFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>
  ): Promise<T> {
    this.currentState.metrics.requestsServed++;

    // Check if operation is disabled at current degradation level
    if (this.isOperationDisabled(operationName)) {
      if (fallbackFn) {
        return this.executeFallback(operationName, fallbackFn);
      } else {
        throw new Error(`Operation '${operationName}' is disabled due to degradation level: ${this.currentState.currentLevel}`);
      }
    }

    // Check rate limiting
    if (this.isRateLimited(operationName)) {
      if (fallbackFn) {
        return this.executeFallback(operationName, fallbackFn);
      } else {
        throw new Error(`Operation '${operationName}' is rate limited`);
      }
    }

    try {
      // Try primary operation
      const result = await primaryFn();
      this.recordSuccess(operationName);
      return result;
    } catch (error) {
      // Try fallback if available
      if (fallbackFn) {
        return this.executeFallback(operationName, fallbackFn);
      } else {
        throw error;
      }
    }
  }

  /**
   * Execute with cached fallback
   */
  async executeWithCache<T>(
    operationName: string,
    primaryFn: () => Promise<T>,
    cacheKey: string,
    ttl?: number
  ): Promise<T> {
    this.currentState.metrics.requestsServed++;

    // Check cache first if degraded
    if (this.currentState.currentLevel !== DegradationLevel.NONE) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.currentState.metrics.cacheHits++;
        this.emitEvent('cache_hit', { operationName, cacheKey });
        return cached;
      } else {
        this.currentState.metrics.cacheMisses++;
      }
    }

    try {
      // Try primary operation
      const result = await primaryFn();
      
      // Cache result if caching is enabled
      if (this.config.cacheSettings.enabled) {
        this.setCache(cacheKey, result, ttl || this.config.cacheSettings.ttl);
      }
      
      this.recordSuccess(operationName);
      return result;
    } catch (error) {
      // Try cache as fallback
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.currentState.metrics.cacheHits++;
        this.currentState.metrics.fallbacksUsed++;
        this.emitEvent('fallback_cache_used', { operationName, cacheKey, error: (error as Error).message });
        return cached;
      }
      
      this.currentState.metrics.cacheMisses++;
      throw error;
    }
  }

  /**
   * Set degradation level
   */
  setDegradationLevel(level: DegradationLevel, reason: string, affectedServices: string[] = []): void {
    const previousLevel = this.currentState.currentLevel;
    
    if (previousLevel === level) {
      return; // No change
    }

    this.currentState = {
      currentLevel: level,
      activeSince: new Date(),
      reason,
      affectedServices,
      fallbacksActive: this.getFallbacksForLevel(level),
      metrics: {
        ...this.currentState.metrics
      }
    };

    // Update configuration based on level
    this.updateConfigForLevel(level);

    this.emitEvent(
      level === DegradationLevel.NONE ? 'degradation_deactivated' : 'degradation_activated',
      {
        previousLevel,
        currentLevel: level,
        reason,
        affectedServices,
        fallbacksActive: this.currentState.fallbacksActive
      }
    );
  }

  /**
   * Get current degradation state
   */
  getCurrentState(): DegradationState {
    return { ...this.currentState };
  }

  /**
   * Check if operation is disabled
   */
  isOperationDisabled(operationName: string): boolean {
    return this.config.disabledFeatures.includes(operationName);
  }

  /**
   * Check if operation is rate limited
   */
  isRateLimited(operationName: string): boolean {
    if (!this.config.rateLimiting.enabled) {
      return false;
    }

    const now = new Date();
    const tracker = this.rateLimitTracker.get(operationName);

    if (!tracker || now >= tracker.resetTime) {
      // Reset or initialize tracker
      this.rateLimitTracker.set(operationName, {
        count: 1,
        resetTime: new Date(now.getTime() + 60000) // 1 minute window
      });
      return false;
    }

    tracker.count++;
    return tracker.count > this.config.rateLimiting.requestsPerMinute;
  }

  /**
   * Add fallback function
   */
  addFallback(name: string, fallbackFn: () => Promise<any>): void {
    this.config.fallbacks[name] = fallbackFn;
  }

  /**
   * Remove fallback function
   */
  removeFallback(name: string): void {
    delete this.config.fallbacks[name];
  }

  /**
   * Get available fallbacks
   */
  getAvailableFallbacks(): string[] {
    return Object.keys(this.config.fallbacks);
  }

  /**
   * Execute specific fallback
   */
  async executeFallback<T>(operationName: string, fallbackFn: () => Promise<T>): Promise<T> {
    this.currentState.metrics.fallbacksUsed++;
    
    if (!this.currentState.fallbacksActive.includes(operationName)) {
      this.currentState.fallbacksActive.push(operationName);
    }

    try {
      const result = await fallbackFn();
      this.emitEvent('fallback_success', { operationName });
      return result;
    } catch (error) {
      this.emitEvent('fallback_failed', { operationName, error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Cache management
   */
  setCache(key: string, data: any, ttl: number): void {
    if (!this.config.cacheSettings.enabled) {
      return;
    }

    // Check cache size limit
    if (this.fallbackCache.size >= this.config.cacheSettings.maxSize) {
      // Remove oldest entry
      const oldestKey = Array.from(this.fallbackCache.keys())[0];
      if (oldestKey) {
        this.fallbackCache.delete(oldestKey);
      }
    }

    this.fallbackCache.set(key, {
      data,
      timestamp: new Date(),
      ttl
    });
  }

  getFromCache(key: string): any | null {
    if (!this.config.cacheSettings.enabled) {
      return null;
    }

    const cached = this.fallbackCache.get(key);
    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    const expiryTime = cached.timestamp.getTime() + cached.ttl;
    
    if (now > expiryTime) {
      this.fallbackCache.delete(key);
      return null;
    }

    return cached.data;
  }

  clearCache(): void {
    this.fallbackCache.clear();
    this.emitEvent('cache_cleared', {});
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    entries: Array<{ key: string; timestamp: Date; ttl: number }>;
  } {
    const totalRequests = this.currentState.metrics.cacheHits + this.currentState.metrics.cacheMisses;
    const hitRate = totalRequests > 0 ? this.currentState.metrics.cacheHits / totalRequests : 0;

    const entries = Array.from(this.fallbackCache.entries()).map(([key, value]) => ({
      key,
      timestamp: value.timestamp,
      ttl: value.ttl
    }));

    return {
      size: this.fallbackCache.size,
      maxSize: this.config.cacheSettings.maxSize,
      hitRate,
      entries
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<DegradationConfig>): void {
    const newConfig = { ...this.config, ...config };
    this.config = DegradationConfigSchema.parse(newConfig);

    this.emitEvent('config_updated', {
      config: this.config
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): DegradationConfig {
    return { ...this.config };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.currentState.metrics = {
      requestsServed: 0,
      fallbacksUsed: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    this.emitEvent('metrics_reset', {});
  }

  /**
   * Get uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  /**
   * Record successful operation
   */
  private recordSuccess(operationName: string): void {
    // Remove from active fallbacks if it was there
    const index = this.currentState.fallbacksActive.indexOf(operationName);
    if (index > -1) {
      this.currentState.fallbacksActive.splice(index, 1);
    }
  }

  /**
   * Get fallbacks for degradation level
   */
  private getFallbacksForLevel(level: DegradationLevel): string[] {
    switch (level) {
      case DegradationLevel.NONE:
        return [];
      case DegradationLevel.PARTIAL:
        return Object.keys(this.config.fallbacks).slice(0, 2);
      case DegradationLevel.MINIMAL:
        return Object.keys(this.config.fallbacks).slice(0, 4);
      case DegradationLevel.EMERGENCY:
        return Object.keys(this.config.fallbacks);
      default:
        return [];
    }
  }

  /**
   * Update configuration based on degradation level
   */
  private updateConfigForLevel(level: DegradationLevel): void {
    switch (level) {
      case DegradationLevel.NONE:
        this.config.cacheSettings.enabled = false;
        this.config.rateLimiting.enabled = false;
        this.config.disabledFeatures = [];
        break;
      
      case DegradationLevel.PARTIAL:
        this.config.cacheSettings.enabled = true;
        this.config.rateLimiting.enabled = true;
        this.config.rateLimiting.requestsPerMinute = Math.floor(this.config.rateLimiting.requestsPerMinute * 0.8);
        break;
      
      case DegradationLevel.MINIMAL:
        this.config.cacheSettings.enabled = true;
        this.config.rateLimiting.enabled = true;
        this.config.rateLimiting.requestsPerMinute = Math.floor(this.config.rateLimiting.requestsPerMinute * 0.5);
        break;
      
      case DegradationLevel.EMERGENCY:
        this.config.cacheSettings.enabled = true;
        this.config.rateLimiting.enabled = true;
        this.config.rateLimiting.requestsPerMinute = Math.floor(this.config.rateLimiting.requestsPerMinute * 0.2);
        break;
    }
  }

  /**
   * Start cleanup tasks
   */
  private startCleanupTasks(): void {
    // Clean expired cache entries every 5 minutes
    setInterval(() => {
      this.cleanExpiredCache();
    }, 300000);

    // Reset rate limit trackers every minute
    setInterval(() => {
      this.cleanRateLimitTrackers();
    }, 60000);
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, value] of this.fallbackCache.entries()) {
      const expiryTime = value.timestamp.getTime() + value.ttl;
      if (now > expiryTime) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.fallbackCache.delete(key));

    if (expiredKeys.length > 0) {
      this.emitEvent('cache_cleanup', { expiredEntries: expiredKeys.length });
    }
  }

  /**
   * Clean rate limit trackers
   */
  private cleanRateLimitTrackers(): void {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, tracker] of this.rateLimitTracker.entries()) {
      if (now >= tracker.resetTime) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.rateLimitTracker.delete(key));
  }

  /**
   * Emit degradation event
   */
  private emitEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `deg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: this.serviceId,
      timestamp: new Date(),
      data: {
        degradationLevel: this.currentState.currentLevel,
        state: this.currentState,
        config: this.config,
        ...data
      },
      severity: type.includes('activated') ? 'high' : 'medium'
    };

    this.emit('event', event);
    this.emit(type, event);
  }
}

/**
 * Global Degradation Manager for multiple services
 */
export class GlobalDegradationManager {
  private readonly degradationManagers = new Map<string, GracefulDegradationManager>();
  private readonly defaultConfig: DegradationConfig;
  private globalDegradationLevel: DegradationLevel = DegradationLevel.NONE;

  constructor(defaultConfig: Partial<DegradationConfig> = {}) {
    this.defaultConfig = DegradationConfigSchema.parse(defaultConfig);
  }

  /**
   * Get or create degradation manager for service
   */
  getDegradationManager(serviceId: string, config?: Partial<DegradationConfig>): GracefulDegradationManager {
    if (!this.degradationManagers.has(serviceId)) {
      const mergedConfig = { ...this.defaultConfig, ...config };
      const manager = new GracefulDegradationManager(serviceId, mergedConfig);
      
      // Forward events
      manager.on('event', (event) => {
        this.emit('event', event);
      });
      
      this.degradationManagers.set(serviceId, manager);
    }
    
    return this.degradationManagers.get(serviceId)!;
  }

  /**
   * Set global degradation level
   */
  setGlobalDegradationLevel(level: DegradationLevel, reason: string): void {
    this.globalDegradationLevel = level;
    
    for (const [serviceId, manager] of this.degradationManagers) {
      manager.setDegradationLevel(level, `Global degradation: ${reason}`, [serviceId]);
    }

    this.emitGlobalEvent('global_degradation_changed', {
      level,
      reason,
      affectedServices: Array.from(this.degradationManagers.keys())
    });
  }

  /**
   * Get global degradation level
   */
  getGlobalDegradationLevel(): DegradationLevel {
    return this.globalDegradationLevel;
  }

  /**
   * Get all service states
   */
  getAllServiceStates(): Record<string, DegradationState> {
    const states: Record<string, DegradationState> = {};
    
    for (const [serviceId, manager] of this.degradationManagers) {
      states[serviceId] = manager.getCurrentState();
    }
    
    return states;
  }

  /**
   * Get system degradation summary
   */
  getSystemSummary(): {
    globalLevel: DegradationLevel;
    serviceCount: number;
    degradedServices: number;
    totalRequests: number;
    totalFallbacks: number;
    cacheHitRate: number;
  } {
    const states = this.getAllServiceStates();
    const services = Object.values(states);

    const serviceCount = services.length;
    const degradedServices = services.filter(s => s.currentLevel !== DegradationLevel.NONE).length;
    const totalRequests = services.reduce((sum, s) => sum + s.metrics.requestsServed, 0);
    const totalFallbacks = services.reduce((sum, s) => sum + s.metrics.fallbacksUsed, 0);
    
    const totalCacheRequests = services.reduce((sum, s) => sum + s.metrics.cacheHits + s.metrics.cacheMisses, 0);
    const totalCacheHits = services.reduce((sum, s) => sum + s.metrics.cacheHits, 0);
    const cacheHitRate = totalCacheRequests > 0 ? totalCacheHits / totalCacheRequests : 0;

    return {
      globalLevel: this.globalDegradationLevel,
      serviceCount,
      degradedServices,
      totalRequests,
      totalFallbacks,
      cacheHitRate
    };
  }

  /**
   * Remove degradation manager
   */
  remove(serviceId: string): void {
    const manager = this.degradationManagers.get(serviceId);
    if (manager) {
      manager.removeAllListeners();
      this.degradationManagers.delete(serviceId);
    }
  }

  /**
   * Emit global event
   */
  private emitGlobalEvent(type: string, data: Record<string, any>): void {
    const event: ErrorRecoveryEvent = {
      id: `global_deg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: type as any,
      serviceId: 'global-degradation-manager',
      timestamp: new Date(),
      data,
      severity: 'high'
    };

    this.emit('event', event);
    this.emit(type, event);
  }

  // EventEmitter methods
  private listeners: Map<string, Function[]> = new Map();

  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
}