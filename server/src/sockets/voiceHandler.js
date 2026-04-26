// Relays PTT audio chunks to all other riders in the room
module.exports = (io, socket) => {
  socket.on('voice:start', ({ mimeType } = {}) => {
    const { rideId, riderId, displayName } = socket.data ?? {};
    if (!rideId) {
      console.warn(`[Voice] voice:start dropped — socket.data not set (${socket.id})`);
      return;
    }
    console.log(`[Voice] ${displayName} started PTT in ride ${rideId} (${mimeType})`);
    // Open channel for the whole group (sender included) so all UIs update
    io.to(rideId).emit('voice:channel:open');
    socket.to(rideId).emit('voice:incoming', { riderId, displayName, mimeType });
  });

  socket.on('voice:chunk', (chunk) => {
    const { rideId, riderId } = socket.data ?? {};
    if (!rideId) return; // silent — fires many times per transmission
    socket.to(rideId).emit('voice:chunk', { riderId, chunk });
  });

  socket.on('voice:end', () => {
    const { rideId, riderId } = socket.data ?? {};
    if (!rideId) {
      console.warn(`[Voice] voice:end dropped — socket.data not set (${socket.id})`);
      return;
    }
    console.log(`[Voice] ${riderId} ended PTT in ride ${rideId}`);
    socket.to(rideId).emit('voice:ended', { riderId });
  });
};
