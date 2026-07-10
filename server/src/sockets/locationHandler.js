// Manages rider GPS state per ride room with throttling and dead-reckoning gates

const mongoose = require('mongoose');
const Ride = require('../models/Ride');
const { setMember } = require('../services/rtdbAdmin');

// Skip Mongo lookups when the DB is down — mongoose buffers queries for 10 s
// before failing, which would stall every ride:join on a DB-less server.
const dbReady = () => mongoose.connection.readyState === 1;

const rideRooms   = new Map(); // rideId -> Map(riderId -> riderState)
const riderSockets = new Map(); // `${rideId}:${riderId}` -> socketId  (for WebRTC signaling)

module.exports = (io, socket) => {
  socket.on('ride:join', async ({ rideId, riderId: claimedId, role: claimedRole, displayName } = {}) => {
    if (typeof rideId !== 'string' || !rideId) return;

    // Verified Firebase uid wins; the client-claimed id is only honored for
    // legacy app versions in soft mode (socket.data.uid === null).
    const riderId = socket.data.uid ?? claimedId;
    if (typeof riderId !== 'string' || !riderId) return;

    const name = typeof displayName === 'string' && displayName.trim()
      ? displayName.trim().slice(0, 40)
      : 'Rider';

    // Server decides the role — 'lead' cannot simply be claimed.
    let role = claimedRole === 'sweep' ? 'sweep' : 'rider';
    const room = rideRooms.get(rideId);
    const existing = room?.get(riderId);
    if (existing) {
      role = existing.role; // rejoin keeps the in-room role (incl. transferred lead)
    } else {
      let ride = null;
      if (dbReady()) {
        try { ride = await Ride.findOne({ rideId }).lean(); } catch {}
      }
      if (ride?.leadRiderId === riderId) {
        role = 'lead';
      } else if (!ride && claimedRole === 'lead' && !(room?.size > 0)) {
        // Ride created offline (no Mongo doc): first joiner may claim lead
        role = 'lead';
      }
    }
    // Never allow a second lead in a room
    if (role === 'lead' && room &&
        [...room.values()].some((r) => r.role === 'lead' && r.riderId !== riderId)) {
      role = 'rider';
    }

    socket.join(rideId);
    socket.data = { ...socket.data, rideId, riderId, role, displayName: name };

    // Track socketId so we can deliver targeted WebRTC signals
    riderSockets.set(`${rideId}:${riderId}`, socket.id);

    if (!rideRooms.has(rideId)) rideRooms.set(rideId, new Map());

    rideRooms.get(rideId).set(riderId, {
      ...(existing ?? {}),
      riderId, role, displayName: name,
      lat: existing?.lat ?? null, lng: existing?.lng ?? null,
      speed: existing?.speed ?? 0, heading: existing?.heading ?? 0,
      battery: existing?.battery ?? null,
      lastSeen: Date.now(),
      online: true,
    });

    const snapshot = [...rideRooms.get(rideId).values()];
    socket.emit('ride:snapshot', snapshot);
    socket.to(rideId).emit('rider:joined', { riderId, role, displayName: name });

    console.log(`[Ride ${rideId}] ${name} (${role}) joined${socket.data.uid ? '' : ' [unverified]'}`);
  });

  // WebRTC signaling relay — delivers offer/answer/ICE to a specific rider.
  // `from` may be provided when a connected peer is relaying on behalf of an
  // offline peer (hotspot mode). Fall back to the socket's own riderId.
  socket.on('webrtc:signal', ({ to, from: fromOverride, signal }) => {
    const { rideId, riderId } = socket.data ?? {};
    if (!rideId || !riderId) return;
    const from = fromOverride ?? riderId;
    const targetSocketId = riderSockets.get(`${rideId}:${to}`);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc:signal', { from, signal });
    }
  });

  socket.on('location:update', ({ lat, lng, speed, heading, accuracy, battery }) => {
    const { rideId, riderId, role } = socket.data ?? {};
    if (!rideId || !riderId) return;

    const room = rideRooms.get(rideId);
    if (!room) return;

    // Reject low-accuracy fixes to avoid map jitter.
    // Must match GPSOptimizer.MAX_ACCURACY_M (40 m) — a stricter server limit
    // silently drops updates that passed the client filter, causing riders to
    // appear static on mobile data where GPS first-fixes are often 30–40 m.
    if (accuracy > 40) return;

    const prev = room.get(riderId);
    if (prev?.lat != null) {
      const dist = haversineMeters(prev.lat, prev.lng, lat, lng);
      if (dist < 5 && Math.abs((prev.speed ?? 0) - speed) < 2) return;
    }

    const update = {
      riderId, role,
      lat, lng, speed, heading, battery,
      timestamp: Date.now(),
    };

    room.set(riderId, { ...(prev ?? {}), ...update, lastSeen: Date.now(), online: true });
    socket.to(rideId).emit('rider:moved', update);
  });

  // Lead manually assigns another rider as the new lead
  socket.on('role:assign', ({ targetRiderId }) => {
    const { rideId, riderId, role } = socket.data ?? {};
    if (!rideId || role !== 'lead') return;

    const room = rideRooms.get(rideId);
    if (!room || !room.has(targetRiderId)) return;

    // Demote current lead → rider
    room.get(riderId).role = 'rider';
    socket.data.role = 'rider';

    // Promote target → lead
    room.get(targetRiderId).role = 'lead';

    // Best-effort persist so ride:join resolves the current lead after reconnects
    if (dbReady()) Ride.updateOne({ rideId }, { leadRiderId: targetRiderId }).catch(() => {});
    // Keep RTDB membership roles in sync (v2 rules let only the lead delete the ride node)
    setMember(rideId, riderId, 'rider');
    setMember(rideId, targetRiderId, 'lead');

    io.to(rideId).emit('role:changed', { riderId, role: 'rider' });
    io.to(rideId).emit('role:changed', { riderId: targetRiderId, role: 'lead' });
    console.log(`[Ride ${rideId}] Lead transferred: ${riderId} → ${targetRiderId}`);
  });

  // Lead shares the planned route with all riders in the room
  socket.on('route:share', (payload) => {
    const { rideId, role } = socket.data ?? {};
    if (!rideId || role !== 'lead') return;
    socket.to(rideId).emit('route:shared', payload);
    console.log(`[Ride ${rideId}] Route shared by lead`);
  });

  // Lead ending the ride for everyone
  socket.on('ride:end', () => {
    const { rideId, role } = socket.data ?? {};
    if (!rideId || role !== 'lead') return;
    io.to(rideId).emit('ride:ended');
    rideRooms.delete(rideId);
    if (dbReady()) Ride.updateOne({ rideId }, { status: 'ended', endedAt: new Date() }).catch(() => {});
    console.log(`[Ride ${rideId}] Ended by lead`);
  });

  socket.on('sos:resolve', () => {
    const { rideId } = socket.data ?? {};
    if (!rideId) return;
    io.to(rideId).emit('sos:resolved');
  });

  socket.on('sos:trigger', (payload) => {
    const { rideId, riderId, displayName } = socket.data ?? {};
    if (!rideId) return;
    // Broadcast to every rider in the room (including sender so their UI confirms)
    io.to(rideId).emit('sos:broadcast', {
      ...payload,
      riderId,
      displayName,
      timestamp: Date.now(),
    });
    console.log(`[SOS] ${displayName} in ride ${rideId}`);
  });

  socket.on('disconnect', () => {
    const { rideId, riderId, role, displayName } = socket.data ?? {};
    if (!rideId || !riderId) return;

    riderSockets.delete(`${rideId}:${riderId}`);

    const room = rideRooms.get(rideId);
    if (room?.has(riderId)) room.get(riderId).online = false;

    io.to(rideId).emit('rider:offline', { riderId, displayName });

    // If the departing rider was the lead, promote the first online rider
    if (role === 'lead' && room) {
      const nextLead = [...room.values()].find((r) => r.online && r.riderId !== riderId);
      if (nextLead) {
        nextLead.role = 'lead';
        if (dbReady()) Ride.updateOne({ rideId }, { leadRiderId: nextLead.riderId }).catch(() => {});
        setMember(rideId, nextLead.riderId, 'lead');
        io.to(rideId).emit('role:changed', { riderId: nextLead.riderId, role: 'lead' });
        console.log(`[Ride ${rideId}] Lead auto-assigned to ${nextLead.riderId} after ${riderId} disconnected`);
      }
    }

    // Clean up empty rooms after 5 minutes
    setTimeout(() => {
      const r = rideRooms.get(rideId);
      if (r && [...r.values()].every((v) => !v.online)) {
        rideRooms.delete(rideId);
        console.log(`[Ride ${rideId}] Room cleaned up`);
      }
    }, 5 * 60 * 1000);
  });
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
