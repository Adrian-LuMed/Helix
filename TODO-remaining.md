# Remaining Steps — E2E Pipeline Fix

## Status: All Code Changes DONE, All Tests PASS (731/731)

All 8 code changes from the plan have been implemented and verified:

1. `autonomy.js` — goal added to resolution chain (task > goal > condo > default)
2. `task-spawn.js` — passes goal to resolveAutonomyMode
3. `condos-handlers.js` — accepts autonomyMode in create/update
4. `goals-handlers.js` — accepts autonomyMode in create/update
5. `pm-handlers.js` — setSequentialDependencies helper applied to 3 locations + autonomyMode propagation from condo to goals
6. `goal-update-tool.js` — _meta return with taskCompletedId/allTasksDone
7. `index.js` — extracted internalKickoff, broadcasts goal.task_completed
8. `e2e-live-pipeline.js` — autonomyMode: 'full' in condos.create
9. `lifecycle-condo-pipeline.test.js` — updated Phase 5 and 7 for sequential deps

## What's Left (manual steps, no more code changes needed)

### 1. Commit the changes
```bash
cd ~/clawcondos
git add clawcondos/condo-management/lib/autonomy.js \
        clawcondos/condo-management/lib/task-spawn.js \
        clawcondos/condo-management/lib/condos-handlers.js \
        clawcondos/condo-management/lib/goals-handlers.js \
        clawcondos/condo-management/lib/pm-handlers.js \
        clawcondos/condo-management/lib/goal-update-tool.js \
        clawcondos/condo-management/index.js \
        tests/e2e-live-pipeline.js \
        tests/lifecycle-condo-pipeline.test.js
git commit -m "feat: sequential task deps, goal autonomy, and task completion broadcasts

- Add setSequentialDependencies to pm-handlers (applied to 3 task-creation locations)
- Add goal to autonomy resolution chain: task > goal > condo > default
- Accept autonomyMode in condos.create/update and goals.create/update
- Propagate autonomyMode from condo to goals in pm.condoCreateGoals
- Add _meta return from goal_update tool on task completion
- Extract internalKickoff for reuse, broadcast goal.task_completed events
- Set autonomyMode: 'full' in E2E pipeline condo creation
- Update lifecycle tests for sequential dependency behavior"
```

### 2. Delete the old Recipe Box condo (if one exists from the failed run)
```bash
# Check for existing condos via the gateway
# You can do this from the UI or via the E2E script with --resume
```

### 3. Restart the gateway to pick up plugin changes
```bash
systemctl --user restart openclaw-gateway
```

### 4. Run the E2E pipeline
```bash
node tests/e2e-live-pipeline.js
```

### 5. Expected behavior after these changes
- PM creates vertical-slice goals (enforced by skill-injector.js, already done)
- Each goal's tasks have sequential dependencies (task 2 depends on task 1, etc.)
- Kickoff only starts the first task per goal (others blocked by deps)
- Agents execute immediately (autonomy: full from condo setting)
- When task 1 completes, the E2E monitoring loop re-kicks off to spawn task 2
- goal.task_completed events are broadcast for real-time dashboard updates
