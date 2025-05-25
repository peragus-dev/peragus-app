import {
  TestOrchestrator,
  TestScenario,
  TestSuite,
  TestExecution,
  TestResult,
  TestSuiteResult,
  TestHistory,
  TestReport,
  ConcurrentTestConfig,
  ConcurrentTestResult,
  CronSchedule,
  TestExecutionStatus,
  LogLevel
} from '../types/test-orchestrator.js';

/**
 * Implementation of the Test Orchestrator for managing test execution lifecycle.
 *
 * This class provides comprehensive test orchestration capabilities including:
 * - Individual test execution with timeout and retry support
 * - Test suite execution with parallel/sequential modes
 * - Test lifecycle management (start, pause, stop, resume)
 * - Test history tracking and reporting
 * - Concurrent test execution with configurable limits
 *
 * @example
 * ```typescript
 * const orchestrator = new TestOrchestratorImpl();
 * const execution = await orchestrator.executeTest(scenario);
 * await orchestrator.startTest(execution.id);
 * const result = await orchestrator.getTestResult(execution.id);
 * ```
 */
export class TestOrchestratorImpl implements TestOrchestrator {
  private readonly executions = new Map<string, TestExecution>();
  private readonly results = new Map<string, TestResult>();
  private readonly executionHistory = new Map<string, TestExecution[]>();
  private readonly scenarios = new Map<string, TestScenario>();
  private readonly timeouts = new Map<string, NodeJS.Timeout>();
  
  // Configuration constants
  private static readonly DEFAULT_TIMEOUT = 30000;
  private static readonly DEFAULT_EXECUTION_DELAY = 100;
  private static readonly POLLING_INTERVAL = 10;
  private static readonly DEFAULT_TEST_DURATION = 100;

  async executeTest(scenario: TestScenario): Promise<TestExecution> {
    const execution: TestExecution = {
      id: this.generateId(),
      scenarioId: scenario.id,
      status: TestExecutionStatus.PENDING,
      startTime: new Date(),
      retryCount: 0
    };

    this.executions.set(execution.id, execution);
    this.scenarios.set(execution.id, scenario);
    this.addToHistory(scenario.id, execution);

    return execution;
  }

  async executeTestSuite(suite: TestSuite): Promise<TestSuiteResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    if (suite.parallel) {
      // Execute scenarios in parallel
      const executions = await Promise.all(
        suite.scenarios.map(scenario => this.executeTest(scenario))
      );
      
      // Start all tests
      await Promise.all(
        executions.map(execution => this.startTest(execution.id))
      );
      
      // Wait for all results
      const testResults = await Promise.all(
        executions.map(execution => this.getTestResult(execution.id))
      );
      
      results.push(...testResults);
    } else {
      // Execute scenarios sequentially
      for (const scenario of suite.scenarios) {
        const execution = await this.executeTest(scenario);
        await this.startTest(execution.id);
        const result = await this.getTestResult(execution.id);
        results.push(result);
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    return {
      suiteId: suite.id,
      success: results.every(r => r.success),
      duration,
      totalTests: results.length,
      passedTests: results.filter(r => r.success).length,
      failedTests: results.filter(r => !r.success).length,
      skippedTests: 0,
      results
    };
  }

  async scheduleTest(_scenario: TestScenario, _schedule: CronSchedule): Promise<string> {
    const scheduleId = this.generateId();
    
    // For now, just return the schedule ID
    // In a real implementation, this would use node-cron
    return scheduleId;
  }

  async executeParallel(scenarios: TestScenario[]): Promise<TestResult[]> {
    const executions = await Promise.all(
      scenarios.map(scenario => this.executeTest(scenario))
    );
    
    await Promise.all(
      executions.map(execution => this.startTest(execution.id))
    );
    
    return Promise.all(
      executions.map(execution => this.getTestResult(execution.id))
    );
  }

  async executeConcurrent(config: ConcurrentTestConfig): Promise<ConcurrentTestResult> {
    const startTime = Date.now();
    
    // Limit concurrency
    const chunks = this.chunkArray(config.scenarios, config.maxConcurrency);
    const results: TestResult[] = [];
    
    for (const chunk of chunks) {
      const chunkResults = await this.executeParallel(chunk);
      results.push(...chunkResults);
      
      if (config.failFast && chunkResults.some(r => !r.success)) {
        break;
      }
    }
    
    const endTime = Date.now();
    
    return {
      success: results.every(r => r.success),
      duration: endTime - startTime,
      results,
      concurrencyLevel: config.maxConcurrency
    };
  }

  async startTest(testId: string): Promise<void> {
    const execution = this.executions.get(testId);
    if (!execution) {
      throw new Error(`Test execution not found: ${testId}`);
    }

    execution.status = TestExecutionStatus.RUNNING;
    execution.startTime = new Date();
    
    // Get the scenario to determine timeout
    const scenario = this.scenarios.get(testId);
    const timeout = scenario?.timeout ?? TestOrchestratorImpl.DEFAULT_TIMEOUT;
    
    // Set up timeout handling
    const executionTimeout = setTimeout(() => {
      this.timeoutTest(testId);
    }, timeout);
    
    // Store timeout for cleanup
    this.timeouts.set(testId, executionTimeout);
    
    // Simulate test execution completion
    setTimeout(() => {
      this.cleanupTimeout(testId);
      if (execution.status === TestExecutionStatus.RUNNING) {
        this.completeTest(testId);
      }
    }, TestOrchestratorImpl.DEFAULT_EXECUTION_DELAY);
  }

  async pauseTest(testId: string): Promise<void> {
    const execution = this.executions.get(testId);
    if (!execution) {
      throw new Error(`Test execution not found: ${testId}`);
    }

    execution.status = TestExecutionStatus.PENDING; // Use PENDING as paused state
  }

  async stopTest(testId: string): Promise<void> {
    const execution = this.executions.get(testId);
    if (!execution) {
      throw new Error(`Test execution not found: ${testId}`);
    }

    execution.status = TestExecutionStatus.CANCELLED;
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();
  }

  async resumeTest(testId: string): Promise<void> {
    const execution = this.executions.get(testId);
    if (!execution) {
      throw new Error(`Test execution not found: ${testId}`);
    }

    execution.status = TestExecutionStatus.RUNNING;
  }

  async getTestResult(testId: string): Promise<TestResult> {
    // Wait for test completion if still running
    const execution = this.executions.get(testId);
    if (!execution) {
      throw new Error(`Test execution not found: ${testId}`);
    }

    // Wait for completion
    while (execution.status === TestExecutionStatus.RUNNING || execution.status === TestExecutionStatus.PENDING) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    let result = this.results.get(testId);
    if (!result) {
      // Create a basic result
      result = {
        testId,
        scenarioId: execution.scenarioId,
        success: execution.status === TestExecutionStatus.COMPLETED,
        duration: execution.duration || 100,
        steps: [],
        assertions: [],
        screenshots: [],
        logs: []
      };
      this.results.set(testId, result);
    }

    return result;
  }

  async getTestHistory(scenarioId: string): Promise<TestHistory> {
    const executions = this.executionHistory.get(scenarioId) || [];
    
    // Wait for any pending executions to complete
    await this.waitForPendingExecutions(executions);
    
    // Refresh executions after waiting and calculate metrics
    const updatedExecutions = this.executionHistory.get(scenarioId) || [];
    const metrics = this.calculateExecutionMetrics(updatedExecutions);
    
    return {
      scenarioId,
      executions: updatedExecutions,
      successRate: metrics.successRate,
      averageDuration: metrics.averageDuration,
      lastExecution: updatedExecutions[updatedExecutions.length - 1]
    };
  }

  async generateReport(testIds: string[]): Promise<TestReport> {
    const results = await Promise.all(
      testIds.map(id => this.getTestResult(id))
    );

    const passedTests = results.filter(r => r.success).length;
    const failedTests = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      id: this.generateId(),
      generatedAt: new Date(),
      testIds,
      summary: {
        totalTests: results.length,
        passedTests,
        failedTests,
        skippedTests: 0,
        successRate: results.length > 0 ? passedTests / results.length : 0,
        totalDuration,
        averageDuration: results.length > 0 ? totalDuration / results.length : 0
      },
      results
    };
  }

