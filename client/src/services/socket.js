import { io } from 'socket.io-client';

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
});

socket.on('connect_error', (err) => {
  console.error('[Socket] Connection error:', err.message);
});
