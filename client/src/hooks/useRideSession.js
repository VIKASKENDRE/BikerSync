import { useEffect, useRef, useState } from 'react';
import { useRideContext } from '../context/RideContext';
import { socket } from '../services/socket';
import { webrtcMesh } from '../services/webrtcMesh';
import { wifiDirectMesh } from '../services/wifiDirectMesh';
import { GPSOptimizer } from '../services/gpsOptimizer';

export function useRideSession() {
  const { state, dispatch } = useRideContext();
  const gpsRef = useRef(null);
  const [p2pPeers,      setP2pPeers]      = useState(0); // open WebRTC DataChannels
  const [p2pConnecting, setP2pConnecting] = useState(0); // WebRTC peers in handshake
  const [wdPeers,       setWdPeers]       = useState(0); // WiFi Direct TCP peers

  // ── Initialise WebRTC mesh when ride session starts ───────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;

    webrtcMesh.init(state.rideId, state.selfRider.riderId);

    // Incoming P2P GPS — only apply when server socket is offline
    webrtcMesh.onGPS = (riderId, update) => {
      if (!socket.connected) {
        dispatch({ type: 'RIDER_MOVED', update: { riderId, ...update } });
      }
    };

    webrtcMesh.onPeerChange = () => {
      setP2pPeers(webrtcMesh.activePeerCount);
      setP2pConnecting(webrtcMesh.connectingPeerCount);
    };

    webrtcMesh.onChat = (message) => dispatch({ type: 'CHAT_MESSAGE', message });
    webrtcMesh.onSOS  = (payload) => dispatch({ type: 'SOS_RECEIVED', payload });

    socket.on('route:shared', (route) => dispatch({ type: 'SET_SHARED_ROUTE', route }));
    socket.on('role:changed', ({ riderId, role }) => dispatch({ type: 'ROLE_CHANGED', riderId, role }));

    if (state.riders.length > 0) webrtcMesh.onSnapshot(state.riders);

    return () => {
      socket.off('route:shared');
      socket.off('role:changed');
      webrtcMesh.destroy();
    };
  }, [state.rideId, state.selfRider?.riderId]);

  // ── Initialise WiFi Direct mesh (APK only — no-op in browser) ────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    if (!wifiDirectMesh.isAvailable) return;

    const { riderId, role } = state.selfRider;

    // Incoming WiFi Direct GPS — only when both socket and WebRTC are down
    wifiDirectMesh.onGPS = (fromRiderId, update) => {
      if (!socket.connected && webrtcMesh.activePeerCount === 0) {
        dispatch({ type: 'RIDER_MOVED', update: { riderId: fromRiderId, ...update } });
      }
    };

    wifiDirectMesh.onChat    = (message) => dispatch({ type: 'CHAT_MESSAGE', message });
    wifiDirectMesh.onSOS     = (payload) => dispatch({ type: 'SOS_RECEIVED', payload });
    wifiDirectMesh.onPeerChange = () => setWdPeers(wifiDirectMesh.peerCount);

    if (role === 'LEAD') {
      // Ride lead becomes the Group Owner — the TCP relay hub
      wifiDirectMesh.createGroup(riderId).catch(console.warn);
    } else {
      // All other riders scan and auto-connect to the first nearby device
      wifiDirectMesh.startDiscovery(riderId).catch(console.warn);
    }

    return () => { wifiDirectMesh.destroy(); };
  }, [state.rideId, state.selfRider?.riderId]);

  // ── GPS broadcasting with automatic transport fallback ────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;

    gpsRef.current = new GPSOptimizer((update) => {
      if (socket.connected) {
        // Tier 1: server relays to all riders
        socket.emit('location:update', update);
      } else if (webrtcMesh.activePeerCount > 0) {
        // Tier 2: WebRTC DataChannel mesh (hotspot mode)
        webrtcMesh.broadcastGPS(update);
      } else {
        // Tier 3: WiFi Direct TCP mesh (fully offline, APK only)
        wifiDirectMesh.broadcastGPS(update);
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
    sharedRoute: state.sharedRoute,
    trails:      state.trails,
    p2pPeers,
    p2pConnecting,
    wdPeers,
    dispatch,
  };
}
