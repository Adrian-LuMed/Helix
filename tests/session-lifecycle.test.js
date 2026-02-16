import { describe, it, expect, vi } from 'vitest';
import { createSessionLifecycleHandlers, collectGoalSessionKeys, collectCondoSessionKeys } from '../clawcondos/condo-management/lib/session-lifecycle.js';

function createMockStore(data) {
  return {
    load: () => data,
    save: vi.fn((d) => { Object.assign(data, d); }),
    newId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

describe('session-lifecycle', () => {
  describe('collectGoalSessionKeys', () => {
    it('collects session keys from goal sessions and tasks', () => {
      const goal = {
        sessions: ['session:a', 'session:b'],
        tasks: [
          { id: 't1', sessionKey: 'session:c' },
          { id: 't2', sessionKey: null },
          { id: 't3', sessionKey: 'session:a' }, // duplicate
        ],
      };
      const keys = collectGoalSessionKeys(goal);
      expect(keys).toHaveLength(3); // a, b, c (deduped)
      expect(keys).toContain('session:a');
      expect(keys).toContain('session:b');
      expect(keys).toContain('session:c');
    });

    it('returns empty for goal with no sessions', () => {
      expect(collectGoalSessionKeys({ sessions: [], tasks: [] })).toEqual([]);
    });
  });

  describe('collectCondoSessionKeys', () => {
    it('collects from sessionCondoIndex and goals', () => {
      const data = {
        sessionCondoIndex: { 'sk:pm': 'condo_1', 'sk:other': 'condo_2' },
        goals: [
          { condoId: 'condo_1', sessions: ['sk:goal1'], tasks: [{ sessionKey: 'sk:task1' }] },
          { condoId: 'condo_2', sessions: ['sk:goal2'], tasks: [] },
        ],
      };
      const keys = collectCondoSessionKeys(data, 'condo_1');
      expect(keys).toContain('sk:pm');
      expect(keys).toContain('sk:goal1');
      expect(keys).toContain('sk:task1');
      expect(keys).not.toContain('sk:other');
      expect(keys).not.toContain('sk:goal2');
    });
  });

  describe('sessions.killForGoal', () => {
    it('aborts all sessions and resets task assignments', async () => {
      const abortedKeys = [];
      const mockRpcCall = vi.fn(async (method, params) => {
        abortedKeys.push(params.sessionKey);
        return {};
      });

      const data = {
        goals: [{
          id: 'goal_1',
          sessions: ['sk:1'],
          tasks: [
            { id: 't1', sessionKey: 'sk:2', status: 'in-progress', updatedAtMs: 0 },
            { id: 't2', sessionKey: null, status: 'pending', updatedAtMs: 0 },
            { id: 't3', sessionKey: 'sk:3', status: 'done', updatedAtMs: 0 },
          ],
          updatedAtMs: 0,
        }],
        condos: [],
        sessionCondoIndex: {},
        sessionIndex: {},
      };

      const store = createMockStore(data);
      const handlers = createSessionLifecycleHandlers(store, { rpcCall: mockRpcCall });

      let result;
      await handlers['sessions.killForGoal']({
        params: { goalId: 'goal_1' },
        respond: (ok, d) => { result = { ok, data: d }; },
      });

      expect(result.ok).toBe(true);
      expect(result.data.total).toBe(3); // sk:1, sk:2, sk:3
      expect(result.data.aborted).toBe(3);

      // in-progress task should be reset to pending with cleared sessionKey
      expect(data.goals[0].tasks[0].status).toBe('pending');
      expect(data.goals[0].tasks[0].sessionKey).toBeNull();
      // done task should keep its status
      expect(data.goals[0].tasks[2].status).toBe('done');
      expect(data.goals[0].tasks[2].sessionKey).toBe('sk:3');
    });

    it('returns error for non-existent goal', async () => {
      const store = createMockStore({ goals: [], condos: [], sessionCondoIndex: {}, sessionIndex: {} });
      const handlers = createSessionLifecycleHandlers(store, { rpcCall: vi.fn() });

      let result;
      await handlers['sessions.killForGoal']({
        params: { goalId: 'nonexistent' },
        respond: (ok, d, err) => { result = { ok, err }; },
      });

      expect(result.ok).toBe(false);
      expect(result.err).toBe('Goal not found');
    });
  });

  describe('sessions.killForCondo', () => {
    it('aborts all sessions across all goals in condo', async () => {
      const mockRpcCall = vi.fn(async () => ({}));

      const data = {
        condos: [{ id: 'condo_1', name: 'Test' }],
        goals: [
          { id: 'g1', condoId: 'condo_1', sessions: [], tasks: [{ id: 't1', sessionKey: 'sk:a', status: 'in-progress', updatedAtMs: 0 }], updatedAtMs: 0 },
          { id: 'g2', condoId: 'condo_1', sessions: ['sk:b'], tasks: [], updatedAtMs: 0 },
        ],
        sessionCondoIndex: { 'sk:pm': 'condo_1' },
        sessionIndex: {},
      };

      const store = createMockStore(data);
      const handlers = createSessionLifecycleHandlers(store, { rpcCall: mockRpcCall });

      let result;
      await handlers['sessions.killForCondo']({
        params: { condoId: 'condo_1' },
        respond: (ok, d) => { result = { ok, data: d }; },
      });

      expect(result.ok).toBe(true);
      expect(result.data.total).toBe(3); // sk:pm, sk:a, sk:b
      expect(result.data.aborted).toBe(3);
    });
  });

  describe('sessions.listForCondo', () => {
    it('lists all sessions with task status', () => {
      const data = {
        condos: [{ id: 'condo_1', name: 'Test' }],
        goals: [{
          id: 'g1',
          condoId: 'condo_1',
          title: 'Goal 1',
          sessions: [],
          tasks: [
            { id: 't1', text: 'Task 1', sessionKey: 'sk:1', status: 'in-progress' },
            { id: 't2', text: 'Task 2', sessionKey: null, status: 'pending' },
          ],
        }],
        sessionCondoIndex: { 'sk:pm': 'condo_1' },
      };

      const store = createMockStore(data);
      const handlers = createSessionLifecycleHandlers(store, { rpcCall: vi.fn() });

      let result;
      handlers['sessions.listForCondo']({
        params: { condoId: 'condo_1' },
        respond: (ok, d) => { result = { ok, data: d }; },
      });

      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(2); // sk:1 (task) + sk:pm (condo session)
      expect(result.data.sessions.find(s => s.sessionKey === 'sk:1').taskStatus).toBe('in-progress');
    });
  });
});
