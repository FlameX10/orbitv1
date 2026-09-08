/**
 * Base abstract class for LLM Provider abstraction
 */
class LLMProvider {
  constructor(apiKey, model) {
    if (this.constructor === LLMProvider) {
      throw new Error('Abstract class LLMProvider cannot be instantiated directly.');
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Generates a text response from the model given a system prompt and prompt messages
   */
  async generateResponse(systemPrompt, userPrompt) {
    throw new Error('Method generateResponse() must be implemented.');
  }

  /**
   * Generates structured JSON output given a JSON schema expectation
   */
  async generateStructuredJSON(systemPrompt, userPrompt) {
    throw new Error('Method generateStructuredJSON() must be implemented.');
  }
}

module.exports = LLMProvider;
