/**
 * AuthContext — offline-first user identity.
 *
 * No Firebase Authentication. riderId is a stable UUID generated once
 * and stored in localStorage forever. displayName is also persisted so
 * the user only types it once.
 *
 * Exposes the same { user, logout } shape that Home.jsx expects so that
 * callers don't need to change.
 */
import { createContext, useContext, useMemo, useState } from 'react';

const AuthContext = createContext(null);

function loadOrCreateRiderId() {
  let id = localStorage.getItem('bs_rider_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('bs_rider_id', id);
  }
  return id;
}

export function AuthProvider({ children }) {
  const uid = useMemo(loadOrCreateRiderId, []);

  const [displayName, setDisplayName] = useState(
    () => localStorage.getItem('bs_display_name') ?? '',
  );

  const updateDisplayName = (name) => {
    const trimmed = name.trim();
    localStorage.setItem('bs_display_name', trimmed);
    setDisplayName(trimmed);
  };

  // Shape compatible with Home.jsx (user.uid, user.displayName)
  const user = { uid, displayName };

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
