/**
 * Plan RPC Handlers - Gateway methods for plan management
 */

import { readPlanFile, parsePlanMarkdown, createEmptyPlan, computePlanStatus } from './plan-manager.js';

/**
 * Create plan RPC handlers
 * @param {object} store - Goals store instance
 * @returns {object} Map of method names to handlers
 */
export function createPlanHandlers(store) {
  const handlers = {};

  /**
   * plans.get - Get plan for a task
   * Params: { goalId: string, taskId: string }
   * Response: { plan: object | null }
   */
  handlers['plans.get'] = ({ params, respond }) => {
    const { goalId, taskId } = params || {};

    if (!goalId || !taskId) {
      return respond(false, null, 'goalId and taskId are required');
    }

    try {
      const data = store.load();
      const goal = data.goals.find(g => g.id === goalId);

      if (!goal) {
        return respond(false, null, `Goal ${goalId} not found`);
      }

      const task = (goal.tasks || []).find(t => t.id === taskId);

      if (!task) {
        return respond(false, null, `Task ${taskId} not found in goal`);
      }

      // Return the plan or an empty plan structure
      const plan = task.plan || createEmptyPlan();

      respond(true, { plan, goalId, taskId });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * plans.syncFromFile - Read a plan file and sync to task
   * Params: { goalId: string, taskId: string, filePath: string, basePath?: string }
   * Response: { plan: object, synced: boolean }
   */
  handlers['plans.syncFromFile'] = ({ params, respond }) => {
    const { goalId, taskId, filePath, basePath } = params || {};

    if (!goalId || !taskId || !filePath) {
      return respond(false, null, 'goalId, taskId, and filePath are required');
    }

    try {
      const data = store.load();
      const goal = data.goals.find(g => g.id === goalId);

      if (!goal) {
        return respond(false, null, `Goal ${goalId} not found`);
      }

      const task = (goal.tasks || []).find(t => t.id === taskId);

      if (!task) {
        return respond(false, null, `Task ${taskId} not found in goal`);
      }

      // Read and parse the plan file
      const result = readPlanFile(filePath, basePath);

      if (!result.success) {
        return respond(false, null, result.error);
      }

      // Initialize or update the plan
      const existingPlan = task.plan || createEmptyPlan();
      const now = Date.now();

      task.plan = {
        ...existingPlan,
        status: existingPlan.status === 'none' ? 'draft' : existingPlan.status,
        filePath: result.filePath,
        content: result.content,
        steps: result.steps.map((step, idx) => {
          // Preserve existing step status if step titles match
          const existing = existingPlan.steps?.find(s => s.title === step.title);
          return existing ? { ...step, ...existing, index: idx } : step;
        }),
        updatedAtMs: now,
      };

      // Recompute status based on steps
      task.plan.status = computePlanStatus(task.plan);
      task.updatedAtMs = now;
      goal.updatedAtMs = now;

      store.save(data);

      respond(true, { plan: task.plan, synced: true });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * plans.updateStatus - Update plan status directly
   * Params: { goalId: string, taskId: string, status: string, feedback?: string }
   * Response: { plan: object }
   */
  handlers['plans.updateStatus'] = ({ params, respond }) => {
    const { goalId, taskId, status, feedback } = params || {};
    const validStatuses = ['none', 'draft', 'awaiting_approval', 'approved', 'rejected', 'executing', 'completed'];

    if (!goalId || !taskId) {
      return respond(false, null, 'goalId and taskId are required');
    }

    if (!status || !validStatuses.includes(status)) {
      return respond(false, null, `status must be one of: ${validStatuses.join(', ')}`);
    }

    try {
      const data = store.load();
      const goal = data.goals.find(g => g.id === goalId);

      if (!goal) {
        return respond(false, null, `Goal ${goalId} not found`);
      }

      const task = (goal.tasks || []).find(t => t.id === taskId);

      if (!task) {
        return respond(false, null, `Task ${taskId} not found in goal`);
      }

      // Initialize plan if needed
      if (!task.plan) {
        task.plan = createEmptyPlan();
      }

      const now = Date.now();
      task.plan.status = status;
      task.plan.updatedAtMs = now;

      // Track approval/rejection timestamps
      if (status === 'approved') {
        task.plan.approvedAtMs = now;
      } else if (status === 'rejected') {
        task.plan.rejectedAtMs = now;
        if (feedback) {
          task.plan.feedback = feedback;
        }
      }

      task.updatedAtMs = now;
      goal.updatedAtMs = now;

      store.save(data);

      respond(true, { plan: task.plan });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * plans.updateStep - Update a specific step in the plan
   * Params: { goalId: string, taskId: string, stepIndex: number, status: string }
   * Response: { plan: object, step: object }
   */
  handlers['plans.updateStep'] = ({ params, respond }) => {
    const { goalId, taskId, stepIndex, status } = params || {};
    const validStepStatuses = ['pending', 'in-progress', 'done', 'skipped'];

    if (!goalId || !taskId || stepIndex === undefined) {
      return respond(false, null, 'goalId, taskId, and stepIndex are required');
    }

    if (!status || !validStepStatuses.includes(status)) {
      return respond(false, null, `status must be one of: ${validStepStatuses.join(', ')}`);
    }

    try {
      const data = store.load();
      const goal = data.goals.find(g => g.id === goalId);

      if (!goal) {
        return respond(false, null, `Goal ${goalId} not found`);
      }

      const task = (goal.tasks || []).find(t => t.id === taskId);

      if (!task) {
        return respond(false, null, `Task ${taskId} not found in goal`);
      }

      if (!task.plan || !task.plan.steps) {
        return respond(false, null, 'Task has no plan with steps');
      }

      const step = task.plan.steps.find(s => s.index === stepIndex);

      if (!step) {
        return respond(false, null, `Step ${stepIndex} not found in plan`);
      }

      const now = Date.now();
      step.status = status;

      if (status === 'in-progress' && !step.startedAtMs) {
        step.startedAtMs = now;
      } else if (status === 'done' || status === 'skipped') {
        step.completedAtMs = now;
      }

      // Recompute overall plan status
      task.plan.status = computePlanStatus(task.plan);
      task.plan.updatedAtMs = now;
      task.updatedAtMs = now;
      goal.updatedAtMs = now;

      store.save(data);

      respond(true, { plan: task.plan, step });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  return handlers;
}
