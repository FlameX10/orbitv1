import { describe, it, expect } from 'vitest';
import schedulingService from '../src/services/scheduling.service';

describe('Scheduling Service Natural Time Resolution', () => {
  it('should parse minute relative callback phrases correctly', () => {
    const result = schedulingService.resolveCallbackTime('call me in 15 minutes', 'Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
    const diffMins = Math.round((result.getTime() - Date.now()) / (1000 * 60));
    expect(diffMins).toBeGreaterThanOrEqual(14);
    expect(diffMins).toBeLessThanOrEqual(16);
  });

  it('should parse hour relative callback phrases correctly', () => {
    const result = schedulingService.resolveCallbackTime('call me in 2 hours', 'Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
    const diffHours = Math.round((result.getTime() - Date.now()) / (1000 * 60 * 60));
    expect(diffHours).toBe(2);
  });

  it('should parse word-based relative callback phrases correctly', () => {
    const result = schedulingService.resolveCallbackTime('after two minutes', 'Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
    const diffMins = Math.round((result.getTime() - Date.now()) / (1000 * 60));
    expect(diffMins).toBeGreaterThanOrEqual(1);
    expect(diffMins).toBeLessThanOrEqual(3);
  });

  it('should reject invalid lead IDs such as None before scheduling callback', () => {
    expect(schedulingService.normalizeLeadId('None')).toBeNull();
    expect(schedulingService.normalizeLeadId('null')).toBeNull();
    expect(schedulingService.normalizeLeadId('lead_123')).toBe('lead_123');
  });

  it('should use the first valid lead ID when an LLM sends None', () => {
    expect(schedulingService.resolveLeadId('None', 'lead_123')).toBe('lead_123');
    expect(schedulingService.resolveLeadId('None', null, 'lead_456')).toBe('lead_456');
    expect(schedulingService.resolveLeadId('None', 'null')).toBeNull();
  });

  it('should resolve "tomorrow at 3 PM" in Asia/Kolkata timezone', () => {
    const result = schedulingService.resolveCallbackTime('tomorrow at 3 PM', 'Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });

  it('should fallback to 3 PM afternoon if time is ambiguous', () => {
    const result = schedulingService.resolveCallbackTime('call me later today', 'Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
  });
});
