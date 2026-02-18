# Headless Cascade: Backend-Driven `chat.send`

## Problem

The cascade pipeline has a critical dependency on the frontend:

1. Backend (`index.js`) spawns sessions via `internalKickoff()` and `kickoffUnblockedGoals()`
2. Backend broadcasts `goal.kickoff` events (via `broadcastPlanUpdate`)
3. Event takes fragile path: write to `kickoff-events.json` → `serve.js` fs.watch relay → WebSocket → frontend
4. **Frontend** receives the event and calls `chat.send` for each spawned session
5. Without a connected frontend (or if relay breaks), agents are spawned but **never started**

**The first task works** because the frontend calls `goals.kickoff` RPC, receives `spawnedSessions` in the response, and calls `chat.send` directly. **Subsequent tasks fail** because they depend on the broadcast relay chain.

This means the entire cascade — task completion triggering next tasks, phase completion triggering next phase — silently stalls.

## Solution

The backend calls `chat.send` directly via `gatewayRpcCall()` for **ALL auto-kickoffs** after task completion, regardless of autonomy mode. The autonomy mode controls *how the agent behaves* (plan first vs execute immediately), not *whether the agent starts*.

**Key insight:** `gatewayRpcCall` already works — it's used in `goals.close` to call `sessions.delete` and `chat.abort`. The comment at line 421 ("plugins cannot reliably call gateway methods") is outdated.

### Two cases:

| Scenario | Who calls `chat.send` | How |
|---|---|---|
| **Manual kickoff** (user clicks button) | Frontend | Gets `spawnedSessions` in `goals.kickoff` RPC response → calls `chat.send` |
| **Auto-kickoff** (task completion cascade) | **Backend** | `internalKickoff()` → `gatewayRpcCall('chat.send')` directly |

## Architecture

### Current Flow (broken for auto-kickoff)

```
Task completes (goal_update or agent_end)
  → setTimeout → internalKickoff()
  → taskSpawnHandler() → creates session + taskContext
  → broadcastPlanUpdate({ event: 'goal.kickoff', spawnedSessions })
  → [file: kickoff-events.json] → serve.js fs.watch → WebSocket → frontend
  → frontend: rpcCall('chat.send', { sessionKey, message: taskContext })
  ✗ FAILS: relay chain is fragile, frontend may not be connected
```

### New Flow (auto-kickoff — all modes)

```
Task completes (goal_update or agent_end)
  → setTimeout → internalKickoff()
  → taskSpawnHandler() → creates session + taskContext
  → NEW: gatewayRpcCall('chat.send', { sessionKey, message: taskContext })  ← backend starts agent
  → broadcastPlanUpdate({ event: 'goal.kickoff', spawnedSessions })  ← still emitted for UI updates
  → frontend: sees event, skips chat.send (headlessStarted flag)
  ✓ WORKS: no relay dependency, no frontend dependency
```

### Manual Kickoff Flow (unchanged)

```
User clicks "Kickoff" in UI
  → frontend: rpcCall('goals.kickoff', { goalId })
  → backend: internalKickoff() → respond with spawnedSessions
  → frontend: for each session → rpcCall('chat.send', { sessionKey, message: taskContext })
  ✓ WORKS: frontend has direct RPC response
```

## Files to Modify

### 1. `clawcondos/condo-management/index.js`

#### Change A: Add `startSpawnedSessions()` helper (after `gatewayRpcCall` definition, ~line 62)

Extract the chat.send logic into a reusable async function:

```js
/**
 * Start spawned sessions by calling chat.send directly.
 * Used for auto-kickoffs (task completion cascade, retry, phase cascade).
 * Manual kickoff via goals.kickoff RPC does NOT use this — frontend handles it.
 * @param {Array} spawnedSessions - Sessions from internalKickoff()
 * @returns {Promise<void>}
 */
async function startSpawnedSessions(spawnedSessions) {
  for (const s of spawnedSessions) {
    if (!s.sessionKey || !s.taskContext) continue;
    try {
      await gatewayRpcCall('chat.send', {
        sessionKey: s.sessionKey,
        message: s.taskContext,
      });
      s.headlessStarted = true;
      api.logger.info(`clawcondos-goals: backend chat.send OK for ${s.sessionKey}`);
    } catch (err) {
      api.logger.error(`clawcondos-goals: backend chat.send FAILED for ${s.sessionKey}: ${err.message}`);
      s.headlessStarted = false;
    }
  }
}
```

#### Change B: Auto-kickoff after task completion via `goal_update` (line ~1092-1110)

Replace the broadcast-only pattern with direct chat.send:

