/**
 * Agent Role Mapping
 * Maps role names to actual agent IDs
 * Configurable via store.config.agentRoles or environment variables
 */

/**
 * Get the agent ID for a given role
 * @param {object} store - Goals store instance (or data object)
 * @param {string} role - Role name (e.g., 'pm', 'frontend', 'backend')
 * @returns {string} Agent ID
 */
export function getAgentForRole(store, role) {
  // Handle both store instance and data object
  const data = typeof store.load === 'function' ? store.load() : store;
  const roles = data.config?.agentRoles || {};
  
  // Check configured roles first
  if (roles[role]) {
    return roles[role];
  }
  
  // Fall back to default roles (which check env vars internally)
  const defaults = getDefaultRoles();
  if (defaults[role]) {
    return defaults[role];
  }
  
  // Final fallback to role name as agent ID (for custom roles)
  return role;
}

/**
 * Get the default role mappings
 * @returns {object} Default role -> agent ID mappings
 */
export function getDefaultRoles() {
  return {
    pm: process.env.CLAWCONDOS_PM_AGENT || 'main',
    frontend: process.env.CLAWCONDOS_FRONTEND_AGENT || 'frontend',
    backend: process.env.CLAWCONDOS_BACKEND_AGENT || 'backend',
    designer: process.env.CLAWCONDOS_DESIGNER_AGENT || 'designer',
    tester: process.env.CLAWCONDOS_TESTER_AGENT || 'tester',
    devops: process.env.CLAWCONDOS_DEVOPS_AGENT || 'devops',
    qa: process.env.CLAWCONDOS_QA_AGENT || 'qa',
  };
}

/**
 * Resolve an agent specification to an actual agent ID
 * Handles both role names and direct agent IDs
 * @param {object} store - Goals store instance
 * @param {string} spec - Role name or direct agent ID
 * @returns {string} Resolved agent ID
 */
export function resolveAgent(store, spec) {
  if (!spec) return null;
  
  // Check if it's a known role
  const defaults = getDefaultRoles();
  if (defaults.hasOwnProperty(spec.toLowerCase())) {
    return getAgentForRole(store, spec.toLowerCase());
  }
  
  // Otherwise, treat it as a direct agent ID
  return spec;
}

/**
 * Get the PM session key for a condo
 * @param {object} store - Goals store instance
 * @param {string} condoId - Condo ID
 * @returns {string} PM session key (e.g., 'agent:main:main')
 */
export function getPmSession(store, condoId) {
  const data = typeof store.load === 'function' ? store.load() : store;
  
  // Check condo-specific PM first
  if (condoId) {
    const condo = data.condos?.find(c => c.id === condoId);
    if (condo?.pmSession) {
      return condo.pmSession;
    }
  }
  
  // Fall back to global config or system default
  return data.config?.pmSession || 
         process.env.CLAWCONDOS_PM_SESSION || 
         'agent:main:main';  // System default
}

/**
 * Build an agent session key
 * @param {string} agentId - Agent ID
 * @param {string} sessionType - Session type (e.g., 'main', 'subagent')
 * @param {string} [subId] - Optional sub-identifier for subagents
 * @returns {string} Session key
 */
export function buildSessionKey(agentId, sessionType = 'main', subId = null) {
  const base = `agent:${agentId}:${sessionType}`;
  return subId ? `${base}:${subId}` : base;
}
