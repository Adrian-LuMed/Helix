import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';

// File-backed mapping between goals and sessions.
// Canonical store is by sessionKey (one session belongs to at most one goal).
// Goal -> many sessions is derived at read time.

const DEFAULT_PATH = '/home/albert/clawd/goals/_session_links.json';

function nowIso() {
  return new Date().toISOString();
}

function ensureFile(filePath = DEFAULT_PATH) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(filePath)) {
    const initial = { version: 1, updatedAt: nowIso(), links: {} };
    writeFileSync(filePath, JSON.stringify(initial, null, 2) + '\n', 'utf8');
  }
}

function safeReadJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, filePath);
}

export function loadGoalSessionLinks(filePath = DEFAULT_PATH) {
  ensureFile(filePath);
  const data = safeReadJson(filePath);
  if (!data || typeof data !== 'object') {
    const initial = { version: 1, updatedAt: nowIso(), links: {} };
    atomicWriteJson(filePath, initial);
    return initial;
  }
  if (!data.links || typeof data.links !== 'object') data.links = {};
  if (!data.version) data.version = 1;
  return data;
}

export function saveGoalSessionLinks(data, filePath = DEFAULT_PATH) {
  data.updatedAt = nowIso();
  atomicWriteJson(filePath, data);
}

export function getGoalForSession(sessionKey, filePath = DEFAULT_PATH) {
  const data = loadGoalSessionLinks(filePath);
  return data.links?.[sessionKey]?.goalId || null;
}

export function getSessionsForGoal(goalId, filePath = DEFAULT_PATH) {
  const data = loadGoalSessionLinks(filePath);
  const sessions = [];
  for (const [sessionKey, link] of Object.entries(data.links || {})) {
    if (link?.goalId === goalId) sessions.push(sessionKey);
  }
  // stable ordering: most recently updated first (best effort)
  sessions.sort((a, b) => {
    const la = data.links[a];
    const lb = data.links[b];
    return String(lb?.updatedAt || '').localeCompare(String(la?.updatedAt || ''));
  });
  return sessions;
}

export function setSessionGoal(sessionKey, goalId, opts = {}, filePath = DEFAULT_PATH) {
  if (!sessionKey || typeof sessionKey !== 'string') throw new Error('sessionKey is required');
  if (!goalId || typeof goalId !== 'string') throw new Error('goalId is required');

  const data = loadGoalSessionLinks(filePath);
  const prev = data.links[sessionKey] || null;
  const at = nowIso();

  const history = Array.isArray(prev?.history) ? prev.history.slice(-50) : [];
  if (prev?.goalId && prev.goalId !== goalId) {
    history.push({ action: 'reparent', fromGoalId: prev.goalId, toGoalId: goalId, at });
  } else if (!prev?.goalId) {
    history.push({ action: 'link', toGoalId: goalId, at });
  }

  data.links[sessionKey] = {
    goalId,
    linkedAt: prev?.linkedAt || at,
    updatedAt: at,
    source: opts.source || prev?.source || 'manual',
    history,
  };

  saveGoalSessionLinks(data, filePath);
  return data.links[sessionKey];
}

export function unlinkSession(sessionKey, opts = {}, filePath = DEFAULT_PATH) {
  if (!sessionKey || typeof sessionKey !== 'string') throw new Error('sessionKey is required');
  const data = loadGoalSessionLinks(filePath);
  const prev = data.links[sessionKey];
  if (!prev) return { removed: false };

  const at = nowIso();
  const history = Array.isArray(prev.history) ? prev.history.slice(-50) : [];
  history.push({ action: 'unlink', fromGoalId: prev.goalId, at, reason: opts.reason || '' });

  // Keep tombstone if you want audit; for now, delete to keep file small.
  delete data.links[sessionKey];
  saveGoalSessionLinks(data, filePath);
  return { removed: true, previous: { ...prev, history } };
}

export function bulkSetSessionGoals(items, opts = {}, filePath = DEFAULT_PATH) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const data = loadGoalSessionLinks(filePath);
  const at = nowIso();

  let updated = 0;
  for (const item of items) {
    const sessionKey = item?.sessionKey;
    const goalId = item?.goalId;
    if (!sessionKey || !goalId) continue;

    const prev = data.links[sessionKey] || null;
    const history = Array.isArray(prev?.history) ? prev.history.slice(-50) : [];
    if (prev?.goalId && prev.goalId !== goalId) {
      history.push({ action: 'reparent', fromGoalId: prev.goalId, toGoalId: goalId, at });
    } else if (!prev?.goalId) {
      history.push({ action: 'link', toGoalId: goalId, at });
    }

    data.links[sessionKey] = {
      goalId,
      linkedAt: prev?.linkedAt || at,
      updatedAt: at,
      source: item?.source || opts.source || prev?.source || 'manual',
      history,
    };
    updated += 1;
  }

  saveGoalSessionLinks(data, filePath);
  return { updated };
}
