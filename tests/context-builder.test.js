import { describe, it, expect } from 'vitest';
import { buildGoalContext } from '../openclaw-plugin/lib/context-builder.js';

describe('buildGoalContext', () => {
  const baseGoal = {
    id: 'goal_1',
    title: 'Ship v2',
    description: 'Launch the v2 release',
    status: 'active',
    priority: 'P0',
    deadline: '2026-02-15',
    tasks: [
      { id: 't1', text: 'Build API endpoints', done: true },
      { id: 't2', text: 'Wire up frontend', done: false },
      { id: 't3', text: 'Write tests', done: false },
    ],
    sessions: ['agent:main:main', 'agent:main:subagent:abc'],
    condoId: 'condo:clawcondos',
  };

  it('returns null if no goal provided', () => {
    expect(buildGoalContext(null)).toBeNull();
  });

  it('includes goal title and description', () => {
    const ctx = buildGoalContext(baseGoal);
    expect(ctx).toContain('Ship v2');
    expect(ctx).toContain('Launch the v2 release');
  });

  it('includes task list with completion markers', () => {
    const ctx = buildGoalContext(baseGoal);
    expect(ctx).toContain('[x] Build API endpoints');
    expect(ctx).toContain('[ ] Wire up frontend');
  });

  it('includes priority and deadline', () => {
    const ctx = buildGoalContext(baseGoal);
    expect(ctx).toContain('P0');
    expect(ctx).toContain('2026-02-15');
  });

  it('includes session count', () => {
    const ctx = buildGoalContext(baseGoal);
    expect(ctx).toContain('2');
  });
});
