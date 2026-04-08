// Thin wrapper — just exposes the singleton socket for emitting.
// All incoming event listeners live in SocketManager (mounted once in App).
import { socket } from '../services/socket';

export function useSocket() {
  return { socket };
}