```js
// Auto-kickoff next tasks after task completion
if (!result._meta.allTasksDone) {
  setTimeout(async () => {
    try {
      const kickoffResult = await internalKickoff(result._meta.goalId);

      if (kickoffResult.spawnedSessions?.length > 0) {
        // Backend starts agents directly — no frontend relay needed
        await startSpawnedSessions(kickoffResult.spawnedSessions);

        // Broadcast for UI updates (frontend skips chat.send via headlessStarted flag)
        broadcastPlanUpdate({
          event: 'goal.kickoff',
          goalId: result._meta.goalId,
          spawnedCount: kickoffResult.spawnedSessions.length,
          spawnedSessions: kickoffResult.spawnedSessions,
        });
        api.logger.info(`clawcondos-goals: auto-kickoff started ${kickoffResult.spawnedSessions.length} session(s) for goal ${result._meta.goalId}`);
      }
    } catch (err) {
      api.logger.error(`clawcondos-goals: auto-kickoff after task completion failed: ${err.message}`);
    }
  }, 1000);
}
```

#### Change C: Auto-kickoff after auto-complete in `agent_end` (line ~789-804)

Same pattern — add `startSpawnedSessions` call:

```js
if (!allDone) {
  setTimeout(async () => {
    try {
      const kickoffResult = await internalKickoff(goal.id);
      if (kickoffResult.spawnedSessions?.length > 0) {
        await startSpawnedSessions(kickoffResult.spawnedSessions);
        broadcastPlanUpdate({
          event: 'goal.kickoff',
          goalId: goal.id,
          spawnedCount: kickoffResult.spawnedSessions.length,
          spawnedSessions: kickoffResult.spawnedSessions,
        });
        api.logger.info(`clawcondos-goals: auto-kickoff after auto-complete started ${kickoffResult.spawnedSessions.length} session(s) for goal "${goal.title}"`);
      }
    } catch (err) {
      api.logger.error(`auto-kickoff after auto-complete failed: ${err.message}`);
    }
  }, 1000);
}
```

#### Change D: Auto re-kickoff after retry in `agent_end` (line ~843-858)

Same pattern:

```js
setTimeout(async () => {
  try {
    const kickoffResult = await internalKickoff(goal.id);
    if (kickoffResult.spawnedSessions?.length > 0) {
      await startSpawnedSessions(kickoffResult.spawnedSessions);
      broadcastPlanUpdate({
        event: 'goal.kickoff',
        goalId: goal.id,
        spawnedCount: kickoffResult.spawnedSessions.length,
        spawnedSessions: kickoffResult.spawnedSessions,
      });
      api.logger.info(`clawcondos-goals: auto re-kickoff for goal ${goal.id} after retry — started ${kickoffResult.spawnedSessions.length} session(s)`);
    }
  } catch (err) {
    api.logger.error(`clawcondos-goals: auto re-kickoff failed for goal ${goal.id}: ${err.message}`);
  }
}, 2000);
```

#### Change E: `kickoffUnblockedGoals()` phase cascade (line ~384-395)

Same pattern:

```js
const result = await internalKickoff(goal.id);
if (result.spawnedSessions.length > 0) {
  await startSpawnedSessions(result.spawnedSessions);
  broadcastPlanUpdate({
    event: 'goal.kickoff',
    goalId: goal.id,
    spawnedCount: result.spawnedSessions.length,
    spawnedSessions: result.spawnedSessions,
  });
  api.logger.info(`clawcondos-goals: kickoffUnblockedGoals: started ${result.spawnedSessions.length} session(s) for goal "${goal.title}" (phase ${goal.phase || '?'})`);
}
```

#### Change F: `condo_spawn_task` tool (line ~1281-1293)

Single-session spawn by agent tool — also start directly:

```js
if (result.taskContext && result.spawnRequest?.sessionKey) {
  // Start agent directly
  try {
    await gatewayRpcCall('chat.send', {
      sessionKey: result.spawnRequest.sessionKey,
      message: result.taskContext,
    });
    result.headlessStarted = true;
  } catch (err) {
    api.logger.error(`clawcondos-goals: condo_spawn_task chat.send failed: ${err.message}`);
    result.headlessStarted = false;
  }

  broadcastPlanUpdate({
    event: 'goal.kickoff',
    goalId: params.goalId,
    spawnedCount: 1,
    spawnedSessions: [{
      taskId: params.taskId,
      taskText: result.spawnRequest.taskText || params.taskId,
      sessionKey: result.spawnRequest.sessionKey,
      taskContext: result.taskContext,
      headlessStarted: result.headlessStarted,
    }],
  });
}
```

#### Change G: `goals.kickoff` RPC handler — NO CHANGE (line ~402-432)

The manual kickoff via `goals.kickoff` does **not** call `startSpawnedSessions()`. The frontend already handles this by reading `spawnedSessions` from the RPC response. This keeps manual kickoff working exactly as before.

Remove the outdated comment at lines 421-425:

```diff
-      // NOTE: Backend does NOT send chat.send — plugins cannot reliably call
-      // gateway methods. The frontend sends chat.send for each session.
-      // For manual kickoff: frontend gets spawnedSessions in the response.
-      // For auto-kickoff / phase cascade: backend broadcasts goal.kickoff event
-      // and frontend's event handler sends chat.send.
+      // Manual kickoff: frontend gets spawnedSessions in the response and
+      // calls chat.send. Auto-kickoffs (cascade) call startSpawnedSessions()
+      // directly so they don't depend on the frontend relay.
```

