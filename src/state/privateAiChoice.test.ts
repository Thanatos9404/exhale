import { describe, expect, it, vi } from 'vitest';
import { KEYS } from '@/lib/storage';
import type { PrivateAi } from '@/services/firebase';
import { createChoiceStore } from './privateAiChoice';

/** The shared on/off choice for private answers, and the Gemini Nano preparation it starts. */

function fakeClient(prepare: PrivateAi['prepareOnDevice'] = async () => {}): PrivateAi {
  return {
    prepareOnDevice: vi.fn(prepare),
    explainPlanOnDevice: vi.fn(),
    askOnDevice: vi.fn(),
  };
}

describe('createChoiceStore', () => {
  it('is unavailable and always off when Firebase is not configured', () => {
    localStorage.setItem(KEYS.privateAi, 'true');
    const store = createChoiceStore(null);
    store.set(true);
    expect(store.read()).toEqual({ available: false, enabled: false, preparing: null });
  });

  it('starts off, and remembers the choice in this browser', () => {
    const store = createChoiceStore(fakeClient());
    expect(store.read().enabled).toBe(false);
    store.set(true);
    expect(localStorage.getItem(KEYS.privateAi)).toBe('true');
    expect(createChoiceStore(fakeClient()).read().enabled).toBe(true);
    store.set(false);
    expect(store.read().enabled).toBe(false);
  });

  it('ignores a stored value that is not a boolean', () => {
    localStorage.setItem(KEYS.privateAi, '"yes"');
    expect(createChoiceStore(fakeClient()).read().enabled).toBe(false);
  });

  it('prepares Gemini Nano when turned on, reporting progress, then settles', async () => {
    let report: ((fraction: number) => void) | undefined;
    let finish!: () => void;
    const client = fakeClient(
      (progress) =>
        new Promise<void>((resolve) => {
          report = progress;
          finish = resolve;
        }),
    );
    const store = createChoiceStore(client);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(true);
    expect(client.prepareOnDevice).toHaveBeenCalledTimes(1);
    expect(store.read().preparing).toBe(0);
    report?.(0.42);
    expect(store.read().preparing).toBe(0.42);

    finish();
    await store.whenPrepared();
    expect(store.read().preparing).toBeNull();
    expect(listener).toHaveBeenCalled();
  });

  it('never lets a failed preparation block a request', async () => {
    const store = createChoiceStore(fakeClient(() => Promise.reject(new Error('offline'))));
    store.set(true);
    await expect(store.whenPrepared()).resolves.toBeUndefined();
    expect(store.read().preparing).toBeNull();
  });

  it('keeps the same snapshot while nothing changes, as useSyncExternalStore needs', () => {
    const store = createChoiceStore(fakeClient());
    expect(store.read()).toBe(store.read());
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const store = createChoiceStore(fakeClient());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
