import { useEffect, useRef, useState } from 'react';
import { useRideContext } from '../context/RideContext';
import { socket } from '../services/socket';
import { webrtcMesh } from '../services/webrtcMesh';
import { GPSOptimizer } from '../services/gpsOptimizer';

export function useRideSession() {
  const { state, dispatch } = useRideContext();
  const gpsRef = useRef(null);
  const [p2pPeers,      setP2pPeers]      = useState(0); // open DataChannels
  const [p2pConnecting, setP2pConnecting] = useState(0); // peers in handshake

  // ── Initialise WebRTC mesh when ride session starts ───────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;

    webrtcMesh.init(state.rideId, state.selfRider.riderId);

    // Incoming P2P GPS — only apply when server socket is offline to avoid
    // double-dispatching the same position when both channels are active
    webrtcMesh.onGPS = (riderId, update) => {
      if (!socket.connected) {
        dispatch({ type: 'RIDER_MOVED', update: { riderId, ...update } });
      }
    };

    webrtcMesh.onPeerChange = () => {
      setP2pPeers(webrtcMesh.activePeerCount);
      setP2pConnecting(webrtcMesh.connectingPeerCount);
    };

    // P2P chat and SOS — dispatch directly into context when server is offline
    webrtcMesh.onChat = (message) => dispatch({ type: 'CHAT_MESSAGE', message });
    webrtcMesh.onSOS  = (payload) => dispatch({ type: 'SOS_RECEIVED', payload });

    // ride:snapshot may have arrived before init() ran (React effect ordering).
    // Re-run connection attempts for any riders already in state.
    if (state.riders.length > 0) webrtcMesh.onSnapshot(state.riders);

    return () => webrtcMesh.destroy();
  }, [state.rideId, state.selfRider?.riderId]);

  // ── GPS broadcasting with automatic fallback ─────────────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;

    gpsRef.current = new GPSOptimizer((update) => {
      if (socket.connected) {
        // Normal path: server relays position to all riders
        socket.emit('location:update', update);
      } else {
        // Fallback: broadcast directly to peers via WebRTC DataChannels
        webrtcMesh.broadcastGPS(update);
      }
      dispatch({ type: 'SELF_MOVED', update });
    });

    gpsRef.current.start();
    return () => gpsRef.current?.stop();
  }, [state.rideId, state.selfRider?.riderId]);

  return {
    riders:      state.riders,
    selfRider:   state.selfRider,
    messages:    state.messages,
    unreadCount: state.unreadCount,
    rideId:      state.rideId,
    p2pPeers,        // > 0 means at least one DataChannel is open
    p2pConnecting,   // > 0 means WebRTC handshake in progress
    dispatch,
  };
}
