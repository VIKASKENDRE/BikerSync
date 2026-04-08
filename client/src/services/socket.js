import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

// Singleton socket instance
export const socket = io(SOCKET_URL, {
  transports: ['websocket'],
  autoConnect: false, // connect only when joining a ride
});

socket.on('connect_error', (err) => {
  console.error('[Socket] Connection error:', err.message);
});
