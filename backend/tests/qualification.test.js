import { describe, it, expect } from 'vitest';
import OpenAIAdapter from '../src/integrations/llm/openai.adapter';

describe('LLM Structured Intent Classification & Mock Mode', () => {
  const adapter = new OpenAIAdapter('MOCK_KEY', 'gpt-4o-mini');

  it('should detect CALLBACK_REQUEST intent when user says call me tomorrow', async () => {
    const res = await adapter.generateStructuredJSON('System Prompt', 'I am busy right now, call me tomorrow at 3 PM');
    expect(res.intent).toBe('CALLBACK_REQUEST');
    expect(res.callback.requested).toBe(true);
  });

  it('should detect DO_NOT_CALL intent when user asks to stop calling', async () => {
    const res = await adapter.generateStructuredJSON('System Prompt', 'Please remove my number and don\'t call me again');
    expect(res.intent).toBe('DO_NOT_CALL');
    expect(res.doNotCall).toBe(true);
  });
});
