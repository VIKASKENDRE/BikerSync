import { io } from 'socket.io-client';
import { getIdToken } from './firebase';

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

// Singleton socket instance
// WebSocket-first: Railway/Fastly CDN buffers long-polling GET responses, which
// breaks PTT (5 chunks/sec) even though infrequent events (GPS, chat) work fine.
// WSS on port 443 bypasses CDN buffering and works on all Indian carriers (Jio/Airtel).
// Polling is kept as last-resort fallback for restricted networks.
export const socket = io(SOCKET_URL, {
  path: '/bs',
  transports: ['websocket', 'polling'],
  autoConnect: false, // connect only when joining a ride
  // Called on every (re)connection attempt — Firebase ID tokens expire after
  // 1 h, so this keeps reconnects authenticated with a fresh token.
  auth: (cb) => {
    getIdToken()
      .then((token) => cb(token ? { token } : {}))
      .catch(() => cb({}));
  },
});

socket.on('connect_error', (err) => {
  console.error('[Socket] Connection error:', err.message);
});
