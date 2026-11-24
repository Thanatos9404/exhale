import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatest } from './useLatest';

describe('useLatest', () => {
  it('holds the value from the first render', () => {
    const { result } = renderHook(() => useLatest('first'));
    expect(result.current.current).toBe('first');
  });

  it('points at the newest value after every render', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    expect(result.current.current).toBe(2);
    rerender({ value: 3 });
    expect(result.current.current).toBe(3);
  });

  it('keeps one ref object for the life of the component', () => {
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: 'a' },
    });
    const ref = result.current;
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    expect(result.current).toBe(ref);
    expect(ref.current).toBe('c');
  });

  it('lets a callback created once read the current props', () => {
    const { result, rerender } = renderHook(
      ({ onTick }: { onTick: () => string }) => useLatest(onTick),
      { initialProps: { onTick: () => 'old handler' } },
    );
    // A long-lived loop keeps the ref, not the handler it first saw.
    const ref = result.current;
    const tick = () => ref.current();
    expect(tick()).toBe('old handler');
    rerender({ onTick: () => 'new handler' });
    expect(tick()).toBe('new handler');
  });

  it('holds objects by identity, without copying them', () => {
    const first = { blh: 30 };
    const second = { blh: 1200 };
    const { result, rerender } = renderHook(({ value }) => useLatest(value), {
      initialProps: { value: first },
    });
    expect(result.current.current).toBe(first);
    rerender({ value: second });
    expect(result.current.current).toBe(second);
  });
});
