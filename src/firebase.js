import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

/**
 * Firebase bootstrap. Reads config from Vite env vars (VITE_FIREBASE_*) which
 * get inlined at build time. See .env.example for required variables; create
 * a local .env.local with real values for development.
 *
 * Note: Firebase *web* API keys are public-by-design (they identify the
 * project, not authenticate), so the values will still appear in the built
 * JS bundle. Real security comes from HTTP-referrer restrictions on the API
 * key (Google Cloud Console → Credentials) and Firebase Security Rules.
 *
 * Analytics is intentionally skipped in dev (`vite dev`) so local play
 * doesn't pollute production metrics.
 */
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

// Fail loud-but-not-fatal if the env wasn't provided — game still runs without
// Firebase, just no Analytics.
const hasConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const app = hasConfig ? initializeApp(firebaseConfig) : null;

export let analytics = null;

if (hasConfig && env.PROD) {
  isSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => { /* analytics is best-effort */ });
}

if (!hasConfig && env.DEV) {
  console.warn('[firebase] No VITE_FIREBASE_* env vars set. Analytics disabled. Copy .env.example to .env.local and fill in your values.');
}
