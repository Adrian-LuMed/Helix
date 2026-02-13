/**
 * Workspace Manager
 * Creates and manages git workspaces for condos and git worktrees for goals.
 * All functions return { ok, path?, error? } result objects (never throw).
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

/**
 * Sanitize a condo name for use as a directory name.
 * Lowercases, replaces non-alphanumeric chars with hyphens, collapses runs, trims.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeDirName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workspace';
}

/**
 * Build the workspace directory path for a condo.
 * @param {string} baseDir - CLAWCONDOS_WORKSPACES_DIR
 * @param {string} condoId - Condo ID (e.g. condo_abc123)
 * @param {string} condoName - Human-readable condo name
 * @returns {string}
 */
export function condoWorkspacePath(baseDir, condoId, condoName) {
  const slug = sanitizeDirName(condoName);
  const suffix = condoId.replace(/^condo_/, '').slice(0, 8);
  return join(baseDir, `${slug}-${suffix}`);
}

/**
 * Build the worktree directory path for a goal inside a condo workspace.
 * @param {string} condoWs - Condo workspace root path
 * @param {string} goalId - Goal ID
 * @returns {string}
 */
export function goalWorktreePath(condoWs, goalId) {
  return join(condoWs, 'goals', goalId);
}

/**
 * Build the branch name for a goal worktree.
 * @param {string} goalId
 * @returns {string}
 */
export function goalBranchName(goalId) {
  return `goal/${goalId}`;
}

/**
 * Create a git-initialized workspace directory for a condo.
 * If repoUrl is provided, clones it; otherwise does git init + empty commit.
 * Idempotent — returns { ok: true, existed: true } if directory already exists.
 *
 * @param {string} baseDir - Base workspaces directory
 * @param {string} condoId - Condo ID
 * @param {string} condoName - Condo name (used for slug)
 * @param {string} [repoUrl] - Optional git repo URL to clone
 * @returns {{ ok: boolean, path?: string, existed?: boolean, error?: string }}
 */
export function createCondoWorkspace(baseDir, condoId, condoName, repoUrl) {
  const wsPath = condoWorkspacePath(baseDir, condoId, condoName);

  try {
    // Ensure base directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }

    // Idempotent — if already exists, return success
    if (existsSync(wsPath)) {
      return { ok: true, path: wsPath, existed: true };
    }

    if (repoUrl) {
      // Clone the repository
      execSync(`git clone ${shellQuote(repoUrl)} ${shellQuote(wsPath)}`, {
        stdio: 'pipe',
        timeout: 120_000,
      });
    } else {
      // Fresh git init with empty initial commit
      mkdirSync(wsPath, { recursive: true });
      execSync('git init', { cwd: wsPath, stdio: 'pipe' });
      execSync('git commit --allow-empty -m "Initial commit"', {
        cwd: wsPath,
        stdio: 'pipe',
        env: { ...process.env, GIT_AUTHOR_NAME: 'ClawCondos', GIT_AUTHOR_EMAIL: 'clawcondos@localhost', GIT_COMMITTER_NAME: 'ClawCondos', GIT_COMMITTER_EMAIL: 'clawcondos@localhost' },
      });
    }

    // Create goals/ subdirectory
    const goalsDir = join(wsPath, 'goals');
    if (!existsSync(goalsDir)) {
      mkdirSync(goalsDir, { recursive: true });
    }

    return { ok: true, path: wsPath };
  } catch (err) {
    return { ok: false, path: wsPath, error: err.message };
  }
}

/**
 * Create a git worktree for a goal inside a condo workspace.
 * Creates branch goal/<goalId> and worktree at goals/<goalId>/.
 * Idempotent — returns { ok: true, existed: true } if worktree already exists.
 *
 * @param {string} condoWs - Condo workspace root path
 * @param {string} goalId - Goal ID
 * @returns {{ ok: boolean, path?: string, branch?: string, existed?: boolean, error?: string }}
 */
export function createGoalWorktree(condoWs, goalId) {
  const wtPath = goalWorktreePath(condoWs, goalId);
  const branch = goalBranchName(goalId);

  try {
    // Idempotent check
    if (existsSync(wtPath)) {
      return { ok: true, path: wtPath, branch, existed: true };
    }

    // Ensure goals/ parent exists
    const goalsDir = join(condoWs, 'goals');
    if (!existsSync(goalsDir)) {
      mkdirSync(goalsDir, { recursive: true });
    }

    execSync(`git worktree add ${shellQuote(wtPath)} -b ${shellQuote(branch)}`, {
      cwd: condoWs,
      stdio: 'pipe',
    });

    return { ok: true, path: wtPath, branch };
  } catch (err) {
    return { ok: false, path: wtPath, branch, error: err.message };
  }
}

/**
 * Remove a goal's git worktree and prune.
 *
 * @param {string} condoWs - Condo workspace root path
 * @param {string} goalId - Goal ID
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeGoalWorktree(condoWs, goalId) {
  const wtPath = goalWorktreePath(condoWs, goalId);
  const branch = goalBranchName(goalId);

  try {
    if (existsSync(wtPath)) {
      execSync(`git worktree remove --force ${shellQuote(wtPath)}`, {
        cwd: condoWs,
        stdio: 'pipe',
      });
    }

    // Prune stale worktree entries
    try {
      execSync('git worktree prune', { cwd: condoWs, stdio: 'pipe' });
    } catch { /* non-critical */ }

    // Delete the branch (best-effort)
    try {
      execSync(`git branch -D ${shellQuote(branch)}`, { cwd: condoWs, stdio: 'pipe' });
    } catch { /* branch may not exist or may be checked out elsewhere */ }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Remove an entire condo workspace directory.
 *
 * @param {string} condoWs - Condo workspace root path
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeCondoWorkspace(condoWs) {
  try {
    if (existsSync(condoWs)) {
      rmSync(condoWs, { recursive: true, force: true });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Quote a string for safe shell usage.
 * Uses JSON.stringify which wraps in double quotes and escapes special chars.
 * @param {string} str
 * @returns {string}
 */
function shellQuote(str) {
  return JSON.stringify(str);
}
