import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getPmSkillContext,
  getWorkerSkillContext,
  getSkillAvailability,
  clearSkillCache,
} from '../clawcondos/condo-management/lib/skill-injector.js';

describe('Skill Injector', () => {
  beforeEach(() => {
    clearSkillCache();
  });

  describe('getPmSkillContext', () => {
    it('returns PM skill content', () => {
      const context = getPmSkillContext();
      expect(context).toBeTruthy();
      expect(context).toContain('SKILL-PM');
      expect(context).toContain('Project Manager');
    });

    it('includes condo context when provided', () => {
      const context = getPmSkillContext({
        condoId: 'condo_123',
        condoName: 'My Project',
        activeGoals: 3,
        totalTasks: 10,
        pendingTasks: 5,
      });

      expect(context).toContain('My Project');
      expect(context).toContain('condo_123');
      expect(context).toContain('Active Goals:** 3');
      expect(context).toContain('Tasks:** 10 total, 5 pending');
    });

    it('includes PM Session Context header', () => {
      const context = getPmSkillContext();
      expect(context).toContain('## PM Session Context');
    });
  });

  describe('getWorkerSkillContext', () => {
    it('returns worker skill content', () => {
      const context = getWorkerSkillContext({
        goalId: 'goal_123',
        taskId: 'task_456',
        taskText: 'Implement feature X',
      });

      expect(context).toBeTruthy();
      expect(context).toContain('SKILL-WORKER');
      expect(context).toContain('Task Agent');
    });

    it('includes task details', () => {
      const context = getWorkerSkillContext({
        goalId: 'goal_123',
        taskId: 'task_456',
        taskText: 'Implement feature X',
        taskDescription: 'Detailed description here',
        goalTitle: 'Feature Y',
        condoName: 'My Project',
        autonomyMode: 'semi',
        planFilePath: '/path/to/plan.md',
        assignedRole: 'backend',
      });

      expect(context).toContain('## Your Task Assignment');
      expect(context).toContain('My Project');
      expect(context).toContain('Feature Y');
      expect(context).toContain('task_456');
      expect(context).toContain('Implement feature X');
      expect(context).toContain('Detailed description here');
      expect(context).toContain('backend');
      expect(context).toContain('semi');
      expect(context).toContain('/path/to/plan.md');
    });

    it('handles minimal context', () => {
      const context = getWorkerSkillContext({
        goalId: 'goal_123',
        taskId: 'task_456',
        taskText: 'Do something',
      });

      expect(context).toBeTruthy();
      expect(context).toContain('task_456');
      expect(context).toContain('Do something');
    });
  });

  describe('getSkillAvailability', () => {
    it('reports availability of skill files', () => {
      const availability = getSkillAvailability();
      
      expect(availability).toHaveProperty('pm');
      expect(availability).toHaveProperty('worker');
      // Both should be true since we created the files
      expect(availability.pm).toBe(true);
      expect(availability.worker).toBe(true);
    });
  });

  describe('caching', () => {
    it('caches skill file reads', () => {
      // First call loads from disk
      const context1 = getPmSkillContext();
      // Second call should use cache
      const context2 = getPmSkillContext();
      
      expect(context1).toBe(context2);
    });

    it('clearSkillCache resets cache', () => {
      getPmSkillContext();
      clearSkillCache();
      // Should reload from disk
      const context = getPmSkillContext();
      expect(context).toBeTruthy();
    });
  });
});
