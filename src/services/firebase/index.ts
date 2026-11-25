/**
 * The entry point the UI uses for private on-device explanations. `privateAi` is null when the
 * `VITE_FIREBASE_*` variables are absent, and the UI then hides the feature entirely. Importing
 * this module loads no Firebase code: the SDK arrives on the first call.
 */
import { createPrivateAi, type PrivateAi } from './client';
import { FIREBASE_SETTINGS } from './config';

export type { AskOptions, PrivateAi, PrivateAnswer, PrivateExplanations } from './client';

/** This build's private AI client, or null when Firebase is not configured. */
export const privateAi: PrivateAi | null = FIREBASE_SETTINGS
  ? createPrivateAi(FIREBASE_SETTINGS)
  : null;
