// Manages rider GPS state per ride room with throttling and dead-reckoning gates

const rideRooms   = new Map(); // rideId -> Map(riderId -> riderState)
const riderSockets = new Map(); // `${rideId}:${riderId}` -> socketId  (for WebRTC signaling)

module.exports = (io, socket) => {
  socket.on('ride:join', ({ rideId, riderId, role, displayName }) => {
    socket.join(rideId);
    socket.data = { rideId, riderId, role, displayName };

    // Track socketId so we can deliver targeted WebRTC signals
    riderSockets.set(`${rideId}:${riderId}`, socket.id);

    if (!rideRooms.has(rideId)) rideRooms.set(rideId, new Map());

    rideRooms.get(rideId).set(riderId, {
      riderId, role, displayName,
      lat: null, lng: null,
      speed: 0, heading: 0,
      battery: null,
      lastSeen: Date.now(),
      online: true,
    });

    const snapshot = [...rideRooms.get(rideId).values()];
    socket.emit('ride:snapshot', snapshot);
    socket.to(rideId).emit('rider:joined', { riderId, role, displayName });

    console.log(`[Ride ${rideId}] ${displayName} (${role}) joined`);
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

    // Reject low-accuracy fixes to avoid map jitter
    if (accuracy > 30) return;

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
