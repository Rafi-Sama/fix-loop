import { describe, expect, it } from 'vitest';
import { parseUnitLabels } from './units';
import { duration, parseMoney, window, zonedTime } from './format';

describe('parseUnitLabels', () => {
  it('expands numeric and letter ranges, keeps padding, dedupes', () => {
    expect(parseUnitLabels('101-103, 201, A-C, 101')).toEqual(['101', '102', '103', '201', 'A', 'B', 'C']);
    expect(parseUnitLabels('01-03')).toEqual(['01', '02', '03']);
    expect(parseUnitLabels('B1-B3')).toEqual(['B1', 'B2', 'B3']);
  });
  it('rejects backwards and huge ranges', () => {
    expect(parseUnitLabels('110-101')).toMatch(/backwards/);
    expect(parseUnitLabels('1-1000')).toMatch(/500/);
  });
});

describe('format', () => {
  it('parses money to cents', () => {
    expect(parseMoney('$1,250.5')).toBe(125050);
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
  it('formats waits compactly', () => {
    expect(duration(0.5)).toBe('30m');
    expect(duration(27)).toBe('1d 3h');
    expect(duration(24 * 20)).toBe('3w');
  });
});

describe('zonedTime', () => {
  it('reads the wall time in the given zone, not the device zone', () => {
    expect(zonedTime('2026-11-10', '09:00', 'America/Chicago').toISOString()).toBe('2026-11-10T15:00:00.000Z');
    expect(zonedTime('2026-07-10', '09:00', 'America/Chicago').toISOString()).toBe('2026-07-10T14:00:00.000Z');
    expect(zonedTime('2026-11-10', '09:00', 'Asia/Dhaka').toISOString()).toBe('2026-11-10T03:00:00.000Z');
  });
  it('handles both DST switch days', () => {
    expect(zonedTime('2026-03-08', '09:00', 'America/New_York').toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(zonedTime('2026-11-01', '09:00', 'America/New_York').toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
  it('round-trips through window()', () => {
    const s = zonedTime('2026-11-10', '09:00', 'America/Chicago').toISOString();
    const e = zonedTime('2026-11-10', '11:00', 'America/Chicago').toISOString();
    expect(window(s, e, 'America/Chicago')).toBe('Tue, Nov 10, 9:00 AM–11:00 AM');
  });
});
