import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createGoalsStore } from '../clawcondos/condo-management/lib/goals-store.js';
import { createRolesHandlers } from '../clawcondos/condo-management/lib/roles-handlers.js';

const TEST_DIR = join(import.meta.dirname, '__fixtures__', 'roles-handlers-test');

describe('Roles Handlers', () => {
  let store;
  let handlers;
  let broadcastCalls;
  let logger;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
    store = createGoalsStore(TEST_DIR);
    broadcastCalls = [];
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    handlers = createRolesHandlers(store, {
      broadcast: (msg) => broadcastCalls.push(msg),
      logger,
    });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('roles.assign', () => {
    it('assigns a role to an agent', () => {
      let result;
      handlers['roles.assign']({
        params: { agentId: 'felix', role: 'frontend' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      expect(result.payload.agentId).toBe('felix');
      expect(result.payload.role).toBe('frontend');
      expect(result.payload.label).toContain('Félix');

      // Verify persistence
      const data = store.load();
      expect(data.config.agentRoles.frontend).toBe('felix');
    });

    it('broadcasts roles.updated event', () => {
      handlers['roles.assign']({
        params: { agentId: 'blake', role: 'backend' },
        respond: () => {},
      });

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].event).toBe('roles.updated');
      expect(broadcastCalls[0].payload.agentId).toBe('blake');
      expect(broadcastCalls[0].payload.role).toBe('backend');
    });

    it('returns error if agentId missing', () => {
      let result;
      handlers['roles.assign']({
        params: { role: 'frontend' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(false);
      expect(result.err).toContain('agentId is required');
    });

    it('returns error if role missing', () => {
      let result;
      handlers['roles.assign']({
        params: { agentId: 'felix' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(false);
      expect(result.err).toContain('role is required');
    });

    it('normalizes role to lowercase', () => {
      let result;
      handlers['roles.assign']({
        params: { agentId: 'felix', role: 'FrontEnd' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      expect(result.payload.role).toBe('frontend');
    });
  });

  describe('roles.list', () => {
    it('returns default roles when no custom assignments', () => {
      let result;
      handlers['roles.list']({
        params: {},
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      expect(result.payload.agents).toBeInstanceOf(Array);
      
      // Should include default role assignments
      const frontend = result.payload.agents.find(a => a.roles.includes('frontend'));
      expect(frontend).toBeTruthy();
    });

    it('returns custom assignments', () => {
      // Assign custom role
      handlers['roles.assign']({
        params: { agentId: 'felix', role: 'frontend' },
        respond: () => {},
      });

      let result;
      handlers['roles.list']({
        params: {},
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      const felix = result.payload.agents.find(a => a.id === 'felix');
      expect(felix).toBeTruthy();
      expect(felix.roles).toContain('frontend');
      expect(felix.isConfigured).toBe(true);
      expect(felix.label).toContain('Félix');
    });

    it('includes emoji and name in agent entries', () => {
      handlers['roles.assign']({
        params: { agentId: 'blake', role: 'backend' },
        respond: () => {},
      });

      let result;
      handlers['roles.list']({
        params: {},
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      const blake = result.payload.agents.find(a => a.id === 'blake');
      expect(blake.emoji).toBe('⚙️');
      expect(blake.name).toBe('Blake');
    });

    it('generates default label for unknown agents', () => {
      handlers['roles.assign']({
        params: { agentId: 'newagent', role: 'custom' },
        respond: () => {},
      });

      let result;
      handlers['roles.list']({
        params: {},
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      const newagent = result.payload.agents.find(a => a.id === 'newagent');
      expect(newagent).toBeTruthy();
      expect(newagent.emoji).toBe('🤖');
      expect(newagent.name).toBe('Newagent');
    });
  });

  describe('roles.unassign', () => {
    it('removes role assignment', () => {
      // First assign
      handlers['roles.assign']({
        params: { agentId: 'felix', role: 'frontend' },
        respond: () => {},
      });

      // Then unassign
      let result;
      handlers['roles.unassign']({
        params: { role: 'frontend' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      expect(result.payload.previousAgent).toBe('felix');

      // Verify removal
      const data = store.load();
      expect(data.config.agentRoles?.frontend).toBeUndefined();
    });

    it('returns ok for unassigned role', () => {
      let result;
      handlers['roles.unassign']({
        params: { role: 'nonexistent' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      // Returns appropriate message for no assignments or role not found
      expect(result.payload.note).toMatch(/No custom role assignments exist|Role was not assigned/);
    });

    it('broadcasts roles.updated event', () => {
      handlers['roles.assign']({
        params: { agentId: 'felix', role: 'frontend' },
        respond: () => {},
      });
      broadcastCalls = [];

      handlers['roles.unassign']({
        params: { role: 'frontend' },
        respond: () => {},
      });

      expect(broadcastCalls).toHaveLength(1);
      expect(broadcastCalls[0].event).toBe('roles.updated');
      expect(broadcastCalls[0].payload.agentId).toBeNull();
    });
  });

  describe('roles.setLabel', () => {
    it('sets custom label for agent', () => {
      let result;
      handlers['roles.setLabel']({
        params: { agentId: 'myagent', emoji: '🚀', name: 'Rocket Agent' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(true);
      expect(result.payload.emoji).toBe('🚀');
      expect(result.payload.name).toBe('Rocket Agent');
      expect(result.payload.label).toBe('Rocket Agent 🚀');

      // Verify persistence
      const data = store.load();
      expect(data.config.agentLabels.myagent).toEqual({ emoji: '🚀', name: 'Rocket Agent' });
    });

    it('updates only emoji if name not provided', () => {
      handlers['roles.setLabel']({
        params: { agentId: 'felix', emoji: '🌟' },
        respond: () => {},
      });

      let result;
      handlers['roles.list']({
        params: {},
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      // Felix should use the configured emoji but keep existing name pattern
      const data = store.load();
      expect(data.config.agentLabels.felix.emoji).toBe('🌟');
    });

    it('returns error if agentId missing', () => {
      let result;
      handlers['roles.setLabel']({
        params: { emoji: '🚀' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(false);
      expect(result.err).toContain('agentId is required');
    });

    it('returns error if neither emoji nor name provided', () => {
      let result;
      handlers['roles.setLabel']({
        params: { agentId: 'myagent' },
        respond: (ok, payload, err) => { result = { ok, payload, err }; },
      });

      expect(result.ok).toBe(false);
      expect(result.err).toContain('emoji or name is required');
    });
  });
});
