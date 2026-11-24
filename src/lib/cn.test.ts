import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class names with single spaces, in the order given', () => {
    expect(cn('flex', 'gap-2', 'text-fg')).toBe('flex gap-2 text-fg');
  });

  it('skips false, null, undefined and empty strings', () => {
    const active = false as boolean;
    expect(cn('row', active && 'row-active', null, undefined, '', 'tabular')).toBe('row tabular');
  });

  it('returns an empty string when nothing is left', () => {
    expect(cn()).toBe('');
    expect(cn(false, null, undefined, '')).toBe('');
  });

  it('keeps a part that already holds several classes as it is', () => {
    expect(cn('px-2 py-1', 'rounded')).toBe('px-2 py-1 rounded');
  });

  it('emits exactly the truthy parts, never a stringified falsy value', () => {
    const className = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
    const part = fc.oneof(className, fc.constantFrom(false as const, null, undefined, ''));
    fc.assert(
      fc.property(fc.array(part, { maxLength: 12 }), (parts) => {
        const kept = parts.filter((p): p is string => typeof p === 'string' && p !== '');
        const tokens = cn(...parts)
          .split(' ')
          .filter((token) => token !== '');
        expect(tokens).toEqual(kept);
      }),
    );
  });
});
