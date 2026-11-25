/**
 * Starts the Firebase app and App Check, following the official web setup: `initializeApp` with
 * the web config, then `initializeAppCheck` with a reCAPTCHA provider and token auto-refresh, so
 * every Firebase AI Logic request carries an App Check token. In a development build the debug
 * provider is switched on first by setting `self.FIREBASE_APPCHECK_DEBUG_TOKEN`, as the App Check
 * debug-provider guide describes. The SDK is imported on demand, never on first paint.
 */
import type { FirebaseApp } from 'firebase/app';
import type { FirebaseSettings } from './config';

/** Starts Firebase and App Check for these settings and returns the app. */
export async function startFirebase(settings: FirebaseSettings): Promise<FirebaseApp> {
  const [{ initializeApp }, appCheck] = await Promise.all([
    import('firebase/app'),
    import('firebase/app-check'),
  ]);
  const app = initializeApp(settings.app);
  const { provider, siteKey, debugToken } = settings.appCheck;
  // Must be set before initializeAppCheck. Only development builds ever have a debug token.
  if (debugToken !== null) Object.assign(self, { FIREBASE_APPCHECK_DEBUG_TOKEN: debugToken });
  appCheck.initializeAppCheck(app, {
    provider:
      provider === 'recaptcha-v3'
        ? new appCheck.ReCaptchaV3Provider(siteKey)
        : new appCheck.ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return app;
}
