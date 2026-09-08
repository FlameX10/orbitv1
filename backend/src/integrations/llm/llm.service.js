const env = require('../../config/env');
const logger = require('../../config/logger');
const OpenAIAdapter = require('./openai.adapter');
const GroqAdapter = require('./groq.adapter');

class LLMService {
  constructor() {
    this.provider = this._initProvider();
  }

  _initProvider() {
    const providerType = env.llm.provider;
    logger.info(`Initializing LLM Provider: [${providerType}]`);

    switch (providerType) {
      case 'groq':
        return new GroqAdapter(env.llm.apiKey, env.llm.model || 'llama-3.3-70b-versatile');
      case 'openai':
      default:
        return new OpenAIAdapter(env.llm.apiKey, env.llm.model || 'gpt-4o-mini');
    }
  }

  /**
   * Analyzes human transcript message to classify intent, extract qualification details & callbacks
   */
  async classifyAndExtract(humanMessage, previousContext = '') {
    const systemPrompt = `You are a conversational intelligence agent for an AI Lead Qualification outbound calling platform.
Analyze the human response in an ongoing phone call.

Intents:
- ANSWER: Answering qualification question
- QUESTION: Asking a question about company services
- INTERESTED: Expressing explicit interest
- NOT_INTERESTED: Refusing or rejecting product
- CALLBACK_REQUEST: Requesting to call back later, busy, or specifying a time
- DO_NOT_CALL: Asking never to be called again / unsubscribe
- BUSY: Currently unavailable, needs call later
- END_CALL: Wants to hang up

Extract BANT Qualification fields:
- budget: String or null (e.g., "₹5 Lakhs", "$10k")
- need: String or null (e.g., "Mobile app for delivery", "Web Portal")
- authority: String or null (e.g., "Decision maker", "Co-founder", "Employee")
- timeline: String or null (e.g., "Within 1 month", "Q3")

Extract Callback intent if present:
- requested: boolean
- rawText: original phrase describing time (e.g., "call me tomorrow at 3 PM", "in 15 minutes", "after 5 PM")

Respond strictly with valid JSON:
{
  "intent": "ANSWER" | "CALLBACK_REQUEST" | "DO_NOT_CALL" | "NOT_INTERESTED" | "BUSY" | "QUESTION",
  "confidence": 0.95,
  "response": "Brief agent response statement",
  "qualification": {
    "budget": null,
    "need": null,
    "authority": null,
    "timeline": null
  },
  "callback": {
    "requested": false,
    "rawText": null
  },
  "doNotCall": false,
  "next_action": "CONTINUE_QUALIFICATION" | "SCHEDULE_CALLBACK" | "END_CALL_DNC" | "WRAP_UP"
}`;

    const userPrompt = `Previous Conversation Context:\n${previousContext}\n\nLatest Human Input:\n"${humanMessage}"`;
    return await this.provider.generateStructuredJSON(systemPrompt, userPrompt);
  }

  /**
   * Generates post-call summary and score evaluation
   */
  async generatePostCallSummary(transcriptMessages, agentConfig) {
    const transcriptText = transcriptMessages
      .map(m => `[${m.role}] ${m.content}`)
      .join('\n');

    const systemPrompt = `You are an AI sales quality evaluator. Review the call transcript and generate a structured evaluation.

Return JSON strictly:
{
  "summary": "3-4 sentence concise summary of the conversation",
  "disposition": "QUALIFIED" | "NOT_QUALIFIED" | "CALLBACK" | "NOT_INTERESTED" | "DO_NOT_CALL" | "UNREACHABLE",
  "budget": "extracted budget or Unknown",
  "need": "extracted software need or Unknown",
  "authority": "extracted decision maker status or Unknown",
  "timeline": "extracted project start date or Unknown",
  "scores": {
    "needScore": 25,
    "budgetScore": 20,
    "authorityScore": 15,
    "timelineScore": 15,
    "fitScore": 10,
    "totalScore": 85
  }
}`;

    const userPrompt = `Call Transcript:\n${transcriptText}\n\nAgent Scoring Configuration:\n${JSON.stringify(agentConfig.scoringRules || {})}`;
    return await this.provider.generateStructuredJSON(systemPrompt, userPrompt);
  }
}

module.exports = new LLMService();
