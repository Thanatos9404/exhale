import { describe, expect, it } from 'vitest';
import { defined } from './assert';

describe('defined', () => {
  it('returns the value it was given', () => {
    const member = { id: 'you' };
    expect(defined(member)).toBe(member);
    expect(defined('x', 'label')).toBe('x');
  });

  it('lets falsy values that are present through', () => {
    expect(defined(0)).toBe(0);
    expect(defined('')).toBe('');
    expect(defined(false)).toBe(false);
    expect(defined(Number.NaN)).toBeNaN();
  });

  it('throws a named error for null and undefined', () => {
    expect(() => defined(null, 'household member')).toThrow(
      'Expected household member to be defined',
    );
    expect(() => defined(undefined, 'AQI category table')).toThrow(
      'Expected AQI category table to be defined',
    );
  });

  it('names the missing thing "value" when no name is given', () => {
    expect(() => defined(undefined)).toThrow('Expected value to be defined');
    expect(() => defined(null)).toThrow(Error);
  });
});
