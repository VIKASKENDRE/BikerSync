module.exports = (io, socket) => {
  socket.on('chat:send', ({ text, displayName, role }) => {
    const { rideId, riderId } = socket.data ?? {};
    if (!rideId || !text?.trim()) return;

    const message = {
      id: `${riderId}-${Date.now()}`,
      riderId,
      displayName,
      role,
      text: text.trim().slice(0, 300), // cap message length
      timestamp: Date.now(),
    };

    // Broadcast to all in room including sender
    io.to(rideId).emit('chat:message', message);
  });
};
