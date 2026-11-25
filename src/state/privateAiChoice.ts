/**
 * The household's choice to have today's plan explained privately: by Gemini Nano inside this
 * browser through Firebase AI Logic, falling back to cloud Gemini through Firebase. One choice is
 * shared by the Routine page and the Assistant and remembered in this browser. Turning it on also
 * asks Chrome to get Gemini Nano ready, and requests wait for that before they run, so a download
 * in progress is not mistaken for "on-device unavailable". Framework-free; `usePrivateAi` binds
 * it to React.
 */
import { KEYS, readStored, writeStored } from '@/lib/storage';
import type { PrivateAi } from '@/services/firebase';

/** What the UI shows about the choice. */
export interface PrivateAiChoice {
  /** False when Firebase is not configured: the feature is hidden and always off. */
  available: boolean;
  enabled: boolean;
  /** Gemini Nano download progress from 0 to 1 while it is being prepared, else null. */
  preparing: number | null;
}

const isFlag = (raw: unknown) => (typeof raw === 'boolean' ? raw : null);

/** A store over one client; `ai` is null when Firebase is not configured. */
export function createChoiceStore(ai: PrivateAi | null) {
  const listeners = new Set<() => void>();
  let preparing: number | null = null;
  let prepared: Promise<void> = Promise.resolve();
  let snapshot: PrivateAiChoice | null = null;
  const notify = () => listeners.forEach((listener) => listener());

  function read(): PrivateAiChoice {
    const enabled = ai !== null && readStored(KEYS.privateAi, isFlag) === true;
    if (snapshot?.enabled !== enabled || snapshot.preparing !== preparing)
      snapshot = { available: ai !== null, enabled, preparing };
    return snapshot;
  }

  function prepare(client: PrivateAi): void {
    preparing = 0;
    notify();
    prepared = client
      .prepareOnDevice((fraction) => {
        preparing = fraction;
        notify();
      })
      // A failed start is reported by the request that follows; preparing never blocks it.
      .catch(() => undefined)
      .finally(() => {
        preparing = null;
        notify();
      });
  }

  return {
    read,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Turns private answers on or off. Call it from the user's click (see `prepareOnDevice`). */
    set: (on: boolean): void => {
      if (!ai) return;
      writeStored(KEYS.privateAi, on);
      if (on) prepare(ai);
      else notify();
    },
    /** Resolves once a preparation started by `set(true)` has finished, whatever its outcome. */
    whenPrepared: (): Promise<void> => prepared,
  };
}

/** The store's API. */
export type ChoiceStore = ReturnType<typeof createChoiceStore>;
