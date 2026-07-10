// In dev: VITE_SOCKET_URL=http://localhost:4000 (direct, bypasses Vite proxy)
// In prod: VITE_SOCKET_URL=https://bikersync-server-production.up.railway.app
import { getIdToken } from './firebase';

export const BASE = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api`;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // 15 s timeout
  try {
    // Attach the Firebase ID token when available — the server derives
    // riderId from it instead of trusting the request body. Null when
    // offline (bounded by getIdToken's internal timeout).
    const token = await getIdToken().catch(() => null);
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Server timeout — check your connection');
    if (!navigator.onLine) throw new Error('No internet connection');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  createRide: (name, leadRiderId, displayName) =>
    request('/rides', { method: 'POST', body: { name, leadRiderId, displayName } }),

  joinRide: (rideId, riderId, displayName, role) =>
    request(`/rides/${rideId}/join`, { method: 'POST', body: { riderId, displayName, role } }),

  getRide: (rideId) => request(`/rides/${rideId}`),

  triggerSOS: (payload) => request('/sos/trigger', { method: 'POST', body: payload }),
};

// ── Authenticated requests (uses Firebase ID token) ──────────────────────────

async function authRequest(path, token, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(!isFormData && { 'Content-Type': 'application/json' }),
      'Authorization': `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    body: isFormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function socialApi(getToken) {
  const req  = (path, opts = {}) => getToken().then((t) => authRequest(path, t, opts));
  const pub  = (path) => request(path); // public (no auth)

  return {
    // Profiles
    getProfile:    (uid)          => pub(`/social/profile/${uid}`),
    upsertProfile: (body)         => req('/social/profile', { method: 'PUT', body }),

    // Follow
    follow:        (uid)          => req(`/social/follow/${uid}`,   { method: 'POST' }),
    unfollow:      (uid)          => req(`/social/follow/${uid}`,   { method: 'DELETE' }),

    // Search
    searchUsers:   (q)            => pub(`/social/search?q=${encodeURIComponent(q)}`),

    // Feed & posts
    getFeed:       ()             => req('/social/feed'),
    getUserPosts:  (uid)          => pub(`/social/posts/${uid}`),
    deletePost:    (postId)       => req(`/social/posts/${postId}`, { method: 'DELETE' }),
    toggleLike:    (postId)       => req(`/social/posts/${postId}/like`, { method: 'POST' }),
    addComment:    (postId, text) => req(`/social/posts/${postId}/comment`, { method: 'POST', body: { text } }),
    deleteComment: (postId, cId)  => req(`/social/posts/${postId}/comments/${cId}`, { method: 'DELETE' }),

    // Post with optional image (FormData)
    createPost: (formData)        => req('/social/posts', { method: 'POST', body: formData }),
  };
}
