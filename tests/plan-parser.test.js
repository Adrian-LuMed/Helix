import { describe, it, expect } from 'vitest';
import {
  parseTasksFromPlan,
  parseTasksFromTable,
  parseTasksFromLists,
  detectPlan,
  detectCondoPlan,
  parseGoalsFromPlan,
  normalizeAgentToRole,
  getSupportedRoles,
} from '../clawcondos/condo-management/lib/plan-parser.js';

describe('plan-parser', () => {
  describe('detectCondoPlan', () => {
    it('detects ## Goals header', () => {
      expect(detectCondoPlan('## Goals\n| # | Goal | Description |')).toBe(true);
    });

    it('detects ## Milestones header', () => {
      expect(detectCondoPlan('Here is my plan:\n## Milestones\n1. First milestone')).toBe(true);
    });

    it('detects ## Objectives header', () => {
      expect(detectCondoPlan('### Objectives\n- Objective one')).toBe(true);
    });

    it('detects goal table with | Goal | column', () => {
      expect(detectCondoPlan('| # | Goal | Description | Priority |\n|---|------|-------------|----------|')).toBe(true);
    });

    it('detects goal table with | Milestone | column', () => {
      expect(detectCondoPlan('| Milestone | Description |\n|-----------|-------------|')).toBe(true);
    });

    it('falls back to general plan detection', () => {
      expect(detectCondoPlan('## Plan\n| Task | Agent |\n|------|-------|')).toBe(true);
    });

    it('returns false for non-plan content', () => {
      expect(detectCondoPlan('Hello, how are you?')).toBe(false);
    });

    it('returns false for null/empty input', () => {
      expect(detectCondoPlan(null)).toBe(false);
      expect(detectCondoPlan('')).toBe(false);
    });
  });

  describe('parseGoalsFromPlan', () => {
    it('parses goals from a markdown table', () => {
      const content = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Setup authentication | Implement JWT auth flow | high |
| 2 | Build dashboard UI | Create the main dashboard | medium |
| 3 | Add API endpoints | REST API for CRUD operations | low |`;

      const result = parseGoalsFromPlan(content);
      expect(result.hasPlan).toBe(true);
      expect(result.goals).toHaveLength(3);
      expect(result.goals[0].title).toBe('Setup authentication');
      expect(result.goals[0].description).toBe('Implement JWT auth flow');
      expect(result.goals[0].priority).toBe('high');
      expect(result.goals[1].title).toBe('Build dashboard UI');
      expect(result.goals[2].title).toBe('Add API endpoints');
      expect(result.goals[2].priority).toBe('low');
    });

    it('parses goals with embedded per-goal tasks', () => {
      const content = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | Auth system | User authentication | high |
| 2 | Dashboard | Main UI | medium |

#### Auth system
- Implement JWT middleware (backend)
- Create login form (frontend)

#### Dashboard
- Design layout (designer)
- Build components (frontend)`;

      const result = parseGoalsFromPlan(content);
      expect(result.hasPlan).toBe(true);
      expect(result.goals).toHaveLength(2);
      expect(result.goals[0].title).toBe('Auth system');
      expect(result.goals[0].tasks.length).toBeGreaterThanOrEqual(1);
      expect(result.goals[1].title).toBe('Dashboard');
      expect(result.goals[1].tasks.length).toBeGreaterThanOrEqual(1);
    });

    it('parses goals from section headings when no table present', () => {
      const content = `## Goals

#### Setup Backend
- Create database schema (backend)
- Implement API routes (backend)

#### Build Frontend
- Design components (frontend)
- Implement routing (frontend)`;

      const result = parseGoalsFromPlan(content);
      expect(result.hasPlan).toBe(true);
      expect(result.goals).toHaveLength(2);
      expect(result.goals[0].title).toBe('Setup Backend');
      expect(result.goals[1].title).toBe('Build Frontend');
    });

    it('returns empty for non-plan content', () => {
      const result = parseGoalsFromPlan('Hello, how are you?');
      expect(result.hasPlan).toBe(false);
      expect(result.goals).toHaveLength(0);
    });

    it('returns empty for null/empty input', () => {
      expect(parseGoalsFromPlan(null).goals).toHaveLength(0);
      expect(parseGoalsFromPlan('').goals).toHaveLength(0);
    });

    it('handles table without Goal column gracefully', () => {
      const content = `## Goals

| # | Item | Notes |
|---|------|-------|
| 1 | Something | Some notes |`;

      const result = parseGoalsFromPlan(content);
      // Should still detect the plan but may not extract goals without Goal column
      expect(result.hasPlan).toBe(true);
    });

    it('handles empty goals table', () => {
      const content = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|`;

      const result = parseGoalsFromPlan(content);
      expect(result.hasPlan).toBe(true);
      expect(result.goals).toHaveLength(0);
    });

    it('skips section headers that are clearly not goal titles', () => {
      const content = `## Goals

## Overview
This is an overview.

#### Real Goal
- Task one (backend)

## Summary
This wraps things up.`;

      const result = parseGoalsFromPlan(content);
      expect(result.goals.some(g => g.title === 'Real Goal')).toBe(true);
      expect(result.goals.some(g => g.title === 'Overview')).toBe(false);
      expect(result.goals.some(g => g.title === 'Summary')).toBe(false);
    });

    it('cleans markdown formatting from goal titles', () => {
      const content = `## Goals

| # | Goal | Description | Priority |
|---|------|-------------|----------|
| 1 | **Bold Goal** | Description here | high |`;

      const result = parseGoalsFromPlan(content);
      expect(result.goals[0].title).toBe('Bold Goal');
    });
  });

  describe('existing parseTasksFromPlan', () => {
    it('still works for task-level plans', () => {
      const content = `## Tasks

| # | Task | Agent | Time |
|---|------|-------|------|
| 1 | Build login page | frontend | 2h |
| 2 | Create API routes | backend | 3h |`;

      const result = parseTasksFromPlan(content);
      expect(result.hasPlan).toBe(true);
      expect(result.tasks).toHaveLength(2);
    });
  });
});
