/**
 * AuthContext — frictionless rider identity.
 *
 * No login screen. Identity is a Firebase ANONYMOUS user: the uid is
 * verifiable by the server (Socket.io handshake and ride REST calls carry
 * the ID token). While offline or before the first sign-in completes, a
 * localStorage UUID keeps the offline mesh working; the Firebase uid takes
 * over as soon as it is known.
 *
 * Exposes the same { user, updateDisplayName } shape as before so callers
 * don't need to change.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ensureSignedIn, watchAuth } from '../services/firebase';

const AuthContext = createContext(null);

function loadOrCreateFallbackId() {
  let id = localStorage.getItem('bs_rider_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('bs_rider_id', id);
  }
  return id;
}

export function AuthProvider({ children }) {
  const fallbackUid = useMemo(loadOrCreateFallbackId, []);
  const [firebaseUid, setFirebaseUid] = useState(null);

  useEffect(() => {
    ensureSignedIn(); // kick off anonymous sign-in (no-op if already signed in)
    return watchAuth((u) => setFirebaseUid(u?.uid ?? null));
  }, []);

  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('bs_display_name') ?? '',
  );

  const updateDisplayName = (name) => {
    const trimmed = name.trim();
    localStorage.setItem('bs_display_name', trimmed);
    setDisplayName(trimmed);
  };

  // Shape compatible with Home.jsx (user.uid, user.displayName)
  const user = { uid: firebaseUid ?? fallbackUid, displayName };

  return (
    <AuthContext.Provider value={{ user, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
