// Core types for the Test Orchestration Framework

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  type: TestScenarioType;
  timeout: number;
  retryPolicy: RetryPolicy;
  tags: string[];
  dependencies?: string[];
}

export enum TestScenarioType {
  WORKFLOW = 'WORKFLOW',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  CHAOS = 'CHAOS',
  INTEGRATION = 'INTEGRATION'
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  exponentialBackoff?: boolean;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  scenarios: TestScenario[];
  parallel: boolean;
  maxConcurrency?: number;
}

export interface TestExecution {
  id: string;
  scenarioId: string;
  status: TestExecutionStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: TestResult;
  error?: string;
  retryCount: number;
}

export enum TestExecutionStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT'
}

export interface TestResult {
  testId: string;
  scenarioId: string;
  success: boolean;
  duration: number;
  steps?: StepResult[];
  assertions?: AssertionResult[];
  screenshots?: string[];
  logs?: LogEntry[];
  metrics?: TestMetrics;
}

export interface StepResult {
  step: string;
  success: boolean;
  duration: number;
  result?: unknown;
  error?: string;
}

export interface AssertionResult {
  assertion: string;
  success: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface TestMetrics {
  responseTime?: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  throughput?: number;
  errorRate?: number;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}

export interface TestSuiteResult {
  suiteId: string;
  success: boolean;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  results: TestResult[];
}

export interface ConcurrentTestConfig {
  scenarios: TestScenario[];
  maxConcurrency: number;
  failFast: boolean;
  timeout: number;
}

export interface ConcurrentTestResult {
  success: boolean;
  duration: number;
  results: TestResult[];
  concurrencyLevel: number;
}

export interface TestHistory {
  scenarioId: string;
  executions: TestExecution[];
  successRate: number;
  averageDuration: number;
  lastExecution?: TestExecution;
}

export interface TestReport {
  id: string;
  generatedAt: Date;
  testIds: string[];
  summary: TestSummary;
  results: TestResult[];
  trends?: TestTrends;
}

export interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  successRate: number;
  totalDuration: number;
  averageDuration: number;
}

export interface TestTrends {
  successRateTrend: number;
  durationTrend: number;
  errorRateTrend: number;
}

export interface CronSchedule {
  expression: string;
  timezone?: string;
  enabled: boolean;
}

// Test Orchestrator Interface
export interface TestOrchestrator {
  // Test execution management
  executeTest(scenario: TestScenario): Promise<TestExecution>;
  executeTestSuite(suite: TestSuite): Promise<TestSuiteResult>;
  scheduleTest(scenario: TestScenario, schedule: CronSchedule): Promise<string>;
  
  // Parallel execution
  executeParallel(scenarios: TestScenario[]): Promise<TestResult[]>;
  executeConcurrent(config: ConcurrentTestConfig): Promise<ConcurrentTestResult>;
  
  // Test lifecycle management
  startTest(testId: string): Promise<void>;
  pauseTest(testId: string): Promise<void>;
  stopTest(testId: string): Promise<void>;
  resumeTest(testId: string): Promise<void>;
  
  // Result management
  getTestResult(testId: string): Promise<TestResult>;
  getTestHistory(scenarioId: string): Promise<TestHistory>;
  generateReport(testIds: string[]): Promise<TestReport>;
  
  // Status and monitoring
  getActiveExecutions(): Promise<TestExecution[]>;
  getExecutionStatus(executionId: string): Promise<TestExecution>;
  cancelExecution(executionId: string): Promise<void>;
}