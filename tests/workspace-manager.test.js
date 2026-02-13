import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  sanitizeDirName,
  condoWorkspacePath,
  goalWorktreePath,
  goalBranchName,
  createCondoWorkspace,
  createGoalWorktree,
  removeGoalWorktree,
  removeCondoWorkspace,
} from '../clawcondos/condo-management/lib/workspace-manager.js';

const TEST_BASE = join(import.meta.dirname, '__fixtures__', 'workspace-manager-test');

describe('workspace-manager', () => {
  beforeEach(() => {
    rmSync(TEST_BASE, { recursive: true, force: true });
    mkdirSync(TEST_BASE, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_BASE, { recursive: true, force: true });
  });

  // ── sanitizeDirName ──────────────────────────────────────────────

  describe('sanitizeDirName', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(sanitizeDirName('My Cool Project')).toBe('my-cool-project');
    });

    it('strips leading/trailing hyphens', () => {
      expect(sanitizeDirName('  --Hello World-- ')).toBe('hello-world');
    });

    it('collapses multiple non-alphanumeric characters', () => {
      expect(sanitizeDirName('foo!!!bar___baz')).toBe('foo-bar-baz');
    });

    it('truncates to 60 characters', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeDirName(long).length).toBeLessThanOrEqual(60);
    });

    it('returns "workspace" for empty or all-special input', () => {
      expect(sanitizeDirName('---')).toBe('workspace');
      expect(sanitizeDirName('')).toBe('workspace');
    });
  });

  // ── path builders ────────────────────────────────────────────────

  describe('condoWorkspacePath', () => {
    it('builds path with slug and id suffix', () => {
      const result = condoWorkspacePath('/workspaces', 'condo_abcdef12', 'My Project');
      expect(result).toBe('/workspaces/my-project-abcdef12');
    });

    it('uses first 8 chars of id after condo_ prefix', () => {
      const result = condoWorkspacePath('/ws', 'condo_1234567890abcdef', 'Test');
      expect(result).toBe('/ws/test-12345678');
    });
  });

  describe('goalWorktreePath', () => {
    it('builds path under goals/ subdirectory', () => {
      expect(goalWorktreePath('/ws/project', 'goal_xyz')).toBe('/ws/project/goals/goal_xyz');
    });
  });

  describe('goalBranchName', () => {
    it('prefixes with goal/', () => {
      expect(goalBranchName('goal_abc123')).toBe('goal/goal_abc123');
    });
  });

  // ── createCondoWorkspace ─────────────────────────────────────────

  describe('createCondoWorkspace', () => {
    it('creates a git-initialized workspace with empty initial commit', () => {
      const result = createCondoWorkspace(TEST_BASE, 'condo_abc123', 'Test Workspace');
      expect(result.ok).toBe(true);
      expect(result.path).toBeTruthy();
      expect(existsSync(result.path)).toBe(true);
      expect(result.existed).toBeUndefined();

      // Verify it's a git repo
      const gitDir = join(result.path, '.git');
      expect(existsSync(gitDir)).toBe(true);

      // Verify there is at least one commit (HEAD exists)
      const log = execSync('git log --oneline -1', { cwd: result.path, encoding: 'utf-8' });
      expect(log).toContain('Initial commit');

      // Verify goals/ subdirectory exists
      expect(existsSync(join(result.path, 'goals'))).toBe(true);
    });

    it('is idempotent — returns existed: true for existing directory', () => {
      const first = createCondoWorkspace(TEST_BASE, 'condo_idem', 'Idempotent');
      expect(first.ok).toBe(true);

      const second = createCondoWorkspace(TEST_BASE, 'condo_idem', 'Idempotent');
      expect(second.ok).toBe(true);
      expect(second.existed).toBe(true);
      expect(second.path).toBe(first.path);
    });

    it('creates base directory if it does not exist', () => {
      const nestedBase = join(TEST_BASE, 'nested', 'deep');
      expect(existsSync(nestedBase)).toBe(false);

      const result = createCondoWorkspace(nestedBase, 'condo_nested', 'Nested');
      expect(result.ok).toBe(true);
      expect(existsSync(result.path)).toBe(true);
    });

    it('returns error for invalid clone URL without throwing', () => {
      const result = createCondoWorkspace(TEST_BASE, 'condo_bad', 'Bad Clone', 'not-a-valid-url');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ── createGoalWorktree ───────────────────────────────────────────

  describe('createGoalWorktree', () => {
    let condoWs;

    beforeEach(() => {
      const r = createCondoWorkspace(TEST_BASE, 'condo_wt', 'Worktree Test');
      condoWs = r.path;
    });

    it('creates a worktree with the correct branch', () => {
      const result = createGoalWorktree(condoWs, 'goal_abc');
      expect(result.ok).toBe(true);
      expect(result.branch).toBe('goal/goal_abc');
      expect(existsSync(result.path)).toBe(true);

      // Verify the branch exists
      const branches = execSync('git branch --list', { cwd: condoWs, encoding: 'utf-8' });
      expect(branches).toContain('goal/goal_abc');
    });

    it('creates multiple independent worktrees', () => {
      const r1 = createGoalWorktree(condoWs, 'goal_one');
      const r2 = createGoalWorktree(condoWs, 'goal_two');
      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r1.path).not.toBe(r2.path);

      // Both branches exist
      const branches = execSync('git branch --list', { cwd: condoWs, encoding: 'utf-8' });
      expect(branches).toContain('goal/goal_one');
      expect(branches).toContain('goal/goal_two');
    });

    it('is idempotent — returns existed: true if worktree already exists', () => {
      createGoalWorktree(condoWs, 'goal_idem');
      const second = createGoalWorktree(condoWs, 'goal_idem');
      expect(second.ok).toBe(true);
      expect(second.existed).toBe(true);
    });

    it('returns error for invalid condoWs without throwing', () => {
      const result = createGoalWorktree('/nonexistent/path', 'goal_bad');
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  // ── removeGoalWorktree ───────────────────────────────────────────

  describe('removeGoalWorktree', () => {
    let condoWs;

    beforeEach(() => {
      const r = createCondoWorkspace(TEST_BASE, 'condo_rm', 'Remove Test');
      condoWs = r.path;
    });

    it('removes an existing worktree and its branch', () => {
      createGoalWorktree(condoWs, 'goal_del');
      const wtPath = goalWorktreePath(condoWs, 'goal_del');
      expect(existsSync(wtPath)).toBe(true);

      const result = removeGoalWorktree(condoWs, 'goal_del');
      expect(result.ok).toBe(true);
      expect(existsSync(wtPath)).toBe(false);

      // Branch should be cleaned up
      const branches = execSync('git branch --list', { cwd: condoWs, encoding: 'utf-8' });
      expect(branches).not.toContain('goal/goal_del');
    });

    it('succeeds even if worktree does not exist (no-op)', () => {
      const result = removeGoalWorktree(condoWs, 'goal_nonexistent');
      expect(result.ok).toBe(true);
    });
  });

  // ── removeCondoWorkspace ─────────────────────────────────────────

  describe('removeCondoWorkspace', () => {
    it('removes the entire workspace directory', () => {
      const r = createCondoWorkspace(TEST_BASE, 'condo_nuke', 'Nuke Me');
      expect(existsSync(r.path)).toBe(true);

      const result = removeCondoWorkspace(r.path);
      expect(result.ok).toBe(true);
      expect(existsSync(r.path)).toBe(false);
    });

    it('succeeds if directory does not exist (no-op)', () => {
      const result = removeCondoWorkspace(join(TEST_BASE, 'nonexistent'));
      expect(result.ok).toBe(true);
    });
  });
});
