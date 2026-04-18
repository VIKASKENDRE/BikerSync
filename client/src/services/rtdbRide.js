/**
 * rtdbRide.js — Firebase Realtime Database transport layer.
 *
 * Data layout:
 *   /rides/{rideId}/riders/{riderId}         — current GPS + presence
 *   /rides/{rideId}/signals/{toId}/{pushId}  — WebRTC signaling queue
 *   /rides/{rideId}/status                   — 'active' | 'ended'
 */

import { rtdb } from './firebase';
import {
  ref, set, get, onChildAdded, onChildChanged, push, remove, onDisconnect,
} from 'firebase/database';

// ── GPS ───────────────────────────────────────────────────────────────────────

export function publishGPS(rideId, riderId, displayName, role, update) {
  if (!rtdb) return Promise.resolve();
  return set(ref(rtdb, `rides/${rideId}/riders/${riderId}`), {
    riderId,
    displayName,
    role,
    ...update,
    online: true,
    ts: Date.now(),
  });
}

export function setOffline(rideId, riderId) {
  if (!rtdb) return Promise.resolve();
  return set(ref(rtdb, `rides/${rideId}/riders/${riderId}/online`), false)
    .catch(() => {});
}

export function registerPresence(rideId, riderId) {
  if (!rtdb) return Promise.resolve();
  return onDisconnect(ref(rtdb, `rides/${rideId}/riders/${riderId}/online`))
    .set(false);
}

export function subscribeRidersGPS(rideId, callback) {
  if (!rtdb) return () => {};
  const ridersRef = ref(rtdb, `rides/${rideId}/riders`);
  const off1 = onChildAdded(  ridersRef, (snap) => snap.val() && callback(snap.key, snap.val()));
  const off2 = onChildChanged(ridersRef, (snap) => snap.val() && callback(snap.key, snap.val()));
  return () => { off1(); off2(); };
}

// ── WebRTC signaling ──────────────────────────────────────────────────────────

export function publishSignal(rideId, targetRiderId, fromRiderId, signal) {
  if (!rtdb) return Promise.resolve();
  return push(ref(rtdb, `rides/${rideId}/signals/${targetRiderId}`), {
    from: fromRiderId,
    signal,
    ts: Date.now(),
  });
}

export function subscribeSignals(rideId, myRiderId, callback) {
  if (!rtdb) return () => {};
  const startedAt = Date.now();
  return onChildAdded(
    ref(rtdb, `rides/${rideId}/signals/${myRiderId}`),
    (snap) => {
      const val = snap.val();
      if (!val) return;
      if (val.ts < startedAt - 10000) { remove(snap.ref).catch(() => {}); return; }
      callback(val.from, val.signal);
      remove(snap.ref).catch(() => {});
    },
  );
}

// ── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Publish a chat message to RTDB. Used as fallback when socket is offline.
 * Messages are kept for 5 minutes max (cleaned up by TTL on subscribe).
 */
export function publishChat(rideId, message) {
  if (!rtdb) return Promise.resolve();
  return push(ref(rtdb, `rides/${rideId}/chat`), {
    ...message,
    ts: Date.now(),
  });
}

export function subscribeChat(rideId, myRiderId, callback) {
  if (!rtdb) return () => {};
  const startedAt = Date.now();
  return onChildAdded(
    ref(rtdb, `rides/${rideId}/chat`),
    (snap) => {
      const val = snap.val();
      if (!val) return;
      if (val.ts < startedAt - 300_000) { remove(snap.ref).catch(() => {}); return; }
      // Don't echo our own messages back — we already added them locally
      if (val.senderId === myRiderId) return;
      callback(val);
    },
  );
}

// ── SOS ───────────────────────────────────────────────────────────────────────

export function publishSOS(rideId, payload) {
  if (!rtdb) return Promise.resolve();
  return push(ref(rtdb, `rides/${rideId}/sos`), {
    ...payload,
    ts: Date.now(),
  });
}

export function subscribeSOS(rideId, myRiderId, callback) {
  if (!rtdb) return () => {};
  const startedAt = Date.now();
  return onChildAdded(
    ref(rtdb, `rides/${rideId}/sos`),
    (snap) => {
      const val = snap.val();
      if (!val) return;
      if (val.ts < startedAt - 300_000) { remove(snap.ref).catch(() => {}); return; }
      if (val.riderId === myRiderId) return; // don't echo self
      callback(val);
    },
  );
}

// ── Ride lifecycle ────────────────────────────────────────────────────────────

/** LEAD ending the ride — removes all RTDB data for this ride. */
export function deleteRide(rideId) {
  if (!rtdb) return Promise.resolve();
  return remove(ref(rtdb, `rides/${rideId}`));
}

/**
 * Called when a rider leaves. If no riders remain online, cleans up
 * the ride node so stale data doesn't persist.
 */
export async function cleanupRideIfEmpty(rideId) {
  if (!rtdb) return;
  try {
    const snap = await get(ref(rtdb, `rides/${rideId}/riders`));
    if (!snap.exists()) {
      await remove(ref(rtdb, `rides/${rideId}`));
      return;
    }
    const anyOnline = Object.values(snap.val()).some((r) => r.online !== false);
    if (!anyOnline) await remove(ref(rtdb, `rides/${rideId}`));
  } catch {}
}
