import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGoalsStore } from './lib/goals-store.js';
import { createGoalHandlers } from './lib/goals-handlers.js';

export default function register(api) {
  const dataDir = api.pluginConfig?.dataDir
    || join(dirname(fileURLToPath(import.meta.url)), '.data');
  const store = createGoalsStore(dataDir);
  const handlers = createGoalHandlers(store);

  for (const [method, handler] of Object.entries(handlers)) {
    api.registerGatewayMethod(method, handler);
  }

  api.logger.info(`clawcondos-goals: registered ${Object.keys(handlers).length} gateway methods, data at ${dataDir}`);
}
