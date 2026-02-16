import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Error recovery tests verify the retry and failure logic that lives
 * in the agent_end hook of index.js. Since that hook is tightly coupled
 * to the plugin registration API, we test the core logic by simulating
 * the data mutations and verifying the state transitions.
 */

describe('error-recovery', () => {
  /**
   * Simulate the agent_end error recovery logic (extracted from index.js).
   * This mirrors the if/else chain in the agent_end hook.
   */
  function simulateAgentEnd(goal, task, eventSuccess, broadcastEvents) {
    if (!task || task.status === 'done') {
      return 'completed';
    }

    if (task.status === 'in-progress') {
      const retryCount = task.retryCount || 0;
      const maxRetries = goal.maxRetries ?? 1;

      if (retryCount < maxRetries) {
        task.sessionKey = null;
        task.status = 'pending';
        task.retryCount = retryCount + 1;
        task.lastError = eventSuccess === false
          ? 'Agent failed while working on task'
          : 'Agent ended without completing task';
        task.updatedAtMs = Date.now();

        broadcastEvents.push({
          event: 'goal.task_retry',
          goalId: goal.id,
          taskId: task.id,
          retryCount: task.retryCount,
        });

        return 'retried';
      } else {
        task.status = 'failed';
        task.lastError = 'Max retries exhausted — agent ended without completing task';
        task.updatedAtMs = Date.now();

        broadcastEvents.push({
          event: 'goal.task_failed',
          goalId: goal.id,
          taskId: task.id,
        });

        return 'failed';
      }
    }

    return 'no-action';
  }

  it('retries a task on first agent failure', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      maxRetries: 2,
      tasks: [{
        id: 'task_1',
        status: 'in-progress',
        sessionKey: 'sk:agent:main:sub:1',
        retryCount: 0,
      }],
    };

    const result = simulateAgentEnd(goal, goal.tasks[0], true, events);

    expect(result).toBe('retried');
    expect(goal.tasks[0].status).toBe('pending');
    expect(goal.tasks[0].sessionKey).toBeNull();
    expect(goal.tasks[0].retryCount).toBe(1);
    expect(goal.tasks[0].lastError).toContain('ended without completing');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('goal.task_retry');
  });

  it('fails a task after max retries exhausted', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      maxRetries: 1,
      tasks: [{
        id: 'task_1',
        status: 'in-progress',
        sessionKey: 'sk:agent:main:sub:2',
        retryCount: 1,
      }],
    };

    const result = simulateAgentEnd(goal, goal.tasks[0], true, events);

    expect(result).toBe('failed');
    expect(goal.tasks[0].status).toBe('failed');
    expect(goal.tasks[0].lastError).toContain('Max retries exhausted');
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('goal.task_failed');
  });

  it('does nothing for already-completed tasks', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      tasks: [{
        id: 'task_1',
        status: 'done',
        sessionKey: 'sk:agent:main:sub:3',
      }],
    };

    const result = simulateAgentEnd(goal, goal.tasks[0], true, events);

    expect(result).toBe('completed');
    expect(goal.tasks[0].status).toBe('done');
    expect(events).toHaveLength(0);
  });

  it('uses default maxRetries of 1 when not set on goal', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      // No maxRetries set — defaults to 1
      tasks: [{
        id: 'task_1',
        status: 'in-progress',
        sessionKey: 'sk:1',
        retryCount: 0,
      }],
    };

    // First failure: should retry (0 < 1)
    const r1 = simulateAgentEnd(goal, goal.tasks[0], true, events);
    expect(r1).toBe('retried');
    expect(goal.tasks[0].retryCount).toBe(1);

    // Simulate re-assignment
    goal.tasks[0].status = 'in-progress';
    goal.tasks[0].sessionKey = 'sk:2';

    // Second failure: should fail (1 >= 1)
    const r2 = simulateAgentEnd(goal, goal.tasks[0], true, events);
    expect(r2).toBe('failed');
    expect(goal.tasks[0].status).toBe('failed');
  });

  it('records different error message for explicit agent failure', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      maxRetries: 2,
      tasks: [{
        id: 'task_1',
        status: 'in-progress',
        sessionKey: 'sk:1',
        retryCount: 0,
      }],
    };

    // event.success = false means agent explicitly failed
    simulateAgentEnd(goal, goal.tasks[0], false, events);
    expect(goal.tasks[0].lastError).toContain('failed while working');
  });

  it('handles task with no retryCount field gracefully', () => {
    const events = [];
    const goal = {
      id: 'goal_1',
      title: 'Test Goal',
      maxRetries: 3,
      tasks: [{
        id: 'task_1',
        status: 'in-progress',
        sessionKey: 'sk:1',
        // retryCount not set (undefined, should default to 0)
      }],
    };

    const result = simulateAgentEnd(goal, goal.tasks[0], true, events);
    expect(result).toBe('retried');
    expect(goal.tasks[0].retryCount).toBe(1);
  });
});
