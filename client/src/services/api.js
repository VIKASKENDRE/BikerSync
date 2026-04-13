// In dev: VITE_SOCKET_URL=http://localhost:4000 (direct, bypasses Vite proxy)
// In prod: VITE_SOCKET_URL=https://bikersync-server-production.up.railway.app
export const BASE = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api`;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
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
