/**
 * firebase.js — Firebase Realtime Database + Anonymous Auth.
 *
 * No login screen: every install signs in as a Firebase ANONYMOUS user once
 * and the uid becomes the rider's verifiable identity. The server checks the
 * ID token on Socket.io handshakes and ride REST calls, so riderId/role can't
 * be spoofed by anyone who merely knows a ride ID.
 */
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const RTDB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL ||
  `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`;

const app = initializeApp(firebaseConfig);

let _rtdb = null;
try {
  _rtdb = getDatabase(app, RTDB_URL);
} catch (e) {
  console.error('[Firebase] RTDB init failed:', e.message);
}
export const rtdb = _rtdb;

let _auth = null;
try {
  _auth = getAuth(app);
} catch (e) {
  console.error('[Firebase] Auth init failed:', e.message);
}

let _signInPromise = null;

/**
 * Resolve the Firebase anonymous user, signing in on first call.
 * Waits for persistence restore first so an existing anonymous account is
 * reused instead of minting a new uid every launch.
 * Returns null when offline or auth is unavailable — callers fall back to
 * the legacy localStorage UUID (the offline mesh doesn't need a token).
 */
export async function ensureSignedIn() {
  if (!_auth) return null;
  try {
    await _auth.authStateReady();
    if (_auth.currentUser) return _auth.currentUser;
    if (!_signInPromise) {
      _signInPromise = signInAnonymously(_auth)
        .then((cred) => cred.user)
        .catch((e) => {
          _signInPromise = null; // retry on a later call (e.g. offline at launch)
          console.warn('[Firebase] Anonymous sign-in failed:', e.code ?? e.message);
          return null;
        });
    }
    return await _signInPromise;
  } catch {
    return null;
  }
}

/**
 * Fresh Firebase ID token, or null when unavailable.
 * Bounded by a timeout so joining a ride offline is never blocked on auth.
 */
export function getIdToken(timeoutMs = 4000) {
  const attempt = ensureSignedIn()
    .then((user) => (user ? user.getIdToken() : null))
    .catch(() => null);
  return Promise.race([
    attempt,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

/** Subscribe to auth state changes; returns an unsubscribe function. */
export function watchAuth(callback) {
  if (!_auth) return () => {};
  return onAuthStateChanged(_auth, callback);
}
