const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../config/logger');

class PlivoService {
  /**
   * Determine Plivo regional routing ('in' | 'us') based on destination E.164 phone number
   */
  getRegionForPhone(phone) {
    if (!phone) return 'us';
    const cleaned = String(phone).trim();
    if (cleaned.startsWith('+91')) {
      return 'in';
    }
    return 'us';
  }

  /**
   * Fetch regional Plivo credentials and trigger configuration
   */
  getRegionalConfig(region) {
    const r = region === 'in' ? 'in' : 'us';
    const config = env.plivo[r];

    if (!config) {
      throw new Error(`Plivo configuration for region [${r.toUpperCase()}] is missing.`);
    }

    return {
      region: r.toUpperCase(),
      authId: config.authId,
      authToken: config.authToken,
      callerNumber: config.callerNumber,
      agentTriggerUrl: config.agentTriggerUrl
    };
  }

  /**
   * Check if a region is properly configured for API triggers
   */
  isRegionConfigured(region) {
    try {
      const cfg = this.getRegionalConfig(region);
      return Boolean(
        cfg.agentTriggerUrl &&
        !cfg.agentTriggerUrl.includes('your_') &&
        cfg.callerNumber &&
        !cfg.callerNumber.includes('your_')
      );
    } catch {
      return false;
    }
  }

  /**
   * Trigger Outbound Plivo Native AI Agent Call via published API Request Trigger URL
   */
  async triggerOutboundAgentCall({ to, leadId, callAttemptId, leadData = {} }) {
    if (!to || !leadId || !callAttemptId) {
      throw new Error('Destination phone number (to), leadId, and callAttemptId are required for Plivo outbound calling.');
    }

    const regionKey = this.getRegionForPhone(to);
    const config = this.getRegionalConfig(regionKey);

    logger.info(`Routing Outbound Plivo Call: Phone [${to}] -> Region [${config.region}] Caller ID [${config.callerNumber}]`);

    // Mock Mode fallback for local unit tests or unconfigured dev environments
    if (!config.agentTriggerUrl || config.agentTriggerUrl.startsWith('MOCK') || config.agentTriggerUrl.includes('your_') || config.authId === 'MOCK_ID') {
      logger.warn(`Plivo [${config.region}] trigger URL not configured. Executing in MOCK trigger mode.`);
      const mockCallUuid = `PLIVO_MOCK_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      return {
        success: true,
        isMock: true,
        callUuid: mockCallUuid,
        region: config.region,
        callerNumber: config.callerNumber
      };
    }

    const payload = {
      to_number: to,
      from_number: config.callerNumber,
      leadId: String(leadId),
      lead_id: String(leadId),
      call_attempt_id: String(callAttemptId),
      callAttemptId: String(callAttemptId),
      first_name: leadData.firstName || '',
      last_name: leadData.lastName || '',
      company: leadData.company || ''
    };

    try {
      const authHeader = config.authId && config.authToken ? {
        auth: {
          username: config.authId,
          password: config.authToken
        }
      } : {};

      const response = await axios.post(config.agentTriggerUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        ...authHeader,
        timeout: 10000
      });

      const responseData = response.data || {};
      logger.info('Plivo Agent Trigger response received', {
        region: config.region,
        httpStatus: response.status,
        apiId: responseData.api_id || responseData.data?.api_id || null,
        message: responseData.message || null,
        hasCallUuid: Boolean(responseData.call_uuid || responseData.data?.call_uuid)
      });
      const responseObject = responseData.data?.object || responseData.object || responseData.data || responseData;
      const callUuid = responseObject.call_uuid || responseObject.callUuid ||
        responseObject.CallUUID || responseObject.call_id || responseObject.callId;
      const triggerApiId = responseObject.api_id || responseObject.apiId;
      const flowId = responseObject.phlo_id || responseObject.phloId ||
        responseObject.flow_id || responseObject.flowId;
      const conversationId = responseObject.conversation_id || responseObject.conversationId ||
        responseObject.ConversationID;
      const flowRunUuid = responseObject.flow_run_uuid || responseObject.flowRunUuid ||
        responseObject.flow_run_id || responseObject.flowRunId;

      logger.info(`Plivo Outbound AI Agent triggered successfully [Region: ${config.region}]`, {
        callUuid,
        leadId,
        callAttemptId,
        responseData
      });

      return {
        success: true,
        isMock: false,
        callUuid,
        triggerApiId,
        flowId,
        conversationId,
        flowRunUuid,
        region: config.region,
        callerNumber: config.callerNumber,
        raw: responseData
      };
    } catch (err) {
      const errorDetail = err.response?.data?.message || err.response?.data?.error || err.message;
      logger.error(`Failed to trigger Plivo AI Agent [Region: ${config.region}]`, {
        error: errorDetail,
        leadId,
        callAttemptId,
        to
      });
      throw new Error(`Plivo [${config.region}] Agent Trigger Failed: ${errorDetail}`);
    }
  }

  /**
   * Terminate an active Plivo call using Plivo Voice API
   * Endpoint: DELETE https://api.plivo.com/v1/Account/{auth_id}/Call/{call_uuid}/
   */
  async terminateCall({ callUuid, region = 'US' }) {
    if (!callUuid) {
      throw new Error('callUuid is required to terminate an active call.');
    }

    if (callUuid.startsWith('PLIVO_MOCK_')) {
      logger.info(`Mock Call [${callUuid}] terminated.`);
      return { success: true, isMock: true };
    }

    const regionKey = String(region).toLowerCase() === 'in' ? 'in' : 'us';
    const config = this.getRegionalConfig(regionKey);

    if (!config.authId || !config.authToken) {
      throw new Error(`Cannot terminate call: Plivo Auth ID / Token missing for region [${config.region}].`);
    }

    const url = `https://api.plivo.com/v1/Account/${config.authId}/Call/${callUuid}/`;

    try {
      const response = await axios.delete(url, {
        auth: {
          username: config.authId,
          password: config.authToken
        },
        timeout: 8000
      });

      logger.info(`Active Plivo call [${callUuid}] terminated via API request.`);
      return { success: true, raw: response.data };
    } catch (err) {
      const errorDetail = err.response?.data?.message || err.response?.data?.error || err.message;
      logger.error(`Failed to terminate Plivo call [${callUuid}]`, { error: errorDetail });
      throw new Error(`Failed to end call: ${errorDetail}`);
    }
  }
}

module.exports = new PlivoService();
