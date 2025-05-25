import type { SecurityEvent, SecurityEventType, SecuritySeverity } from '../types/security.mjs';

export interface AuditLoggerConfig {
  enabled: boolean;
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  destination: 'console' | 'file' | 'database';
  retention: number; // days
}

export interface SecurityEventInput {
  type: SecurityEventType;
  severity: SecuritySeverity;
  userId: string | undefined; // Match SecurityEvent interface
  sessionId: string | undefined; // Match SecurityEvent interface
  ipAddress: string;
  userAgent: string;
  resource: string;
  action: string;
  outcome: 'success' | 'failure' | 'blocked';
  details: Record<string, any>;
  metadata?: Record<string, any>;
}

class AuditLogger {
  private config: AuditLoggerConfig;
  private events: SecurityEvent[] = [];

  constructor(config: AuditLoggerConfig) {
    this.config = config;
  }

  async logSecurityEvent(eventInput: SecurityEventInput): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const event: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...eventInput
    };

    this.events.push(event);

    // Log based on destination
    switch (this.config.destination) {
      case 'console':
        this.logToConsole(event);
        break;
      case 'file':
        await this.logToFile(event);
        break;
      case 'database':
        await this.logToDatabase(event);
        break;
    }

    // Clean up old events based on retention policy
    this.cleanupOldEvents();
  }

  async getSecurityEvents(filters?: {
    type?: SecurityEventType;
    severity?: SecuritySeverity;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<SecurityEvent[]> {
    let filteredEvents = [...this.events];

    if (filters) {
      if (filters.type) {
        filteredEvents = filteredEvents.filter(e => e.type === filters.type);
      }
      if (filters.severity) {
        filteredEvents = filteredEvents.filter(e => e.severity === filters.severity);
      }
      if (filters.userId) {
        filteredEvents = filteredEvents.filter(e => e.userId === filters.userId);
      }
      if (filters.startDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp >= filters.startDate!);
      }
      if (filters.endDate) {
        filteredEvents = filteredEvents.filter(e => e.timestamp <= filters.endDate!);
      }
      if (filters.limit) {
        filteredEvents = filteredEvents.slice(0, filters.limit);
      }
    }

    return filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getSecurityMetrics(timeRange: { start: Date; end: Date }) {
    const events = await this.getSecurityEvents({
      startDate: timeRange.start,
      endDate: timeRange.end
    });

    const metrics = {
      totalEvents: events.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      successfulEvents: 0,
      failedEvents: 0,
      blockedEvents: 0
    };

    events.forEach(event => {
      // Count by type
      metrics.eventsByType[event.type] = (metrics.eventsByType[event.type] || 0) + 1;
      
      // Count by severity
      metrics.eventsBySeverity[event.severity] = (metrics.eventsBySeverity[event.severity] || 0) + 1;
      
      // Count by outcome
      switch (event.outcome) {
        case 'success':
          metrics.successfulEvents++;
          break;
        case 'failure':
          metrics.failedEvents++;
          break;
        case 'blocked':
          metrics.blockedEvents++;
          break;
      }
    });

    return metrics;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logToConsole(event: SecurityEvent): void {
    const logLevel = this.getSeverityLogLevel(event.severity);
    const message = this.formatEvent(event);

    switch (logLevel) {
      case 'error':
        console.error(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'debug':
        console.debug(message);
        break;
    }
  }

  private async logToFile(event: SecurityEvent): Promise<void> {
    // In a real implementation, this would write to a file
    // For now, we'll just use console logging
    this.logToConsole(event);
  }

  private async logToDatabase(event: SecurityEvent): Promise<void> {
    // In a real implementation, this would write to a database
    // For now, we'll just use console logging
    this.logToConsole(event);
  }

  private formatEvent(event: SecurityEvent): string {
    if (this.config.format === 'json') {
      return JSON.stringify(event, null, 2);
    }

    return `[${event.timestamp.toISOString()}] ${event.severity.toUpperCase()} ${event.type} - ${event.action} on ${event.resource} by ${event.userId || 'anonymous'} from ${event.ipAddress} - ${event.outcome}`;
  }

  private getSeverityLogLevel(severity: SecuritySeverity): 'error' | 'warn' | 'info' | 'debug' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      default:
        return 'debug';
    }
  }

  private cleanupOldEvents(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retention);
    
    this.events = this.events.filter(event => event.timestamp > cutoffDate);
  }

  updateConfig(config: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Default configuration
const defaultConfig: AuditLoggerConfig = {
  enabled: true,
  level: 'info',
  format: 'json',
  destination: 'console',
  retention: 30
};

// Export singleton instance
export const auditLogger = new AuditLogger(defaultConfig);

// Export class for custom instances
export { AuditLogger };