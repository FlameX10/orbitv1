const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../config/logger');

class ElevenLabsService {
  constructor() {
    this.apiKey = env.elevenlabs.apiKey;
    this.agentId = env.elevenlabs.agentId;
    this.phoneNumberId = env.elevenlabs.phoneNumberId;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  isConfigured() {
    return Boolean(
      this.apiKey &&
      !this.apiKey.startsWith('MOCK') &&
      !this.apiKey.includes('your_') &&
      this.agentId &&
      !this.agentId.startsWith('MOCK') &&
      !this.agentId.includes('your_') &&
      this.phoneNumberId &&
      !this.phoneNumberId.includes('your_')
    );
  }

  buildOutboundCallPayload({ to, leadId }) {
    const resolvedLeadId = leadId === undefined || leadId === null ? '' : String(leadId).trim();
    if (!resolvedLeadId || ['none', 'null', 'undefined', 'nan'].includes(resolvedLeadId.toLowerCase())) {
      throw new Error('A backend leadId is required to initialize an ElevenLabs call.');
    }

    return {
      agent_id: this.agentId,
      agent_phone_number_id: this.phoneNumberId,
      to_number: to,
      user_id: resolvedLeadId,
      conversation_initiation_client_data: {
        dynamic_variables: {
          leadId: resolvedLeadId
        }
      },
      source_info: { source: 'node_js_sdk', version: '1.0.0' }
    };
  }

  async createOutboundCall({ to, leadId }) {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs outbound calling is not configured. Set ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, and ELEVENLABS_PHONE_NUMBER_ID.');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/convai/twilio/outbound-call`,
        this.buildOutboundCallPayload({ to, leadId }),
        {
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
        }
      );

      if (!response.data?.success || !response.data?.callSid) {
        throw new Error(response.data?.message || 'ElevenLabs did not return a Twilio call SID');
      }

      return response.data;
    } catch (err) {
      const providerMessage = err.response?.data?.detail || err.response?.data?.message;
      logger.error('ElevenLabs outbound call initiation failed', {
        error: providerMessage || err.message,
        leadId,
        to
      });
      throw new Error(providerMessage || err.message);
    }
  }

  /**
   * Fetch agent configuration from ElevenLabs Conversational AI API
   */
  async getAgentDetails(agentId = this.agentId) {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return {
        agent_id: agentId,
        name: 'Sales Qualification Agent',
        conversation_config: {
          agent: {
            prompt: { prompt: 'Default sales qualification prompt' },
            first_message: 'Hi, am I speaking with the founder?'
          }
        }
      };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/convai/agents/${agentId}`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      return response.data;
    } catch (err) {
      logger.error('Failed to fetch ElevenLabs agent details', { error: err.message });
      return null;
    }
  }

  async getConversationDetails(conversationId) {
    if (!conversationId || !this.apiKey || this.apiKey.startsWith('MOCK')) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/convai/conversations/${encodeURIComponent(conversationId)}`, {
        headers: { 'xi-api-key': this.apiKey }
      });
      return response.data;
    } catch (err) {
      logger.warn('Failed to fetch ElevenLabs conversation details', {
        conversationId,
        error: err.response?.data?.detail || err.message
      });
      return null;
    }
  }

  /**
   * Helper to fetch synthesized TTS audio buffer
   */
  async textToSpeech(text, voiceId = '21m00Tcm4TlvDq8ikWAM') {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return Buffer.from('mock_audio_data');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );
      return response.data;
    } catch (err) {
      logger.error('ElevenLabs TTS synthesis failed', { error: err.message });
      return null;
    }
  }
}

module.exports = new ElevenLabsService();
