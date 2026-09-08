import { describe, it, expect } from 'vitest';
import leadService from '../src/services/lead.service';

describe('Lead Service E.164 Normalization & Phone Validation', () => {
  it('should normalize 10-digit Indian phone numbers to +91', () => {
    const normalized = leadService.normalizePhoneNumber('9876543210');
    expect(normalized).toBe('+919876543210');
  });

  it('should preserve valid E.164 formatted numbers', () => {
    const normalized = leadService.normalizePhoneNumber('+15005550006');
    expect(normalized).toBe('+15005550006');
  });

  it('should strip out formatting hyphens and spaces', () => {
    const normalized = leadService.normalizePhoneNumber('+91 (987) 654-3210');
    expect(normalized).toBe('+919876543210');
  });
});
