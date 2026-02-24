# Helix Agent Tool Issues

## Test Date: 2026-02-24

Systematic testing of Helix agent tools from an external OpenClaw agent session.

---

## Summary

| Tool | Status | Notes |
|------|--------|-------|
| `strand_list` | ✅ Works | Returns all strands with goal counts |
| `strand_status` | ✅ Works | Returns full strand details including goals/tasks |
| `strand_create_goal` | ✅ Works | Creates goal in bound strand (see issue #1) |
| `strand_add_task` | ✅ Works | Adds task to existing goal |
| `goal_update` | ✅ Works | Updates goals, tasks, status, nextTask, summary |
| `strand_pm_chat` | ❌ Fails | "No RPC mechanism available" |
| `strand_pm_kickoff` | ❌ Fails | "No RPC mechanism available" |
| `strand_spawn_task` | ⚠️ Not tested | Requires active task |

---

## Issues to Fix

### Issue #1: `strand_pm_chat` - No RPC Mechanism
**Priority: HIGH**

**Error:**
```
Error: failed to prepare PM chat: No RPC mechanism available
```

**Expected:** Agent should be able to communicate with the PM of any strand.

**Likely Cause:** The PM chat functionality requires an RPC endpoint that isn't exposed or connected.

**Fix Required:**
- [ ] Ensure `helix-goals` plugin is loaded in gateway
- [ ] Verify PM chat RPC method is registered (`goals.pmChat` or similar)
- [ ] Check WebSocket connection between agent gateway and Helix backend

---

### Issue #2: `strand_pm_kickoff` - No RPC Mechanism  
**Priority: HIGH**

**Error:**
```
Error: goal cascade failed: No RPC mechanism available
```

**Expected:** Agent should be able to kick off a goal and spawn workers.

**Likely Cause:** Same as Issue #1 - missing RPC mechanism.

**Fix Required:**
- [ ] Ensure kickoff RPC method is registered in plugin
- [ ] Verify connection between agent tools and Helix RPC backend

---

### Issue #3: `strand_create_goal` Creates in Hidden/Default Strand
**Priority: MEDIUM**

**Observed:** When calling `strand_create_goal`, the goal was created in `strand_2e9e8a9b2ee578da869858b1` which doesn't appear in `strand_list` output.

**Expected:** Either:
- Goal should be created in a specified strand (add `strandId` parameter)
- OR the strand should be visible in `strand_list`

**Current Behavior:** Creates in the "bound strand" of the session.

**Fix Required:**
- [ ] Allow specifying target strand in `strand_create_goal`
- [ ] OR ensure bound strand is always visible in `strand_list`
- [ ] Document which strand the session is bound to

---

### Issue #4: `goal_update` Fails on Goals from Other Strands
**Priority: MEDIUM**

**Error (when trying to update a goal in Helix Landing strand):**
```
Error: goal goal_2fa539bdc6503248f0fcd6df does not belong to the bound strand.
```

**Expected:** Agent should be able to update goals in any strand it can read.

**Current Behavior:** Only works for goals in the bound strand.

**Fix Required:**
- [ ] Allow cross-strand goal updates (with proper auth)
- [ ] OR provide a way to re-bind to a different strand
- [ ] OR add a `strandId` parameter to `goal_update`

---

## What Works Well

1. **Reading strand data** - `strand_list` and `strand_status` work perfectly
2. **Creating goals/tasks** - Works within bound strand
3. **Updating goals/tasks** - Works within bound strand, proper validation (can't mark goal done with pending tasks)

---

## Recommendations

### Short-term (Critical for agent coordination):
1. Fix RPC mechanism for `strand_pm_chat` and `strand_pm_kickoff`
2. These are essential for multi-agent orchestration

### Medium-term (Usability):
3. Add `strandId` parameter to `strand_create_goal` and `goal_update`
4. Document strand binding behavior

### Long-term (Nice to have):
5. Add a `strand_bind` tool to switch bound strand
6. Add a `strand_current` tool to see which strand is bound

---

## Test Log

```
# Test 1: strand_list
Result: ✅ SUCCESS
Output: 3 strands returned

# Test 2: strand_status (Helix Landing)
Result: ✅ SUCCESS
Output: Full details with 4 goals, 24 tasks

# Test 3: strand_pm_chat (Helix Landing)
Result: ❌ FAILED
Error: "No RPC mechanism available"

# Test 4: strand_create_goal
Result: ✅ SUCCESS (but created in unexpected strand)
Created: goal_9a1fb909ff72fddeaffeab34 in strand_2e9e8a9b2ee578da869858b1

# Test 5: strand_add_task
Result: ✅ SUCCESS
Created: task_f9e97244b8d9c19e090b93f7

# Test 6: goal_update (nextTask)
Result: ✅ SUCCESS

# Test 7: goal_update (task status)
Result: ✅ SUCCESS

# Test 8: goal_update (goal done with pending tasks)
Result: ✅ CORRECT VALIDATION
Error: "cannot mark goal done — 1 task still pending"

# Test 9: goal_update (goal done after tasks complete)
Result: ✅ SUCCESS

# Test 10: strand_pm_kickoff
Result: ❌ FAILED
Error: "No RPC mechanism available"

# Test 11: goal_update on different strand's goal
Result: ❌ FAILED
Error: "does not belong to the bound strand"
```
