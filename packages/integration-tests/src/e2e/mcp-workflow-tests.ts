/**
 * End-to-End MCP Workflow Test Utilities
 * 
 * This module provides comprehensive testing utilities for validating
 * the complete MCP (Model Context Protocol) workflow integration.
 * 
 * Key Features:
 * - Full MCP client-server communication testing
 * - Tool execution validation
 * - Resource access verification
 * - Error handling and recovery testing
 * - Performance metrics collection
 */

import { TestScenario, TestScenarioType } from '../types/test-orchestrator.js';

/**
 * Test Step interface for MCP workflow testing
 */
export interface TestStep {
  id: string;
  name: string;
  description: string;
  timeout: number;
  action: string;
  parameters: Record<string, unknown>;
}

/**
 * Test Assertion interface for MCP workflow validation
 */
export interface TestAssertion {
  id: string;
  description: string;
  condition: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Extended Test Scenario interface for MCP workflow testing
 * Extends the base TestScenario with additional MCP-specific properties
 */
export interface MCPTestScenario extends TestScenario {
  steps: TestStep[];
  assertions: TestAssertion[];
  setup?: {
    description: string;
    actions: string[];
  };
  teardown?: {
    description: string;
    actions: string[];
  };
  environment?: {
    variables: Record<string, string>;
  };
}

/**
 * MCP Workflow Test Configuration
 */
export interface MCPWorkflowConfig {
  /** MCP server endpoint URL */
  serverUrl: string;
  /** Authentication credentials if required */
  credentials?: {
    apiKey?: string;
    token?: string;
  };
  /** Timeout for MCP operations in milliseconds */
  timeout: number;
  /** Whether to collect performance metrics */
  collectMetrics: boolean;
}

/**
 * MCP Test Result with detailed metrics
 */
export interface MCPTestResult {
  /** Whether the test passed */
  success: boolean;
  /** Test execution duration in milliseconds */
  duration: number;
  /** Number of MCP operations performed */
  operationCount: number;
  /** Average response time for MCP operations */
  averageResponseTime: number;
  /** Any errors encountered during testing */
  errors: string[];
  /** Performance metrics if collected */
  metrics?: {
    memoryUsage: number;
    cpuUsage: number;
    networkLatency: number;
  };
}

/**
 * Creates a comprehensive MCP workflow test scenario
 * 
 * This test validates the complete MCP integration including:
 * - Client connection establishment
 * - Tool discovery and execution
 * - Resource access and retrieval
 * - Error handling and recovery
 * - Performance characteristics
 */
export function createMCPWorkflowTestScenario(config: MCPWorkflowConfig): MCPTestScenario {
  const steps: TestStep[] = [
    {
      id: 'mcp-connection',
      name: 'Establish MCP Connection',
      description: 'Connect to MCP server and verify handshake',
      timeout: config.timeout,
      action: 'connect',
      parameters: {
        url: config.serverUrl,
        credentials: config.credentials
      }
    },
    {
      id: 'mcp-tool-discovery',
      name: 'Discover Available Tools',
      description: 'Query server for available tools and validate response',
      timeout: config.timeout,
      action: 'list_tools',
      parameters: {}
    },
    {
      id: 'mcp-tool-execution',
      name: 'Execute MCP Tool',
      description: 'Execute a sample tool and validate response',
      timeout: config.timeout,
      action: 'execute_tool',
      parameters: {
        toolName: 'test_tool',
        arguments: { test: true }
      }
    },
    {
      id: 'mcp-resource-access',
      name: 'Access MCP Resource',
      description: 'Access a resource and validate content',
      timeout: config.timeout,
      action: 'access_resource',
      parameters: {
        resourceUri: 'test://resource'
      }
    },
    {
      id: 'mcp-error-handling',
      name: 'Test Error Handling',
      description: 'Verify proper error handling for invalid operations',
      timeout: config.timeout,
      action: 'test_error_handling',
      parameters: {
        invalidOperation: true
      }
    }
  ];

  const assertions: TestAssertion[] = [
    {
      id: 'connection-established',
      description: 'MCP connection should be established successfully',
      condition: 'response.connected === true',
      severity: 'critical'
    },
    {
      id: 'tools-discovered',
      description: 'Should discover at least one tool',
      condition: 'response.tools.length > 0',
      severity: 'critical'
    },
    {
      id: 'tool-execution-success',
      description: 'Tool execution should complete successfully',
      condition: 'response.success === true',
      severity: 'critical'
    },
    {
      id: 'resource-access-success',
      description: 'Resource access should return valid content',
      condition: 'response.content !== null && response.content !== undefined',
      severity: 'critical'
    },
    {
      id: 'error-handling-proper',
      description: 'Error handling should return appropriate error response',
      condition: 'response.error !== null && response.error.code !== undefined',
      severity: 'high'
    },
    {
      id: 'performance-acceptable',
      description: 'Average response time should be under 1000ms',
      condition: 'metrics.averageResponseTime < 1000',
      severity: 'medium'
    }
  ];

  return {
    id: 'mcp-workflow-integration',
    name: 'MCP Workflow Integration Test',
    description: 'Comprehensive test of MCP client-server workflow',
    type: TestScenarioType.INTEGRATION,
    tags: ['mcp', 'integration', 'e2e', 'workflow'],
    timeout: config.timeout * steps.length, // Total timeout for all steps
    retryPolicy: {
      maxRetries: 2,
      backoffMs: 1000,
      exponentialBackoff: false
    },
    steps,
    assertions,
    setup: {
      description: 'Initialize MCP test environment',
      actions: [
        'start_mcp_server',
        'configure_test_client',
        'setup_test_resources'
      ]
    },
    teardown: {
      description: 'Clean up MCP test environment',
      actions: [
        'disconnect_client',
        'cleanup_test_resources',
        'stop_mcp_server'
      ]
    },
    environment: {
      variables: {
        MCP_SERVER_URL: config.serverUrl,
        MCP_TIMEOUT: config.timeout.toString(),
        COLLECT_METRICS: config.collectMetrics.toString()
      }
    }
  };
}

/**
 * Creates a performance-focused MCP test scenario
 * 
 * This test specifically validates performance characteristics:
 * - Connection establishment time
 * - Tool execution latency
 * - Resource access speed
 * - Concurrent operation handling
 * - Memory and CPU usage
 */
export function createMCPPerformanceTestScenario(config: MCPWorkflowConfig): MCPTestScenario {
  return {
    id: 'mcp-performance-test',
    name: 'MCP Performance Test',
    description: 'Performance and load testing for MCP operations',
    type: TestScenarioType.PERFORMANCE,
    tags: ['mcp', 'performance', 'load', 'metrics'],
    timeout: config.timeout * 2,
    retryPolicy: {
      maxRetries: 1,
      backoffMs: 2000,
      exponentialBackoff: false
    },
    steps: [
      {
        id: 'performance-baseline',
        name: 'Establish Performance Baseline',
        description: 'Measure baseline performance metrics',
        timeout: config.timeout,
        action: 'measure_baseline',
        parameters: { iterations: 10 }
      },
      {
        id: 'concurrent-operations',
        name: 'Test Concurrent Operations',
        description: 'Execute multiple MCP operations concurrently',
        timeout: config.timeout,
        action: 'concurrent_test',
        parameters: { concurrency: 5, operations: 20 }
      },
      {
        id: 'load-test',
        name: 'Load Test MCP Server',
        description: 'Test server under sustained load',
        timeout: config.timeout,
        action: 'load_test',
        parameters: { duration: 30000, requestsPerSecond: 10 }
      }
    ],
    assertions: [
      {
        id: 'baseline-performance',
        description: 'Baseline operations should complete within acceptable time',
        condition: 'metrics.baselineAverage < 500',
        severity: 'high'
      },
      {
        id: 'concurrent-performance',
        description: 'Concurrent operations should not degrade significantly',
        condition: 'metrics.concurrentAverage < metrics.baselineAverage * 2',
        severity: 'high'
      },
      {
        id: 'load-stability',
        description: 'Server should remain stable under load',
        condition: 'metrics.errorRate < 0.01',
        severity: 'critical'
      }
    ],
    environment: {
      variables: {
        PERFORMANCE_MODE: 'true',
        METRICS_COLLECTION: 'detailed'
      }
    }
  };
}

/**
 * Creates an error recovery test scenario for MCP operations
 * 
 * This test validates error handling and recovery mechanisms:
 * - Network interruption recovery
 * - Server restart handling
 * - Invalid request handling
 * - Timeout recovery
 * - Circuit breaker functionality
 */
export function createMCPErrorRecoveryTestScenario(config: MCPWorkflowConfig): MCPTestScenario {
  return {
    id: 'mcp-error-recovery-test',
    name: 'MCP Error Recovery Test',
    description: 'Test error handling and recovery mechanisms',
    type: TestScenarioType.INTEGRATION,
    tags: ['mcp', 'error-handling', 'recovery', 'resilience'],
    timeout: config.timeout * 3,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1500,
      exponentialBackoff: true
    },
    steps: [
      {
        id: 'network-interruption',
        name: 'Test Network Interruption Recovery',
        description: 'Simulate network interruption and test recovery',
        timeout: config.timeout,
        action: 'simulate_network_interruption',
        parameters: { duration: 5000 }
      },
      {
        id: 'server-restart',
        name: 'Test Server Restart Handling',
        description: 'Simulate server restart and test reconnection',
        timeout: config.timeout,
        action: 'simulate_server_restart',
        parameters: { restartDelay: 3000 }
      },
      {
        id: 'invalid-requests',
        name: 'Test Invalid Request Handling',
        description: 'Send invalid requests and verify error responses',
        timeout: config.timeout,
        action: 'send_invalid_requests',
        parameters: { requestTypes: ['malformed', 'unauthorized', 'not_found'] }
      },
      {
        id: 'timeout-recovery',
        name: 'Test Timeout Recovery',
        description: 'Test recovery from operation timeouts',
        timeout: config.timeout,
        action: 'test_timeout_recovery',
        parameters: { timeoutDuration: 2000 }
      }
    ],
    assertions: [
      {
        id: 'network-recovery',
        description: 'Should recover from network interruptions',
        condition: 'response.networkRecovery === true',
        severity: 'critical'
      },
      {
        id: 'server-reconnection',
        description: 'Should reconnect after server restart',
        condition: 'response.serverReconnection === true',
        severity: 'critical'
      },
      {
        id: 'error-responses',
        description: 'Should return proper error responses for invalid requests',
        condition: 'response.errorHandling.allValid === true',
        severity: 'high'
      },
      {
        id: 'timeout-handling',
        description: 'Should handle timeouts gracefully',
        condition: 'response.timeoutHandling === true',
        severity: 'high'
      }
    ],
    environment: {
      variables: {
        ERROR_SIMULATION: 'true',
        RECOVERY_TESTING: 'true'
      }
    }
  };
}

/**
 * Default MCP workflow configuration for testing
 */
export const DEFAULT_MCP_CONFIG: MCPWorkflowConfig = {
  serverUrl: 'http://localhost:3000/mcp',
  timeout: 5000,
  collectMetrics: true
};

/**
 * Creates a complete MCP test suite with all test scenarios
 */
export function createCompleteMCPTestSuite(config: MCPWorkflowConfig = DEFAULT_MCP_CONFIG) {
  return {
    id: 'complete-mcp-test-suite',
    name: 'Complete MCP Integration Test Suite',
    description: 'Comprehensive test suite for MCP functionality',
    scenarios: [
      createMCPWorkflowTestScenario(config),
      createMCPPerformanceTestScenario(config),
      createMCPErrorRecoveryTestScenario(config)
    ],
    parallel: false, // Run sequentially for comprehensive testing
    continueOnFailure: true,
    reportFormat: 'detailed'
  };
}