// In dev: VITE_SOCKET_URL=http://localhost:4000 (direct, bypasses Vite proxy)
// In prod: VITE_SOCKET_URL=https://bikersync-server-production.up.railway.app
const BASE = `${import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000'}/api`;

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
