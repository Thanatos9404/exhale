// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEFAULT_CLOUD_MODEL, FIREBASE_SETTINGS, readFirebaseSettings } from './config';
import { privateAi } from './index';

/** Reading the public Firebase config from the build environment, with and without it. */

const COMPLETE = {
  VITE_FIREBASE_API_KEY: 'test-web-api-key',
  VITE_FIREBASE_PROJECT_ID: 'exhale-test',
  VITE_FIREBASE_APP_ID: '1:123:web:abc',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'test-site-key',
};

describe('readFirebaseSettings', () => {
  it('is null when Firebase is not configured, so the feature stays hidden', () => {
    expect(readFirebaseSettings({}, false)).toBeNull();
    expect(readFirebaseSettings({ MODE: 'production', DEV: false }, false)).toBeNull();
  });

  it('treats the empty values of .env.example as not configured', () => {
    const empty = Object.fromEntries(Object.keys(COMPLETE).map((key) => [key, '']));
    expect(readFirebaseSettings(empty, true)).toBeNull();
    expect(readFirebaseSettings({ ...COMPLETE, VITE_FIREBASE_APP_ID: '  ' }, true)).toBeNull();
  });

  it('needs App Check: without a reCAPTCHA site key the feature stays hidden', () => {
    const { VITE_FIREBASE_APPCHECK_SITE_KEY: _key, ...noAppCheck } = COMPLETE;
    expect(readFirebaseSettings(noAppCheck, true)).toBeNull();
  });

  it('builds the web config, App Check provider and cloud model from a complete environment', () => {
    expect(readFirebaseSettings(COMPLETE, false)).toEqual({
      app: { apiKey: 'test-web-api-key', projectId: 'exhale-test', appId: '1:123:web:abc' },
      appCheck: { provider: 'recaptcha-enterprise', siteKey: 'test-site-key', debugToken: null },
      cloudModel: DEFAULT_CLOUD_MODEL,
    });
  });

  it('passes the optional values through when they are set', () => {
    const settings = readFirebaseSettings(
      {
        ...COMPLETE,
        VITE_FIREBASE_AUTH_DOMAIN: 'exhale-test.firebaseapp.com',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
        VITE_FIREBASE_APPCHECK_PROVIDER: 'recaptcha-v3',
        VITE_FIREBASE_AI_CLOUD_MODEL: 'gemini-test-model',
      },
      false,
    );
    expect(settings?.app).toEqual({
      apiKey: 'test-web-api-key',
      projectId: 'exhale-test',
      appId: '1:123:web:abc',
      authDomain: 'exhale-test.firebaseapp.com',
      messagingSenderId: '123',
    });
    expect(settings?.appCheck.provider).toBe('recaptcha-v3');
    expect(settings?.cloudModel).toBe('gemini-test-model');
  });

  it('refuses an unknown App Check provider rather than guessing', () => {
    expect(
      readFirebaseSettings({ ...COMPLETE, VITE_FIREBASE_APPCHECK_PROVIDER: 'recaptcha-v2' }, false),
    ).toBeNull();
  });

  it('turns on the App Check debug provider in development builds only', () => {
    expect(readFirebaseSettings(COMPLETE, true)?.appCheck.debugToken).toBe(true);
    const withToken = { ...COMPLETE, VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: 'registered-debug-token' };
    expect(readFirebaseSettings(withToken, true)?.appCheck.debugToken).toBe(
      'registered-debug-token',
    );
    // A production build ignores a debug token, even one left in the environment.
    expect(readFirebaseSettings(withToken, false)?.appCheck.debugToken).toBeNull();
  });
});

describe('FIREBASE_SETTINGS', () => {
  it('is null in tests: vite.config.ts empties every VITE_FIREBASE_* variable', () => {
    expect(FIREBASE_SETTINGS).toBeNull();
  });

  it('leaves the app without a private AI client, so existing behaviour is unchanged', () => {
    expect(privateAi).toBeNull();
  });
});
