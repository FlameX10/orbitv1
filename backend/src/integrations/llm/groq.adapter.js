const LLMProvider = require('./llm.provider');
const OpenAIAdapter = require('./openai.adapter');
const axios = require('axios');
const logger = require('../../config/logger');

class GroqAdapter extends LLMProvider {
  constructor(apiKey, model = 'llama-3.3-70b-versatile') {
    super(apiKey, model);
  }

  async generateResponse(systemPrompt, userPrompt) {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return `Mock Groq Response: Noted. Let's proceed with qualification.`;
    }

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (err) {
      logger.error('Groq generateResponse failed', { error: err.message });
      return `Mock Groq Response: Noted. Let's proceed with qualification.`;
    }
  }

  async generateStructuredJSON(systemPrompt, userPrompt) {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return {
        intent: "ANSWER",
        confidence: 0.90,
        response: "Got it.",
        qualification: { need: "Mobile app" }
      };
    }

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: `${systemPrompt}\n\nReturn JSON strictly.` },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content.trim();
      return JSON.parse(content);
    } catch (err) {
      logger.error('Groq generateStructuredJSON failed', { error: err.message });
      return { intent: "ANSWER", qualification: {} };
    }
  }
}

module.exports = GroqAdapter;
