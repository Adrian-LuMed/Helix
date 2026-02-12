/**
 * PM (Project Manager) Mode Handlers
 * Routes messages to the configured PM agent session
 */

import { getPmSession, getAgentForRole } from './agent-roles.js';

/**
 * Create PM RPC handlers
 * @param {object} store - Goals store instance
 * @param {object} options - Options
 * @param {function} options.sendToSession - Function to send message to a session and get response
 * @param {function} [options.logger] - Logger instance
 * @returns {object} Map of method names to handlers
 */
export function createPmHandlers(store, options = {}) {
  const { sendToSession, logger } = options;
  const handlers = {};

  /**
   * pm.chat - Send a message to the PM agent session and get response
   * Params: { condoId: string, message: string, pmSession?: string }
   * Response: { response: string, pmSession: string }
   */
  handlers['pm.chat'] = async ({ params, respond }) => {
    const { condoId, message, pmSession: overrideSession } = params || {};

    if (!condoId) {
      return respond(false, null, 'condoId is required');
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return respond(false, null, 'message is required');
    }

    try {
      const data = store.load();
      const condo = data.condos.find(c => c.id === condoId);

      if (!condo) {
        return respond(false, null, `Condo ${condoId} not found`);
      }

      // Use override session, or resolve via configurable hierarchy
      const targetSession = overrideSession || getPmSession(store, condoId);

      if (!sendToSession) {
        return respond(false, null, 'sendToSession not available');
      }

      // Build context message with condo info
      const goals = data.goals.filter(g => g.condoId === condoId);
      const activeGoals = goals.filter(g => !g.completed);
      
      const contextPrefix = [
        `[PM Mode Context]`,
        `Condo: ${condo.name}`,
        `Active Goals: ${activeGoals.length}`,
        '',
        'User Message:',
      ].join('\n');

      const fullMessage = `${contextPrefix}\n${message.trim()}`;

      // Send to PM session and wait for response
      const response = await sendToSession(targetSession, {
        type: 'pm_chat',
        condoId,
        message: fullMessage,
        expectResponse: true,
      });

      if (logger) {
        logger.info(`pm.chat: sent to ${targetSession} for condo ${condo.name}`);
      }

      respond(true, {
        response: response?.text || response?.message || 'No response received',
        pmSession: targetSession,
      });
    } catch (err) {
      if (logger) {
        logger.error(`pm.chat error: ${err.message}`);
      }
      respond(false, null, err.message);
    }
  };

  /**
   * pm.getConfig - Get PM configuration for a condo
   * Params: { condoId: string }
   * Response: { pmSession: string, ... }
   */
  handlers['pm.getConfig'] = ({ params, respond }) => {
    const { condoId } = params || {};

    if (!condoId) {
      return respond(false, null, 'condoId is required');
    }

    try {
      const data = store.load();
      const condo = data.condos.find(c => c.id === condoId);

      if (!condo) {
        return respond(false, null, `Condo ${condoId} not found`);
      }

      // Get resolved PM session (includes fallback chain)
      const resolvedPmSession = getPmSession(store, condoId);

      respond(true, {
        pmSession: condo.pmSession || null,  // Condo-specific setting (may be null)
        resolvedPmSession,                    // Actually resolved session (with fallbacks)
        condoId,
        condoName: condo.name,
        globalPmSession: data.config?.pmSession || null,
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * pm.setConfig - Set PM configuration for a condo
   * Params: { condoId: string, pmSession?: string }
   * Response: { ok: boolean }
   */
  handlers['pm.setConfig'] = ({ params, respond }) => {
    const { condoId, pmSession } = params || {};

    if (!condoId) {
      return respond(false, null, 'condoId is required');
    }

    try {
      const data = store.load();
      const condo = data.condos.find(c => c.id === condoId);

      if (!condo) {
        return respond(false, null, `Condo ${condoId} not found`);
      }

      if (pmSession !== undefined) {
        // Allow null to clear condo-specific setting (fall back to global)
        condo.pmSession = pmSession || null;
      }
      condo.updatedAtMs = Date.now();

      store.save(data);

      // Return resolved session (with fallback chain)
      const resolvedPmSession = getPmSession(store, condoId);

      respond(true, { 
        ok: true, 
        pmSession: condo.pmSession,
        resolvedPmSession,
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  /**
   * pm.getAgent - Get the PM agent ID for a condo
   * Params: { condoId?: string }
   * Response: { agentId: string, sessionKey: string }
   */
  handlers['pm.getAgent'] = ({ params, respond }) => {
    const { condoId } = params || {};

    try {
      const pmSession = getPmSession(store, condoId);
      
      // Extract agent ID from session key (format: agent:AGENT_ID:SESSION_TYPE)
      const match = pmSession.match(/^agent:([^:]+):/);
      const agentId = match ? match[1] : 'main';

      respond(true, {
        agentId,
        sessionKey: pmSession,
        role: 'pm',
      });
    } catch (err) {
      respond(false, null, err.message);
    }
  };

  return handlers;
}
