import { BadRequestApiError } from './errors';
import { isWithinRange, parseDateRange, parseOptionalOrderStatus } from './validation';

describe('parseDateRange', () => {
  it('returns nulls when no from/to are given', () => {
    expect(parseDateRange({})).toEqual({ from: null, to: null });
  });

  it('accepts valid ISO dates', () => {
    expect(parseDateRange({ from: '2026-04-01', to: '2026-05-01' })).toEqual({
      from: '2026-04-01',
      to: '2026-05-01',
    });
  });

  it('rejects a malformed date', () => {
    expect(() => parseDateRange({ from: 'not-a-date' })).toThrow(BadRequestApiError);
    expect(() => parseDateRange({ from: '2026-13-40' })).toThrow(BadRequestApiError);
  });

  it('rejects from being after to', () => {
    expect(() => parseDateRange({ from: '2026-06-01', to: '2026-05-01' })).toThrow(BadRequestApiError);
  });

  it('rejects an array value (Express query param repeated)', () => {
    expect(() => parseDateRange({ from: ['2026-04-01', '2026-05-01'] })).toThrow(BadRequestApiError);
  });
});

describe('parseOptionalOrderStatus', () => {
  it('returns null when omitted', () => {
    expect(parseOptionalOrderStatus(undefined)).toBeNull();
  });

  it('accepts a known status case-insensitively', () => {
    expect(parseOptionalOrderStatus('delayed')).toBe('DELAYED');
    expect(parseOptionalOrderStatus('DELAYED')).toBe('DELAYED');
  });

  it('rejects an unknown status', () => {
    expect(() => parseOptionalOrderStatus('ARCHIVED')).toThrow(BadRequestApiError);
  });
});

describe('isWithinRange', () => {
  it('is true when both bounds are open', () => {
    expect(isWithinRange('2026-01-01', { from: null, to: null })).toBe(true);
  });

  it('respects a from-only lower bound', () => {
    expect(isWithinRange('2026-01-01', { from: '2026-02-01', to: null })).toBe(false);
    expect(isWithinRange('2026-03-01', { from: '2026-02-01', to: null })).toBe(true);
  });

  it('respects a to-only upper bound', () => {
    expect(isWithinRange('2026-03-01', { from: null, to: '2026-02-01' })).toBe(false);
    expect(isWithinRange('2026-01-01', { from: null, to: '2026-02-01' })).toBe(true);
  });

  it('is inclusive of both bounds', () => {
    expect(isWithinRange('2026-02-01', { from: '2026-02-01', to: '2026-02-01' })).toBe(true);
  });
});
