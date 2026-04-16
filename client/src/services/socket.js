import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

// Singleton socket instance
// path '/bs': Railway CDN (Fastly) intercepts the default '/socket.io' path
// and blocks HTTP polling — using a custom path bypasses that interception.
// polling first so Jio/carrier-proxied connections work; Socket.io upgrades
// to WebSocket automatically once the session is established.
export const socket = io(SOCKET_URL, {
  path: '/bs',
  transports: ['polling', 'websocket'],
  upgrade: true,
  autoConnect: false, // connect only when joining a ride
});

socket.on('connect_error', (err) => {
  console.error('[Socket] Connection error:', err.message);
});
