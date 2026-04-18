import { useEffect, useRef, useState } from 'react';
import { useRideContext } from '../context/RideContext';
import { socket } from '../services/socket';
import { webrtcMesh } from '../services/webrtcMesh';
import { wifiDirectMesh } from '../services/wifiDirectMesh';
import { GPSOptimizer } from '../services/gpsOptimizer';
import {
  publishGPS, setOffline, registerPresence,
  subscribeRidersGPS, subscribeSignals, publishSignal,
  subscribeChat, subscribeSOS,
  cleanupRideIfEmpty,
} from '../services/rtdbRide';

export function useRideSession() {
  const { state, dispatch } = useRideContext();
  const gpsRef = useRef(null);
  const [p2pPeers,      setP2pPeers]      = useState(0);
  const [p2pConnecting, setP2pConnecting] = useState(0);
  const [wdPeers,       setWdPeers]       = useState(0);
  const leadOnlineRef = useRef(true); // tracks previous lead-online state for auto-promote

  // ── Firebase RTDB: GPS receive + WebRTC signaling ─────────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    const { rideId } = state;
    const { riderId } = state.selfRider;

    registerPresence(rideId, riderId).catch(() => {});

    const unsubGPS = subscribeRidersGPS(rideId, (fromRiderId, data) => {
      if (fromRiderId === riderId) return;
      dispatch({ type: 'RIDER_MOVED', update: { riderId: fromRiderId, ...data } });
      dispatch({ type: 'RIDER_UPSERT', rider: {
        riderId:     fromRiderId,
        displayName: data.displayName ?? fromRiderId,
        role:        data.role ?? 'rider',
        online:      data.online !== false,
      }});
    });

    const unsubSig = subscribeSignals(rideId, riderId, (from, signal) => {
      webrtcMesh.handleSignal(from, signal);
    });

    const unsubChat = subscribeChat(rideId, riderId, (message) => {
      dispatch({ type: 'CHAT_MESSAGE', message });
    });

    const unsubSOS = subscribeSOS(rideId, riderId, (payload) => {
      dispatch({ type: 'SOS_RECEIVED', payload });
    });

    return () => {
      setOffline(rideId, riderId);
      unsubGPS();
      unsubSig();
      unsubChat();
      unsubSOS();
      // Clean up RTDB ride data after a short delay if no riders remain
      setTimeout(() => cleanupRideIfEmpty(rideId), 4000);
    };
  }, [state.rideId, state.selfRider?.riderId]);

  // ── Auto-promote: if lead goes offline, next rider (by stable sort) becomes lead ──
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    const { riderId, role } = state.selfRider;

    // Already lead — reset tracker
    if (role === 'lead') { leadOnlineRef.current = true; return; }

    const leadRider = state.riders.find((r) => r.role === 'lead' && r.riderId !== riderId);
    const leadOnline = !leadRider || leadRider.online !== false;

    if (!leadOnline && leadOnlineRef.current) {
      // Lead just went offline — promote self if we're first in stable sort
      const candidates = state.riders.filter(
        (r) => r.online !== false && r.role !== 'lead',
      );
      const sorted = [...candidates].sort((a, b) => a.riderId.localeCompare(b.riderId));
      if (sorted[0]?.riderId === riderId) {
        dispatch({ type: 'ROLE_CHANGED', riderId, role: 'lead' });
        publishGPS(state.rideId, riderId, state.selfRider.displayName, 'lead', {
          lat: state.selfRider.lat ?? 0,
          lng: state.selfRider.lng ?? 0,
        }).catch(() => {});
      }
    }

    leadOnlineRef.current = leadOnline;
  }, [state.riders, state.selfRider?.role]);

  // ── Socket room membership ─────────────────────────────────────────────────
  // The server gates ALL events (chat, SOS, voice, WebRTC signals) on
  // socket.data.rideId which is only set after ride:join. Emit it immediately
  // and re-emit on every reconnect so the server side is always in sync.
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    const { rideId } = state;
    const { riderId, displayName, role } = state.selfRider;

    const join = () => socket.emit('ride:join', { rideId, riderId, role, displayName });
    if (socket.connected) join();
    socket.on('connect', join);
    return () => socket.off('connect', join);
  }, [state.rideId, state.selfRider?.riderId, state.selfRider?.role]);

  // ── WebRTC mesh ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;

    webrtcMesh.init(state.rideId, state.selfRider.riderId);

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

    webrtcMesh.fallbackSignal = (toRiderId, signal) => {
      publishSignal(state.rideId, toRiderId, state.selfRider.riderId, signal)
        .catch(() => { wifiDirectMesh.broadcastSignal(toRiderId, state.selfRider.riderId, signal); });
    };

    socket.on('route:shared', (route) => dispatch({ type: 'SET_SHARED_ROUTE', route }));
    socket.on('role:changed', ({ riderId, role }) => dispatch({ type: 'ROLE_CHANGED', riderId, role }));

    if (state.riders.length > 0) webrtcMesh.onSnapshot(state.riders);

    return () => {
      socket.off('route:shared');
      socket.off('role:changed');
      webrtcMesh.destroy();
    };
  }, [state.rideId, state.selfRider?.riderId]);

  // ── WiFi Direct mesh ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    if (!wifiDirectMesh.isAvailable) return;

    const { riderId, role } = state.selfRider;
    const rideId = state.rideId;

    wifiDirectMesh.onGPS = (fromRiderId, update) => {
      if (!socket.connected && webrtcMesh.activePeerCount === 0) {
        dispatch({ type: 'RIDER_MOVED', update: { riderId: fromRiderId, ...update } });
      }
    };
    wifiDirectMesh.onChat    = (message) => dispatch({ type: 'CHAT_MESSAGE', message });
    wifiDirectMesh.onSOS     = (payload) => dispatch({ type: 'SOS_RECEIVED', payload });
    wifiDirectMesh.onPeerChange = () => setWdPeers(wifiDirectMesh.peerCount);

    if (role === 'lead') {
      wifiDirectMesh.createGroup(riderId, rideId).catch(console.warn);
    } else {
      wifiDirectMesh.startDiscovery(riderId, rideId).catch(console.warn);
      wifiDirectMesh.suggestNetworkForRide(rideId).catch(console.warn);
    }

    let onConnect, onDisconnect;
    if (role !== 'lead') {
      onConnect    = () => wifiDirectMesh.removeSuggestion().catch(console.warn);
      onDisconnect = () => wifiDirectMesh.suggestNetworkForRide(rideId).catch(console.warn);
      socket.on('connect',    onConnect);
      socket.on('disconnect', onDisconnect);
    }

    return () => {
      if (onConnect)    socket.off('connect',    onConnect);
      if (onDisconnect) socket.off('disconnect', onDisconnect);
      wifiDirectMesh.destroy();
    };
  }, [state.rideId, state.selfRider?.riderId]);

  // ── GPS broadcasting ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.rideId || !state.selfRider) return;
    const { rideId } = state;
    const { riderId, displayName, role } = state.selfRider;

    gpsRef.current = new GPSOptimizer((update) => {
      publishGPS(rideId, riderId, displayName, role, update).catch(() => {});

      if (socket.connected) {
        socket.emit('location:update', update);
      } else if (webrtcMesh.activePeerCount > 0) {
        webrtcMesh.broadcastGPS(update);
      } else if (wifiDirectMesh.isAvailable) {
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
