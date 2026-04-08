import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setIsAdmin(false); setLoading(false); return; }

    user.getIdToken().then((token) =>
      fetch(`${import.meta.env.VITE_SOCKET_URL}/api/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    )
    .then((r) => { setIsAdmin(r.ok); })
    .catch(() => setIsAdmin(false))
    .finally(() => setLoading(false));
  }, [user]);

  // Returns a fetch wrapper that auto-attaches the admin Bearer token
  const adminFetch = async (path, options = {}) => {
    const token = await auth.currentUser.getIdToken();
    const base  = import.meta.env.VITE_SOCKET_URL;
    const res   = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Request failed');
    return data;
  };

  return { isAdmin, loading, adminFetch };
}
