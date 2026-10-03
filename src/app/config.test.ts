import { DateTime, IANAZone } from 'luxon';
import { describe, expect, it } from 'vitest';
import { DEMO_TIMEZONE } from './config';

describe('illustrative demo timezone', () => {
  it('configures Los Angeles as a valid IANA zone', () => {
    expect(DEMO_TIMEZONE).toBe('America/Los_Angeles');
    expect(IANAZone.isValidZone(DEMO_TIMEZONE)).toBe(true);
    expect(
      DateTime.fromISO('2026-01-15T18:00:00Z', { zone: DEMO_TIMEZONE }).hour,
    ).toBe(10);
  });
});
