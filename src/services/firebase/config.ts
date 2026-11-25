/**
 * The Firebase settings for private on-device explanations, read once from the public
 * `VITE_FIREBASE_*` build variables. A Firebase web config is public by design (it names the
 * project; App Check and the console decide who may use it), so it may ship in the bundle. When
 * any required value is missing the settings are null and the feature stays hidden. This module
 * loads no Firebase code.
 */
import { z } from 'zod';

/** Cloud model Firebase AI Logic falls back to: the SDK's documented hybrid default. */
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

/** Which reCAPTCHA product attests the app to App Check. */
export type AppCheckProvider = 'recaptcha-enterprise' | 'recaptcha-v3';

/** Everything the browser needs to start Firebase, App Check and the hybrid model. */
export interface FirebaseSettings {
  /** The Firebase web app config, as `initializeApp` takes it. */
  app: {
    apiKey: string;
    projectId: string;
    appId: string;
    authDomain?: string;
    messagingSenderId?: string;
  };
  appCheck: {
    provider: AppCheckProvider;
    siteKey: string;
    /**
     * The value for `self.FIREBASE_APPCHECK_DEBUG_TOKEN`: a registered debug token, `true` to have
     * the SDK print a new one, or null outside development so production never skips attestation.
     */
    debugToken: string | true | null;
  };
  /** Cloud Gemini model used when Gemini Nano is not available on this device. */
  cloudModel: string;
}

/** An unset variable and an empty one (as in .env.example) both mean "not configured". */
const optional = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
);
const required = z.string().trim().min(1);

const envSchema = z.object({
  VITE_FIREBASE_API_KEY: required,
  VITE_FIREBASE_PROJECT_ID: required,
  VITE_FIREBASE_APP_ID: required,
  VITE_FIREBASE_AUTH_DOMAIN: optional,
  VITE_FIREBASE_MESSAGING_SENDER_ID: optional,
  VITE_FIREBASE_APPCHECK_SITE_KEY: required,
  VITE_FIREBASE_APPCHECK_PROVIDER: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['recaptcha-enterprise', 'recaptcha-v3']).default('recaptcha-enterprise'),
  ),
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: optional,
  VITE_FIREBASE_AI_CLOUD_MODEL: optional,
});

/**
 * Settings from a build environment, or null when Firebase is not configured. `dev` is true only
 * in a development build: the App Check debug provider is never enabled anywhere else.
 */
export function readFirebaseSettings(
  env: Record<string, unknown>,
  dev: boolean,
): FirebaseSettings | null {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return null;
  const e = parsed.data;
  const authDomain = e.VITE_FIREBASE_AUTH_DOMAIN;
  const senderId = e.VITE_FIREBASE_MESSAGING_SENDER_ID;
  return {
    app: {
      apiKey: e.VITE_FIREBASE_API_KEY,
      projectId: e.VITE_FIREBASE_PROJECT_ID,
      appId: e.VITE_FIREBASE_APP_ID,
      // Optional fields are left out rather than passed as undefined.
      ...(authDomain ? { authDomain } : {}),
      ...(senderId ? { messagingSenderId: senderId } : {}),
    },
    appCheck: {
      provider: e.VITE_FIREBASE_APPCHECK_PROVIDER,
      siteKey: e.VITE_FIREBASE_APPCHECK_SITE_KEY,
      debugToken: dev ? (e.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? true) : null,
    },
    cloudModel: e.VITE_FIREBASE_AI_CLOUD_MODEL ?? DEFAULT_CLOUD_MODEL,
  };
}

/** This build's settings: null unless every required `VITE_FIREBASE_*` variable is set. */
export const FIREBASE_SETTINGS = readFirebaseSettings(import.meta.env, import.meta.env.DEV);
