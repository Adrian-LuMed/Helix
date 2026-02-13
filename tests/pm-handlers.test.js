import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPmHandlers } from '../clawcondos/condo-management/lib/pm-handlers.js';

/**
 * Helper to create a mock store for testing
 */
function createMockStore(initialData) {
  let data = initialData;
  let idCounter = 0;
  return {
    load: () => data,
    save: vi.fn((d) => { data = d; }),
    newId: (prefix = 'item') => `${prefix}_test_${++idCounter}`,
    getData: () => data,
  };
}

/**
 * Helper to invoke a handler and capture the response
 */
function callHandler(handler, params) {
  return new Promise((resolve, reject) => {
    const result = handler({
      params,
      respond: (ok, payload, error) => {
        if (ok) resolve(payload);
        else reject(new Error(error || 'Handler returned error'));
      },
    });
    // If handler returns a promise (async), handle errors
    if (result && typeof result.then === 'function') {
      result.catch(reject);
    }
  });
}

describe('PM Handlers - Condo PM', () => {
  let store;
  let handlers;

  beforeEach(() => {
    store = createMockStore({
      version: 2,
      goals: [
        {
          id: 'goal_1',
          title: 'Build auth',
          description: 'Authentication system',
          condoId: 'condo_1',
          status: 'active',
          completed: false,
          tasks: [],
          sessions: [],
          files: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        },
        {
          id: 'goal_2',
          title: 'Build UI',
          description: 'User interface',
          condoId: 'condo_1',
          status: 'active',
          completed: false,
          tasks: [{ id: 'task_1', text: 'Create header', status: 'pending' }],
          sessions: [],
          files: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
        },
      ],
      condos: [
        { id: 'condo_1', name: 'Test Project', createdAtMs: Date.now(), updatedAtMs: Date.now() },
      ],
      config: { agentRoles: { pm: 'claudia' } },
      sessionIndex: {},
      sessionCondoIndex: {},
    });

    handlers = createPmHandlers(store, {
      sendToSession: vi.fn(),
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
  });

  describe('pm.condoChat', () => {
    it('saves user message to condo history and returns enriched message', async () => {
      const result = await callHandler(handlers['pm.condoChat'], {
        condoId: 'condo_1',
        message: 'Plan a web app with auth and dashboard',
      });

      expect(result.enrichedMessage).toBeTruthy();
      expect(result.enrichedMessage).toContain('Plan a web app with auth and dashboard');
      expect(result.pmSession).toContain(':webchat:pm-condo-condo_1');
      expect(result.condoId).toBe('condo_1');

      // Verify history was saved
      const data = store.getData();
      const condo = data.condos[0];
      expect(condo.pmChatHistory).toHaveLength(1);
      expect(condo.pmChatHistory[0].role).toBe('user');
      expect(condo.pmChatHistory[0].content).toBe('Plan a web app with auth and dashboard');
    });

    it('returns error for missing condoId', async () => {
      await expect(callHandler(handlers['pm.condoChat'], {
        message: 'test',
      })).rejects.toThrow('condoId is required');
    });

    it('returns error for missing message', async () => {
      await expect(callHandler(handlers['pm.condoChat'], {
        condoId: 'condo_1',
      })).rejects.toThrow('message is required');
    });

    it('returns error for unknown condo', async () => {
      await expect(callHandler(handlers['pm.condoChat'], {
        condoId: 'nonexistent',
        message: 'test',
      })).rejects.toThrow('Condo nonexistent not found');
    });

    it('includes existing goals summary in enriched message', async () => {
      const result = await callHandler(handlers['pm.condoChat'], {
        condoId: 'condo_1',
        message: 'What goals do we have?',
      });

      expect(result.enrichedMessage).toContain('Total Goals: 2');
    });
  });

  describe('pm.condoSaveResponse', () => {
    it('saves assistant response and detects plan', async () => {
      const planContent = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Auth | Build authentication | high |`;

      const result = await callHandler(handlers['pm.condoSaveResponse'], {
        condoId: 'condo_1',
        content: planContent,
      });

      expect(result.ok).toBe(true);
      expect(result.hasPlan).toBe(true);
      expect(result.condoId).toBe('condo_1');

      // Verify history was saved
      const data = store.getData();
      const condo = data.condos[0];
      expect(condo.pmChatHistory).toHaveLength(1);
      expect(condo.pmChatHistory[0].role).toBe('assistant');
    });

    it('detects non-plan content', async () => {
      const result = await callHandler(handlers['pm.condoSaveResponse'], {
        condoId: 'condo_1',
        content: 'Sure, I can help you with that. What kind of project?',
      });

      expect(result.ok).toBe(true);
      expect(result.hasPlan).toBe(false);
    });

    it('returns error for missing condoId', async () => {
      await expect(callHandler(handlers['pm.condoSaveResponse'], {
        content: 'test',
      })).rejects.toThrow('condoId is required');
    });

    it('returns error for missing content', async () => {
      await expect(callHandler(handlers['pm.condoSaveResponse'], {
        condoId: 'condo_1',
      })).rejects.toThrow('content is required');
    });
  });

  describe('pm.condoGetHistory', () => {
    it('returns empty messages when no history exists', async () => {
      const result = await callHandler(handlers['pm.condoGetHistory'], {
        condoId: 'condo_1',
      });

      expect(result.messages).toHaveLength(0);
      expect(result.condoId).toBe('condo_1');
      expect(result.condoName).toBe('Test Project');
      expect(result.total).toBe(0);
    });

    it('returns messages after chat interactions', async () => {
      // Add some history first
      await callHandler(handlers['pm.condoChat'], {
        condoId: 'condo_1',
        message: 'Plan my project',
      });
      await callHandler(handlers['pm.condoSaveResponse'], {
        condoId: 'condo_1',
        content: 'Here is the plan...',
      });

      const result = await callHandler(handlers['pm.condoGetHistory'], {
        condoId: 'condo_1',
      });

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.total).toBe(2);
    });

    it('returns error for missing condoId', async () => {
      await expect(callHandler(handlers['pm.condoGetHistory'], {})).rejects.toThrow('condoId is required');
    });
  });

  describe('pm.condoCreateGoals', () => {
    it('creates goals from plan content', async () => {
      const planContent = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Setup auth | JWT authentication system | high |
| 2 | Build dashboard | Main dashboard UI | medium |
| 3 | API endpoints | REST API implementation | low |`;

      const result = await callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
        planContent,
      });

      expect(result.ok).toBe(true);
      expect(result.goalsCreated).toBe(3);
      expect(result.goals).toHaveLength(3);
      expect(result.goals[0].title).toBe('Setup auth');
      expect(result.goals[1].title).toBe('Build dashboard');
      expect(result.goals[2].title).toBe('API endpoints');
      expect(result.condoId).toBe('condo_1');

      // Verify goals were actually created in the store
      const data = store.getData();
      const condoGoals = data.goals.filter(g => g.condoId === 'condo_1' && g.title === 'Setup auth');
      expect(condoGoals).toHaveLength(1);
      expect(condoGoals[0].priority).toBe('high');
    });

    it('creates goals with embedded tasks', async () => {
      const planContent = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Auth system | User authentication | high |

#### Auth system
- Implement JWT middleware (backend)
- Create login form (frontend)`;

      const result = await callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
        planContent,
      });

      expect(result.ok).toBe(true);
      expect(result.goalsCreated).toBe(1);
      expect(result.goals[0].title).toBe('Auth system');
      expect(result.goals[0].taskCount).toBeGreaterThanOrEqual(1);

      // Verify tasks were created on the goal
      const data = store.getData();
      const authGoal = data.goals.find(g => g.title === 'Auth system' && g.condoId === 'condo_1' && g.id.startsWith('goal_test'));
      expect(authGoal).toBeDefined();
      expect(authGoal.tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('uses last assistant message from history when no planContent provided', async () => {
      // First build some history
      await callHandler(handlers['pm.condoChat'], {
        condoId: 'condo_1',
        message: 'Plan my project',
      });

      const planContent = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | First goal | Description | high |`;

      await callHandler(handlers['pm.condoSaveResponse'], {
        condoId: 'condo_1',
        content: planContent,
      });

      const result = await callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
        // No planContent — should use last assistant message
      });

      expect(result.ok).toBe(true);
      expect(result.goalsCreated).toBe(1);
      expect(result.goals[0].title).toBe('First goal');
    });

    it('returns error when no plan content available', async () => {
      await expect(callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
      })).rejects.toThrow('No plan content provided');
    });

    it('returns error for non-plan content', async () => {
      await expect(callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
        planContent: 'Hello world, just chatting.',
      })).rejects.toThrow(/No plan or goals detected/);
    });

    it('stores pmPlanContent on condo', async () => {
      const planContent = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Test goal | Test | high |`;

      await callHandler(handlers['pm.condoCreateGoals'], {
        condoId: 'condo_1',
        planContent,
      });

      const data = store.getData();
      expect(data.condos[0].pmPlanContent).toBe(planContent);
    });
  });

  describe('pm.condoCascade', () => {
    it('returns goal PM sessions with prompts in plan mode', async () => {
      const result = await callHandler(handlers['pm.condoCascade'], {
        condoId: 'condo_1',
        mode: 'plan',
      });

      // goal_1 has no tasks, goal_2 has tasks — only goal_1 should be in cascade
      expect(result.goals).toHaveLength(1);
      expect(result.goals[0].goalId).toBe('goal_1');
      expect(result.goals[0].title).toBe('Build auth');
      expect(result.goals[0].pmSessionKey).toContain(':webchat:pm-goal_1');
      expect(result.goals[0].prompt).toContain('Build auth');
      expect(result.mode).toBe('plan');
    });

    it('stores cascade mode on condo', async () => {
      await callHandler(handlers['pm.condoCascade'], {
        condoId: 'condo_1',
        mode: 'full',
      });

      const data = store.getData();
      expect(data.condos[0].cascadeMode).toBe('full');
    });

    it('returns error when all goals already have tasks', async () => {
      // Give goal_1 a task too
      const data = store.getData();
      data.goals[0].tasks = [{ id: 'task_x', text: 'A task', status: 'pending' }];

      await expect(callHandler(handlers['pm.condoCascade'], {
        condoId: 'condo_1',
        mode: 'plan',
      })).rejects.toThrow('No goals need planning');
    });

    it('returns error for invalid mode', async () => {
      await expect(callHandler(handlers['pm.condoCascade'], {
        condoId: 'condo_1',
        mode: 'invalid',
      })).rejects.toThrow('mode must be "plan" or "full"');
    });

    it('returns error for missing condoId', async () => {
      await expect(callHandler(handlers['pm.condoCascade'], {
        mode: 'plan',
      })).rejects.toThrow('condoId is required');
    });

    it('includes goal description in cascade prompt', async () => {
      const result = await callHandler(handlers['pm.condoCascade'], {
        condoId: 'condo_1',
        mode: 'plan',
      });

      expect(result.goals[0].prompt).toContain('Authentication system');
    });
  });
});
