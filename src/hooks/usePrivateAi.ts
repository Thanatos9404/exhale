/**
 * React access to private on-device answers: the shared on/off choice, the client that writes
 * them, and a promise for "Gemini Nano is prepared". The Routine page and the Assistant read the
 * same store, so switching it on in one place switches it on in the other.
 */
import { useSyncExternalStore } from 'react';
import { privateAi, type PrivateAi } from '@/services/firebase';
import { createChoiceStore, type PrivateAiChoice } from '@/state/privateAiChoice';

const store = createChoiceStore(privateAi);

/** The choice, the setter and the client (null when Firebase is not configured). */
export interface PrivateAiControls extends PrivateAiChoice {
  setEnabled: (on: boolean) => void;
  client: PrivateAi | null;
  whenPrepared: () => Promise<void>;
}

/** The shared private-answers choice, re-rendering the caller when it changes. */
export function usePrivateAi(): PrivateAiControls {
  const choice = useSyncExternalStore(store.subscribe, store.read);
  return { ...choice, setEnabled: store.set, client: privateAi, whenPrepared: store.whenPrepared };
}
