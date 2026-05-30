import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

/**
 * Firebase bootstrap. Initializes the app on import and lazily attaches
 * Analytics if the browser supports it (most do — fails on SSR, some
 * iOS in-app webviews, and when the user has tracking protection cranked up).
 *
 * Analytics is intentionally skipped in dev (`vite dev`) so local play
 * doesn't pollute production metrics.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBzgaCb2hhZe_c-DFE5Tnt-kuaX5piWUtU',
  authDomain: 'play-horror-maze.firebaseapp.com',
  projectId: 'play-horror-maze',
  storageBucket: 'play-horror-maze.firebasestorage.app',
  messagingSenderId: '692856878035',
  appId: '1:692856878035:web:1530ff1488b1f62db3b526',
  measurementId: 'G-VSVDCNLVNZ'
};

export const app = initializeApp(firebaseConfig);

export let analytics = null;

if (import.meta.env.PROD) {
  isSupported()
    .then((supported) => {
      if (supported) analytics = getAnalytics(app);
    })
    .catch(() => { /* analytics is best-effort */ });
}
