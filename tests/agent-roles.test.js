import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAgentForRole, getDefaultRoles, resolveAgent, getPmSession, buildSessionKey } from '../clawcondos/condo-management/lib/agent-roles.js';

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
});
