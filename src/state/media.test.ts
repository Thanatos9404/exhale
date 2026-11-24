import { afterEach, describe, expect, it } from 'vitest';
import { stubMatchMedia } from '@/test/observers';
import { PREFERS_DARK, PREFERS_REDUCED_MOTION, mediaMatches, mediaQuery } from './media';

let restore: (() => void) | undefined;

/** Removes `window.matchMedia`, as in an embedded browser that never had it. */
function removeMatchMedia(): () => void {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  return () => {
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else Reflect.deleteProperty(window, 'matchMedia');
  };
}

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('media queries', () => {
  it('names the two OS settings the app follows', () => {
    expect(PREFERS_DARK).toBe('(prefers-color-scheme: dark)');
    expect(PREFERS_REDUCED_MOTION).toBe('(prefers-reduced-motion: reduce)');
  });

  it('returns the live query list for the query it was asked about', () => {
    restore = stubMatchMedia((query) => query === PREFERS_DARK);
    expect(mediaQuery(PREFERS_DARK)).toMatchObject({ media: PREFERS_DARK, matches: true });
    expect(mediaQuery(PREFERS_REDUCED_MOTION)).toMatchObject({
      media: PREFERS_REDUCED_MOTION,
      matches: false,
    });
  });

  it('reports whether a query matches right now', () => {
    restore = stubMatchMedia((query) => query === PREFERS_REDUCED_MOTION);
    expect(mediaMatches(PREFERS_REDUCED_MOTION)).toBe(true);
    expect(mediaMatches(PREFERS_DARK)).toBe(false);
  });

  it('follows the setting when it changes', () => {
    let dark = false;
    restore = stubMatchMedia(() => dark);
    expect(mediaMatches(PREFERS_DARK)).toBe(false);
    dark = true;
    expect(mediaMatches(PREFERS_DARK)).toBe(true);
  });
});

describe('media queries where the browser has no matchMedia', () => {
  it('has no query list to offer', () => {
    restore = removeMatchMedia();
    expect(mediaQuery(PREFERS_DARK)).toBeNull();
  });

  it('treats every query as not matching, without throwing', () => {
    restore = removeMatchMedia();
    expect(mediaMatches(PREFERS_DARK)).toBe(false);
    expect(mediaMatches(PREFERS_REDUCED_MOTION)).toBe(false);
  });

  it('works again once matchMedia is back', () => {
    removeMatchMedia()();
    restore = stubMatchMedia(() => true);
    expect(mediaMatches(PREFERS_DARK)).toBe(true);
  });
});
