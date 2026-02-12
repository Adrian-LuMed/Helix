/**
 * Config RPC Handlers
 * Manages global configuration including agent roles, PM session, etc.
 * Config is stored in goals.json under the `config` key
 */

import { getDefaultRoles, getAgentForRole } from './agent-roles.js';

/**
 * Create config RPC handlers
 * @param {object} store - Goals store instance
 * @param {object} options - Options
 * @param {function} [options.logger] - Logger instance
 * @returns {object} Map of method names to handlers
 */
export function createConfigHandlers(store, options = {}) {
  const { logger } = options;
  const handlers = {};

  /**
   * config.get - Get current configuration
   * Params: {}
   * Response: { config: object }
   */
  handlers['config.get'] = ({ params, respond }) => {
    try {
      const data = store.load();
      const config = data.config || {};
      
      // Merge with defaults for display
      const defaults = getDefaultRoles();
      const effectiveRoles = { ...defaults, ...(config.agentRoles || {}) };

      respond(true, {
        config: {
          ...config,
          agentRoles: config.agentRoles || {},
        },
        defaults: {
          agentRoles: defaults,
          pmSession: process.env.CLAWCONDOS_PM_SESSION || 'agent:main:main',
        },
        effective: {
          agentRoles: effectiveRoles,
          pmSession: config.pmSession || process.env.CLAWCONDOS_PM_SESSION || 'agent:main:main',
        },
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * config.set - Update configuration
   * Params: { pmSession?: string, agentRoles?: object, ... }
   * Response: { ok: boolean, config: object }
   */
  handlers['config.set'] = ({ params, respond }) => {
    try {
      const data = store.load();
      
      // Initialize config if needed
      if (!data.config) {
        data.config = {};
      }

      const { pmSession, agentRoles, ...rest } = params || {};

      // Update PM session
      if (pmSession !== undefined) {
        if (pmSession === null || pmSession === '') {
          delete data.config.pmSession;
        } else {
          data.config.pmSession = pmSession;
        }
      }

      // Update agent roles (merge, don't replace)
      if (agentRoles && typeof agentRoles === 'object') {
        data.config.agentRoles = data.config.agentRoles || {};
        for (const [role, agentId] of Object.entries(agentRoles)) {
          if (agentId === null || agentId === '') {
            // Remove custom role mapping (fall back to default)
            delete data.config.agentRoles[role];
          } else if (typeof agentId === 'string') {
            data.config.agentRoles[role] = agentId;
          }
        }
        // Clean up empty object
        if (Object.keys(data.config.agentRoles).length === 0) {
          delete data.config.agentRoles;
        }
      }

      // Allow other config fields
      const allowedFields = ['defaultModel', 'defaultAutonomy', 'notifyOnComplete', 'notifyOnBlocked'];
      for (const field of allowedFields) {
        if (field in rest) {
          if (rest[field] === null) {
            delete data.config[field];
          } else {
            data.config[field] = rest[field];
          }
        }
      }

      data.config.updatedAtMs = Date.now();
      store.save(data);

      if (logger) {
        logger.info(`config.set: updated config`);
      }

      respond(true, {
        ok: true,
        config: data.config,
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * config.setRole - Set a single agent role mapping
   * Params: { role: string, agentId: string }
   * Response: { ok: boolean }
   */
  handlers['config.setRole'] = ({ params, respond }) => {
    const { role, agentId } = params || {};

    if (!role || typeof role !== 'string') {
      return respond(false, null, 'role is required');
    }

    try {
      const data = store.load();
      
      if (!data.config) {
        data.config = {};
      }
      if (!data.config.agentRoles) {
        data.config.agentRoles = {};
      }

      if (agentId === null || agentId === '' || agentId === undefined) {
        // Remove custom mapping
        delete data.config.agentRoles[role.toLowerCase()];
      } else {
        data.config.agentRoles[role.toLowerCase()] = agentId;
      }

      // Clean up empty object
      if (Object.keys(data.config.agentRoles).length === 0) {
        delete data.config.agentRoles;
      }

      data.config.updatedAtMs = Date.now();
      store.save(data);

      if (logger) {
        logger.info(`config.setRole: ${role} -> ${agentId || '(default)'}`);
      }

      // Return resolved agent ID
      const resolved = getAgentForRole(data, role.toLowerCase());

      respond(true, {
        ok: true,
        role: role.toLowerCase(),
        agentId: agentId || null,
        resolved,
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * config.getRole - Get agent ID for a role
   * Params: { role: string }
   * Response: { agentId: string, configured: string | null }
   */
  handlers['config.getRole'] = ({ params, respond }) => {
    const { role } = params || {};

    if (!role || typeof role !== 'string') {
      return respond(false, null, 'role is required');
    }

    try {
      const data = store.load();
      const configured = data.config?.agentRoles?.[role.toLowerCase()] || null;
      const resolved = getAgentForRole(data, role.toLowerCase());
      const defaults = getDefaultRoles();

      respond(true, {
        role: role.toLowerCase(),
        agentId: resolved,
        configured,
        default: defaults[role.toLowerCase()] || role.toLowerCase(),
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * config.listRoles - List all role mappings
   * Params: {}
   * Response: { roles: object }
   */
  handlers['config.listRoles'] = ({ params, respond }) => {
    try {
      const data = store.load();
      const configured = data.config?.agentRoles || {};
      const defaults = getDefaultRoles();
      
      // Build complete list with resolution
      const roles = {};
      const allRoles = new Set([...Object.keys(defaults), ...Object.keys(configured)]);
      
      for (const role of allRoles) {
        roles[role] = {
          agentId: getAgentForRole(data, role),
          configured: configured[role] || null,
          default: defaults[role] || role,
        };
      }

      respond(true, { roles });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  return handlers;
}
