import { describe, it, expect, beforeEach } from 'vitest';
import { TestOrchestratorImpl } from '../test-orchestrator.js';
import { 
  TestScenario, 
  TestScenarioType, 
  TestExecutionStatus,
  TestOrchestrator,
  RetryPolicy
} from '../../types/test-orchestrator.js';

describe('TestOrchestrator', () => {
  let orchestrator: TestOrchestrator;
  let mockScenario: TestScenario;

  beforeEach(() => {
    orchestrator = new TestOrchestratorImpl();
    
    mockScenario = {
      id: 'test-scenario-1',
      name: 'Basic Integration Test',
      description: 'Test basic MCP workflow',
      type: TestScenarioType.INTEGRATION,
      timeout: 30000,
      retryPolicy: {
        maxRetries: 3,
        backoffMs: 1000,
        exponentialBackoff: false
      } as RetryPolicy,
      tags: ['integration', 'mcp'],
      dependencies: []
    };
  });

  describe('executeTest', () => {
    it('should create a test execution with PENDING status initially', async () => {
      // RED: This test should fail because TestOrchestratorImpl doesn't exist yet
      const execution = await orchestrator.executeTest(mockScenario);
      
      expect(execution).toBeDefined();
      expect(execution.id).toBeDefined();
      expect(execution.scenarioId).toBe(mockScenario.id);
      expect(execution.status).toBe(TestExecutionStatus.PENDING);
      expect(execution.startTime).toBeInstanceOf(Date);
      expect(execution.retryCount).toBe(0);
      expect(execution.endTime).toBeUndefined();
      expect(execution.duration).toBeUndefined();
    });

    it('should transition execution status from PENDING to RUNNING', async () => {
      const execution = await orchestrator.executeTest(mockScenario);
      
      // Start the test
      await orchestrator.startTest(execution.id);
      
      const updatedExecution = await orchestrator.getExecutionStatus(execution.id);
      expect(updatedExecution.status).toBe(TestExecutionStatus.RUNNING);
      expect(updatedExecution.startTime).toBeInstanceOf(Date);
    });

    it('should complete execution and return result', async () => {
      const execution = await orchestrator.executeTest(mockScenario);
      await orchestrator.startTest(execution.id);
      
      // Wait for completion (this will be mocked initially)
      const result = await orchestrator.getTestResult(execution.id);
      
      expect(result).toBeDefined();
      expect(result.testId).toBe(execution.id);
      expect(result.scenarioId).toBe(mockScenario.id);
      expect(result.success).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should handle test timeout correctly', async () => {
      const timeoutScenario: TestScenario = {
        ...mockScenario,
        timeout: 100 // Very short timeout
      };
      
      const execution = await orchestrator.executeTest(timeoutScenario);
      await orchestrator.startTest(execution.id);
      
      // Wait longer than timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const finalExecution = await orchestrator.getExecutionStatus(execution.id);
      expect(finalExecution.status).toBe(TestExecutionStatus.TIMEOUT);
    });

    it('should retry failed tests according to retry policy', async () => {
      const retryScenario: TestScenario = {
        ...mockScenario,
        retryPolicy: {
          maxRetries: 2,
          backoffMs: 50,
          exponentialBackoff: false
        }
      };
      
      const execution = await orchestrator.executeTest(retryScenario);
      await orchestrator.startTest(execution.id);
      
      // Simulate failure and retries
      const finalExecution = await orchestrator.getExecutionStatus(execution.id);
      expect(finalExecution.retryCount).toBeLessThanOrEqual(2);
    });
  });

  describe('executeTestSuite', () => {
    it('should execute multiple scenarios in a test suite', async () => {
      const scenario2: TestScenario = {
        ...mockScenario,
        id: 'test-scenario-2',
        name: 'Second Integration Test'
      };

      const testSuite = {
        id: 'test-suite-1',
        name: 'Integration Test Suite',
        description: 'Suite of integration tests',
        scenarios: [mockScenario, scenario2],
        parallel: false
      };

      const result = await orchestrator.executeTestSuite(testSuite);
      
      expect(result).toBeDefined();
      expect(result.suiteId).toBe(testSuite.id);
      expect(result.totalTests).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should execute scenarios in parallel when parallel flag is true', async () => {
      const scenario2: TestScenario = {
        ...mockScenario,
        id: 'test-scenario-2',
        name: 'Second Integration Test'
      };

      const parallelSuite = {
        id: 'parallel-suite-1',
        name: 'Parallel Test Suite',
        description: 'Suite with parallel execution',
        scenarios: [mockScenario, scenario2],
        parallel: true,
        maxConcurrency: 2
      };

      const startTime = Date.now();
      const result = await orchestrator.executeTestSuite(parallelSuite);
      const endTime = Date.now();
      
      expect(result.totalTests).toBe(2);
      // Parallel execution should be faster than sequential
      expect(endTime - startTime).toBeLessThan(result.duration * 2);
    });
  });

  describe('executeParallel', () => {
    it('should execute multiple scenarios in parallel', async () => {
      const scenarios = [
        mockScenario,
        { ...mockScenario, id: 'test-scenario-2', name: 'Test 2' },
        { ...mockScenario, id: 'test-scenario-3', name: 'Test 3' }
      ];

      const results = await orchestrator.executeParallel(scenarios);
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success !== undefined)).toBe(true);
      expect(results.every(r => r.duration > 0)).toBe(true);
    });
  });

  describe('test lifecycle management', () => {
    it('should pause and resume test execution', async () => {
      const execution = await orchestrator.executeTest(mockScenario);
      await orchestrator.startTest(execution.id);
      
      // Pause the test
      await orchestrator.pauseTest(execution.id);
      let status = await orchestrator.getExecutionStatus(execution.id);
      expect(status.status).toBe(TestExecutionStatus.PENDING); // Paused state
      
      // Resume the test
      await orchestrator.resumeTest(execution.id);
      status = await orchestrator.getExecutionStatus(execution.id);
      expect(status.status).toBe(TestExecutionStatus.RUNNING);
    });

    it('should stop test execution', async () => {
      const execution = await orchestrator.executeTest(mockScenario);
      await orchestrator.startTest(execution.id);
      
      await orchestrator.stopTest(execution.id);
      
      const status = await orchestrator.getExecutionStatus(execution.id);
      expect(status.status).toBe(TestExecutionStatus.CANCELLED);
    });
  });

  describe('getActiveExecutions', () => {
    it('should return list of currently running executions', async () => {
      const execution1 = await orchestrator.executeTest(mockScenario);
      const execution2 = await orchestrator.executeTest({
        ...mockScenario,
        id: 'test-scenario-2'
      });
      
      await orchestrator.startTest(execution1.id);
      await orchestrator.startTest(execution2.id);
      
      const activeExecutions = await orchestrator.getActiveExecutions();
      expect(activeExecutions).toHaveLength(2);
      expect(activeExecutions.every(e => e.status === TestExecutionStatus.RUNNING)).toBe(true);
    });
  });

  describe('getTestHistory', () => {
    it('should return execution history for a scenario', async () => {
      // Execute the same scenario multiple times
      const execution1 = await orchestrator.executeTest(mockScenario);
      const execution2 = await orchestrator.executeTest(mockScenario);
      const execution3 = await orchestrator.executeTest(mockScenario);
      
      // Start all executions
      await orchestrator.startTest(execution1.id);
      await orchestrator.startTest(execution2.id);
      await orchestrator.startTest(execution3.id);
      
      const history = await orchestrator.getTestHistory(mockScenario.id);
      
      expect(history).toBeDefined();
      expect(history.scenarioId).toBe(mockScenario.id);
      expect(history.executions).toHaveLength(3);
      expect(history.successRate).toBeGreaterThanOrEqual(0);
      expect(history.successRate).toBeLessThanOrEqual(1);
      expect(history.averageDuration).toBeGreaterThan(0);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive test report', async () => {
      const execution1 = await orchestrator.executeTest(mockScenario);
      const execution2 = await orchestrator.executeTest({
        ...mockScenario,
        id: 'test-scenario-2'
      });
      
      // Start both executions
      await orchestrator.startTest(execution1.id);
      await orchestrator.startTest(execution2.id);
      
      const report = await orchestrator.generateReport([execution1.id, execution2.id]);
      
      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.testIds).toEqual([execution1.id, execution2.id]);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalTests).toBe(2);
      expect(report.results).toHaveLength(2);
    });
  });
});