### 2. `public/index.html`

**Location: kickoff event handler (wherever frontend handles `goal.kickoff` events)**

Add guard to skip `chat.send` for sessions already started by the backend:

```js
sessions.forEach(function(s) {
  if (!s.taskContext || !s.sessionKey) return;
  if (s.headlessStarted) {
    console.log('[auto-kickoff] Session ' + s.sessionKey + ' already started by backend');
    return;
  }
  rpcCall('chat.send', { ... });
});
```

Apply to all frontend kickoff event handlers. This is a safety guard — in practice, for auto-kickoffs the backend has already started the agent, and for manual kickoffs the `headlessStarted` flag won't be present.

### 3. `clawcondos/condo-management/lib/autonomy.js`

**No changes needed.** Autonomy mode affects agent behavior (plan vs execute), not whether the backend starts the agent.

### 4. `serve.js` — kickoff-events.json relay

**No changes needed.** The relay continues to work as a backup path for UI updates. Over time it can be deprecated since `api.broadcast` + the `headlessStarted` flag make it redundant for agent starting.

## Callsite Summary

| Location | Trigger | Before | After |
|---|---|---|---|
| `goal_update` tool (~L1092) | Task marked done | broadcast only | `startSpawnedSessions()` + broadcast |
| `agent_end` auto-complete (~L789) | Agent ends normally | broadcast only | `startSpawnedSessions()` + broadcast |
| `agent_end` retry (~L843) | Agent fails, retry | broadcast only | `startSpawnedSessions()` + broadcast |
| `kickoffUnblockedGoals()` (~L384) | Goal/phase completes | broadcast only | `startSpawnedSessions()` + broadcast |
| `condo_spawn_task` tool (~L1281) | Agent spawns subtask | broadcast only | direct `chat.send` + broadcast |
| `goals.kickoff` RPC (~L402) | User clicks Kickoff | broadcast + frontend response | **unchanged** (frontend handles) |

## Edge Cases

### 1. `gatewayRpcCall('chat.send')` fails
- Log error, set `s.headlessStarted = false`
- Frontend receives the event without the flag → sends `chat.send` as fallback
- Net effect: graceful degradation to current behavior

### 2. Frontend is open AND backend starts the agent
- `headlessStarted: true` flag prevents double `chat.send`
- Frontend still updates UI (session list, goal status)

### 3. Frontend is closed (headless operation)
- Backend starts agents directly — no frontend needed
- This works for ALL autonomy modes:
  - `full`: agent executes immediately
  - `plan`: agent creates plan and waits for approval (via `goal_update` tool)
  - `step`/`supervised`: agent creates plan and waits
- The autonomy mode directive is already in `taskContext` — the agent knows how to behave

### 4. Race condition: event arrives before `chat.send` completes
- `startSpawnedSessions()` runs **before** `broadcastPlanUpdate`
- By the time frontend sees the event, agent is already running
- `headlessStarted` flag prevents double-send

### 5. Mixed autonomy modes in same goal
- All sessions are started by the backend, regardless of mode
- Each agent's `taskContext` contains the appropriate autonomy directive

### 6. `chat.send` for webchat session auto-creates it
- Session key format is `agent:<id>:webchat:task-<suffix>`
- The gateway auto-creates webchat sessions on first `chat.send`
- No need to pre-create sessions

## Testing Plan

### Unit tests (`tests/headless-kickoff.test.js`)

1. **`startSpawnedSessions` calls `chat.send` for each session**: Mock `gatewayRpcCall`, verify it's called with correct `sessionKey` and `message: taskContext` for each session
2. **`startSpawnedSessions` sets `headlessStarted` flag**: Verify each session object has `headlessStarted: true` after successful call
3. **`chat.send` failure sets `headlessStarted: false`**: Mock `gatewayRpcCall` to throw, verify flag is false and no crash
4. **Skips sessions without `taskContext` or `sessionKey`**: Verify no `chat.send` call for incomplete sessions
5. **Auto-kickoff after task completion calls `startSpawnedSessions`**: Integration test with goal_update tool mock
6. **Manual kickoff does NOT call `startSpawnedSessions`**: Verify `goals.kickoff` handler only broadcasts, doesn't start

### Existing test updates (`tests/lifecycle-condo-pipeline.test.js`)

7. **End-to-end cascade**: Create goal with dependent tasks (T1 → T2 → T3), complete T1 → verify T2 starts via backend `chat.send` (not broadcast relay)
8. **Phase cascade**: Create condo with phase 1 and phase 2 goals, complete all phase 1 tasks → verify phase 2 goals auto-start

## Rollout

1. **No new env vars or feature flags** — this is a bug fix, not a feature
2. `startSpawnedSessions()` is additive — it calls `chat.send` before the broadcast, so existing frontend handlers still work as fallback
3. The `headlessStarted` flag is purely defensive — even without the frontend guard, double `chat.send` is generally idempotent (agent receives duplicate first message)
4. Deploy backend change first, frontend guard can follow in a separate PR
