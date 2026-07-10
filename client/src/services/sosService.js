/**
 * sosService.js — shared SOS broadcast pipeline.
 * Used by the manual SOS button and the crash-detection auto-SOS.
 */
import { socket } from './socket';
import { webrtcMesh } from './webrtcMesh';
import { wifiDirectMesh } from './wifiDirectMesh';
import { publishSOS } from './rtdbRide';
import { api } from './api';

/** Fresh GPS fix, falling back to the last known selfRider position. */
export function getCurrentPosition(selfRider) {
  return new Promise((resolve) => {
    const fallback = selfRider?.lat != null
      ? { lat: selfRider.lat, lng: selfRider.lng }
      : null;
    if (!navigator.geolocation) return resolve(fallback);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(fallback),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 },
    );
  });
}

/**
 * Broadcast an SOS on every available transport (RTDB + socket/REST,
 * falling back to WebRTC / WiFi Direct mesh when offline).
 * Returns true if a position was available and the SOS went out.
 */
export async function sendSOS(state, dispatch, { auto = false } = {}) {
  const coords = await getCurrentPosition(state.selfRider);
  if (!coords || !state.rideId) return false;

  const payload = {
    rideId:      state.rideId,
    riderId:     state.selfRider?.riderId,
    displayName: state.selfRider?.displayName,
    lat:         coords.lat,
    lng:         coords.lng,
    battery:     state.selfRider?.battery ?? null,
    auto, // true when fired by crash detection
    timestamp:   Date.now(),
  };

  publishSOS(state.rideId, payload).catch(() => {});

  if (socket.connected) {
    socket.emit('sos:trigger', payload);
    try { await api.triggerSOS(payload); } catch {}
  } else if (webrtcMesh.activePeerCount > 0) {
    webrtcMesh.broadcastSOS(payload);
  } else if (wifiDirectMesh.peerCount > 0) {
    wifiDirectMesh.broadcastSOS(payload);
  }

  dispatch({ type: 'SOS_RECEIVED', payload });
  return true;
}
