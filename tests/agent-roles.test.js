import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAgentForRole, getDefaultRoles, resolveAgent, getPmSession, buildSessionKey, getOrCreatePmSessionForGoal, getOrCreatePmSessionForCondo, isPmSession } from '../clawcondos/condo-management/lib/agent-roles.js';

describe('agent-roles', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getDefaultRoles', () => {
    it('returns default role mappings', () => {
      const roles = getDefaultRoles();
      expect(roles).toHaveProperty('pm', 'main');
      expect(roles).toHaveProperty('frontend', 'frontend');
      expect(roles).toHaveProperty('backend', 'backend');
      expect(roles).toHaveProperty('designer', 'designer');
      expect(roles).toHaveProperty('tester', 'tester');
    });

    it('respects environment variables for defaults', () => {
      process.env.CLAWCONDOS_PM_AGENT = 'custom-pm';
      process.env.CLAWCONDOS_FRONTEND_AGENT = 'custom-frontend';
      
      const roles = getDefaultRoles();
      expect(roles.pm).toBe('custom-pm');
      expect(roles.frontend).toBe('custom-frontend');
    });
  });

  describe('getAgentForRole', () => {
    it('returns configured agent from store.config.agentRoles', () => {
      const data = {
        config: {
          agentRoles: {
            backend: 'blake',
            frontend: 'felix',
          },
        },
      };
      
      expect(getAgentForRole(data, 'backend')).toBe('blake');
      expect(getAgentForRole(data, 'frontend')).toBe('felix');
    });

    it('falls back to environment variable', () => {
      process.env.CLAWCONDOS_BACKEND_AGENT = 'env-backend';
      const data = { config: {} };
      
      expect(getAgentForRole(data, 'backend')).toBe('env-backend');
    });

    it('falls back to role name as agent ID', () => {
      const data = { config: {} };
      expect(getAgentForRole(data, 'designer')).toBe('designer');
    });

    it('works with store instance (load function)', () => {
      const store = {
        load: () => ({
          config: {
            agentRoles: { pm: 'claudia' },
          },
        }),
      };
      
      expect(getAgentForRole(store, 'pm')).toBe('claudia');
    });
  });

  describe('resolveAgent', () => {
    it('resolves known roles to agent IDs', () => {
      const store = {
        load: () => ({
          config: {
            agentRoles: { frontend: 'felix' },
          },
        }),
      };
      
      expect(resolveAgent(store, 'frontend')).toBe('felix');
    });

    it('passes through direct agent IDs', () => {
      const store = { load: () => ({ config: {} }) };
      expect(resolveAgent(store, 'my-custom-agent')).toBe('my-custom-agent');
    });

    it('returns null for null/undefined input', () => {
      const store = { load: () => ({ config: {} }) };
      expect(resolveAgent(store, null)).toBeNull();
      expect(resolveAgent(store, undefined)).toBeNull();
    });
  });

  describe('getPmSession', () => {
    it('returns condo-specific pmSession if set', () => {
      const store = {
        load: () => ({
          condos: [{ id: 'condo_1', pmSession: 'agent:custom-pm:main' }],
          config: { pmSession: 'agent:global-pm:main' },
        }),
      };
      
      expect(getPmSession(store, 'condo_1')).toBe('agent:custom-pm:main');
    });

    it('falls back to global config pmSession', () => {
      const store = {
        load: () => ({
          condos: [{ id: 'condo_1' }],
          config: { pmSession: 'agent:global-pm:main' },
        }),
      };
      
      expect(getPmSession(store, 'condo_1')).toBe('agent:global-pm:main');
    });

    it('falls back to environment variable', () => {
      process.env.CLAWCONDOS_PM_SESSION = 'agent:env-pm:main';
      const store = {
        load: () => ({
          condos: [],
          config: {},
        }),
      };
      
      expect(getPmSession(store, null)).toBe('agent:env-pm:main');
    });

    it('falls back to system default', () => {
      delete process.env.CLAWCONDOS_PM_SESSION;
      const store = {
        load: () => ({
          condos: [],
          config: {},
        }),
      };
      
      expect(getPmSession(store, null)).toBe('agent:main:main');
    });
  });

  describe('buildSessionKey', () => {
    it('builds basic session key', () => {
      expect(buildSessionKey('backend', 'main')).toBe('agent:backend:main');
    });

    it('includes subId when provided', () => {
      expect(buildSessionKey('backend', 'subagent', 'task_123')).toBe('agent:backend:subagent:task_123');
    });

    it('defaults to main session type', () => {
      expect(buildSessionKey('frontend')).toBe('agent:frontend:main');
    });
  });

  describe('getOrCreatePmSessionForGoal', () => {
    it('creates a PM session on first call with webchat key format', () => {
      let savedData = null;
      const data = {
        goals: [{ id: 'goal_1', condoId: 'condo_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionIndex: {},
      };
      const store = {
        load: () => data,
        save: (d) => { savedData = d; },
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_1');

      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-goal_1');
      expect(result.created).toBe(true);
      expect(data.goals[0].pmSessionKey).toBe('agent:claudia:webchat:pm-goal_1');
      expect(data.sessionIndex['agent:claudia:webchat:pm-goal_1']).toEqual({ goalId: 'goal_1' });
      expect(savedData).toBe(data);
    });

    it('returns existing webchat session on subsequent calls (created: false)', () => {
      const data = {
        goals: [{ id: 'goal_1', condoId: 'condo_1', pmSessionKey: 'agent:claudia:webchat:pm-goal_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionIndex: { 'agent:claudia:webchat:pm-goal_1': { goalId: 'goal_1' } },
      };
      const store = {
        load: () => data,
        save: vi.fn(),
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_1');

      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-goal_1');
      expect(result.created).toBe(false);
      expect(store.save).not.toHaveBeenCalled();
    });

    it('migrates old subagent key to webchat format', () => {
      const data = {
        goals: [{ id: 'goal_1', condoId: 'condo_1', pmSessionKey: 'agent:claudia:subagent:pm-goal_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionIndex: { 'agent:claudia:subagent:pm-goal_1': { goalId: 'goal_1' } },
      };
      const store = {
        load: () => data,
        save: vi.fn(),
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_1');

      // Should create a new webchat key and clean up old subagent key
      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-goal_1');
      expect(result.created).toBe(true);
      expect(data.sessionIndex['agent:claudia:subagent:pm-goal_1']).toBeUndefined();
      expect(data.sessionIndex['agent:claudia:webchat:pm-goal_1']).toEqual({ goalId: 'goal_1' });
    });

    it('uses configured PM agent ID from config.agentRoles.pm', () => {
      const data = {
        goals: [{ id: 'goal_2', condoId: 'condo_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: { agentRoles: { pm: 'my-pm-agent' } },
        sessionIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_2');
      expect(result.pmSessionKey).toBe('agent:my-pm-agent:webchat:pm-goal_2');
    });

    it('falls back to default PM agent (main) when no config', () => {
      const data = {
        goals: [{ id: 'goal_3', condoId: 'condo_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: {},
        sessionIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_3');
      expect(result.pmSessionKey).toBe('agent:main:webchat:pm-goal_3');
    });

    it('throws for unknown goal', () => {
      const data = {
        goals: [],
        condos: [],
        config: {},
        sessionIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      expect(() => getOrCreatePmSessionForGoal(store, 'nonexistent')).toThrow('Goal nonexistent not found');
    });

    it('initializes sessionIndex if missing', () => {
      const data = {
        goals: [{ id: 'goal_4', condoId: 'condo_1', tasks: [] }],
        condos: [{ id: 'condo_1' }],
        config: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForGoal(store, 'goal_4');
      expect(data.sessionIndex).toBeDefined();
      expect(data.sessionIndex[result.pmSessionKey]).toEqual({ goalId: 'goal_4' });
    });
  });

  describe('isPmSession', () => {
    it('recognizes webchat PM session keys (new format)', () => {
      expect(isPmSession('agent:main:webchat:pm-goal_1')).toBe(true);
      expect(isPmSession('agent:claudia:webchat:pm-goal_abc')).toBe(true);
      expect(isPmSession('agent:main:webchat:pm-condo-condo_1')).toBe(true);
      expect(isPmSession('agent:claudia:webchat:pm-condo-abc')).toBe(true);
    });

    it('recognizes legacy subagent PM session keys (backward compat)', () => {
      expect(isPmSession('agent:main:subagent:pm-goal_1')).toBe(true);
      expect(isPmSession('agent:claudia:subagent:pm-goal_abc')).toBe(true);
      expect(isPmSession('agent:main:subagent:pm-condo-condo_1')).toBe(true);
    });

    it('rejects worker/task subagent keys', () => {
      expect(isPmSession('agent:backend:subagent:task_123')).toBe(false);
      expect(isPmSession('agent:main:subagent:abc123')).toBe(false);
    });

    it('rejects main session keys', () => {
      expect(isPmSession('agent:main:main')).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isPmSession(null)).toBe(false);
      expect(isPmSession(undefined)).toBe(false);
      expect(isPmSession(123)).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isPmSession('')).toBe(false);
    });

    it('rejects webchat sessions that are not PM sessions', () => {
      expect(isPmSession('agent:main:webchat:12345')).toBe(false);
      expect(isPmSession('agent:claudia:webchat:chat-abc')).toBe(false);
    });
  });

  describe('getOrCreatePmSessionForCondo', () => {
    it('creates a condo PM session on first call with webchat key format', () => {
      let savedData = null;
      const data = {
        goals: [],
        condos: [{ id: 'condo_1', name: 'Test Condo' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionCondoIndex: {},
      };
      const store = {
        load: () => data,
        save: (d) => { savedData = d; },
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_1');

      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-condo-condo_1');
      expect(result.created).toBe(true);
      expect(data.condos[0].pmCondoSessionKey).toBe('agent:claudia:webchat:pm-condo-condo_1');
      expect(data.sessionCondoIndex['agent:claudia:webchat:pm-condo-condo_1']).toBe('condo_1');
      expect(savedData).toBe(data);
    });

    it('returns existing webchat session on subsequent calls (created: false)', () => {
      const data = {
        goals: [],
        condos: [{ id: 'condo_1', name: 'Test Condo', pmCondoSessionKey: 'agent:claudia:webchat:pm-condo-condo_1' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionCondoIndex: { 'agent:claudia:webchat:pm-condo-condo_1': 'condo_1' },
      };
      const store = {
        load: () => data,
        save: vi.fn(),
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_1');

      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-condo-condo_1');
      expect(result.created).toBe(false);
      expect(store.save).not.toHaveBeenCalled();
    });

    it('migrates old subagent key to webchat format', () => {
      const data = {
        goals: [],
        condos: [{ id: 'condo_1', name: 'Test Condo', pmCondoSessionKey: 'agent:claudia:subagent:pm-condo-condo_1' }],
        config: { agentRoles: { pm: 'claudia' } },
        sessionCondoIndex: { 'agent:claudia:subagent:pm-condo-condo_1': 'condo_1' },
      };
      const store = {
        load: () => data,
        save: vi.fn(),
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_1');

      // Should create new webchat key and clean up old subagent key
      expect(result.pmSessionKey).toBe('agent:claudia:webchat:pm-condo-condo_1');
      expect(result.created).toBe(true);
      expect(data.sessionCondoIndex['agent:claudia:subagent:pm-condo-condo_1']).toBeUndefined();
      expect(data.sessionCondoIndex['agent:claudia:webchat:pm-condo-condo_1']).toBe('condo_1');
    });

    it('uses configured PM agent ID from config.agentRoles.pm', () => {
      const data = {
        goals: [],
        condos: [{ id: 'condo_2', name: 'Another Condo' }],
        config: { agentRoles: { pm: 'my-pm-agent' } },
        sessionCondoIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_2');
      expect(result.pmSessionKey).toBe('agent:my-pm-agent:webchat:pm-condo-condo_2');
    });

    it('falls back to default PM agent (main) when no config', () => {
      const data = {
        goals: [],
        condos: [{ id: 'condo_3', name: 'Third Condo' }],
        config: {},
        sessionCondoIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_3');
      expect(result.pmSessionKey).toBe('agent:main:webchat:pm-condo-condo_3');
    });

    it('throws for unknown condo', () => {
      const data = {
        goals: [],
        condos: [],
        config: {},
        sessionCondoIndex: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      expect(() => getOrCreatePmSessionForCondo(store, 'nonexistent')).toThrow('Condo nonexistent not found');
    });

    it('initializes sessionCondoIndex if missing', () => {
      const data = {
        goals: [],
        condos: [{ id: 'condo_4', name: 'Fourth Condo' }],
        config: {},
      };
      const store = {
        load: () => data,
        save: () => {},
      };

      const result = getOrCreatePmSessionForCondo(store, 'condo_4');
      expect(data.sessionCondoIndex).toBeDefined();
      expect(data.sessionCondoIndex[result.pmSessionKey]).toBe('condo_4');
    });
  });
});