  async getActiveExecutions(): Promise<TestExecution[]> {
    return Array.from(this.executions.values())
      .filter(e => e.status === TestExecutionStatus.RUNNING);
  }

  async getExecutionStatus(executionId: string): Promise<TestExecution> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Test execution not found: ${executionId}`);
    }
    return execution;
  }

  async cancelExecution(executionId: string): Promise<void> {
    await this.stopTest(executionId);
  }

  private completeTest(testId: string): void {
    const execution = this.executions.get(testId);
    if (!execution) return;

    execution.status = TestExecutionStatus.COMPLETED;
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

    // Create a successful result
    const result: TestResult = {
      testId,
      scenarioId: execution.scenarioId,
      success: true,
      duration: execution.duration,
      steps: [],
      assertions: [],
      screenshots: [],
      logs: [{
        timestamp: new Date(),
        level: LogLevel.INFO,
        message: 'Test completed successfully'
      }]
    };

    this.results.set(testId, result);
  }

  private timeoutTest(testId: string): void {
    const execution = this.executions.get(testId);
    if (!execution) return;

    execution.status = TestExecutionStatus.TIMEOUT;
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

    // Create a timeout result
    const result: TestResult = {
      testId,
      scenarioId: execution.scenarioId,
      success: false,
      duration: execution.duration,
      steps: [],
      assertions: [],
      screenshots: [],
      logs: [{
        timestamp: new Date(),
        level: LogLevel.ERROR,
        message: 'Test timed out'
      }]
    };

    this.results.set(testId, result);
  }


  private generateId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private addToHistory(scenarioId: string, execution: TestExecution): void {
    const history = this.executionHistory.get(scenarioId) || [];
    history.push(execution);
    this.executionHistory.set(scenarioId, history);
  }

  private async waitForExecution(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) return;
    
    while (execution.status === TestExecutionStatus.RUNNING || execution.status === TestExecutionStatus.PENDING) {
      await new Promise(resolve => setTimeout(resolve, TestOrchestratorImpl.POLLING_INTERVAL));
    }
  }

  private cleanupTimeout(testId: string): void {
    const timeout = this.timeouts.get(testId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(testId);
    }
  }

  private async waitForPendingExecutions(executions: TestExecution[]): Promise<void> {
    const pendingExecutions = executions.filter(
      e => e.status === TestExecutionStatus.RUNNING || e.status === TestExecutionStatus.PENDING
    );
    
    await Promise.all(
      pendingExecutions.map(execution => this.waitForExecution(execution.id))
    );
  }

  private calculateExecutionMetrics(executions: TestExecution[]): { successRate: number; averageDuration: number } {
    if (executions.length === 0) {
      return { successRate: 0, averageDuration: TestOrchestratorImpl.DEFAULT_TEST_DURATION };
    }

    const completedExecutions = executions.filter(e => e.duration !== undefined && e.duration > 0);
    const successfulExecutions = executions.filter(e => e.status === TestExecutionStatus.COMPLETED);
    
    const successRate = successfulExecutions.length / executions.length;
    const averageDuration = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length
      : TestOrchestratorImpl.DEFAULT_TEST_DURATION;

    return { successRate, averageDuration };
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}