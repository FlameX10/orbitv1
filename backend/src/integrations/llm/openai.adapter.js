const LLMProvider = require('./llm.provider');
const axios = require('axios');
const logger = require('../../config/logger');

class OpenAIAdapter extends LLMProvider {
  constructor(apiKey, model = 'gpt-4o-mini') {
    super(apiKey, model);
  }

  async generateResponse(systemPrompt, userPrompt) {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return this._mockResponse(userPrompt);
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3
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
      logger.error('OpenAI generateResponse failed', { error: err.message });
      return this._mockResponse(userPrompt);
    }
  }

  async generateStructuredJSON(systemPrompt, userPrompt) {
    if (!this.apiKey || this.apiKey.startsWith('MOCK')) {
      return this._mockStructuredJSON(userPrompt);
    }

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.model,
          messages: [
            { role: 'system', content: `${systemPrompt}\n\nIMPORTANT: Respond strictly in valid raw JSON format without markdown code blocks.` },
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
      logger.error('OpenAI generateStructuredJSON failed', { error: err.message });
      return this._mockStructuredJSON(userPrompt);
    }
  }

  _mockResponse(userPrompt) {
    return `Mock AI Response: Thank you for sharing that information. Let me take note of that.`;
  }

  _mockStructuredJSON(userPrompt) {
    const text = userPrompt.toLowerCase();
    
    let intent = 'ANSWER';
    let callbackRequested = false;
    let doNotCall = false;

    if (text.includes('don\'t call') || text.includes('dont call') || text.includes('remove me') || text.includes('stop calling') || text.includes('do not call')) {
      intent = 'DO_NOT_CALL';
      doNotCall = true;
    } else if (text.includes('call me') || text.includes('callback') || text.includes('busy') || text.includes('later') || text.includes('tomorrow')) {
      intent = 'CALLBACK_REQUEST';
      callbackRequested = true;
    } else if (text.includes('not interested') || text.includes('no thanks')) {
      intent = 'NOT_INTERESTED';
    }

    return {
      intent,
      confidence: 0.95,
      response: callbackRequested ? "Sure, I'll schedule a callback for you." : "Thank you for the information.",
      qualification: {
        budget: text.includes('lakh') || text.includes('$') || text.includes('budget') ? "₹5-10 Lakhs" : null,
        need: text.includes('app') || text.includes('website') || text.includes('software') ? "Custom Software Development" : null,
        authority: text.includes('founder') || text.includes('ceo') || text.includes('decision') ? "Decision Maker" : null,
        timeline: text.includes('month') || text.includes('soon') || text.includes('now') ? "Immediate (1 month)" : null
      },
      callback: {
        requested: callbackRequested,
        rawText: text,
        suggestedDate: "2026-08-17",
        suggestedTime: "15:00"
      },
      doNotCall,
      next_action: callbackRequested ? 'SCHEDULE_CALLBACK' : doNotCall ? 'END_CALL_DNC' : 'CONTINUE_QUALIFICATION'
    };
  }
}

module.exports = OpenAIAdapter;
