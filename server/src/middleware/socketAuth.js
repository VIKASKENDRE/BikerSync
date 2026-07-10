const admin = require('../services/firebaseAdmin');

const ENFORCE = process.env.AUTH_ENFORCE === 'true';

/**
 * Socket.io handshake auth — verifies the Firebase ID token sent by the
 * client's `auth` callback and stores the verified uid on socket.data.uid.
 *
 * Soft mode (AUTH_ENFORCE unset/false): legacy app versions that send no
 * token are still allowed but get socket.data.uid = null, so handlers fall
 * back to the client-claimed riderId. Flip AUTH_ENFORCE=true on Railway once
 * the authenticated client build has rolled out.
 */
module.exports = async function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;

  if (token) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      socket.data.uid = decoded.uid;
      return next();
    } catch (err) {
      if (ENFORCE) return next(new Error('unauthorized'));
      console.warn(`[Auth] Socket token rejected (soft mode): ${err.code ?? err.message}`);
    }
  } else if (ENFORCE) {
    return next(new Error('unauthorized'));
  }

  socket.data.uid = null; // unauthenticated legacy client
  next();
};
