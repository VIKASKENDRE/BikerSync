const admin = require('../services/firebaseAdmin');

const ENFORCE = process.env.AUTH_ENFORCE === 'true';

/**
 * Verifies the Firebase ID token when one is sent; sets req.user.
 * Requests without a token are only rejected once AUTH_ENFORCE=true
 * (i.e. after legacy app versions are off the old build). Controllers must
 * prefer req.user.uid over any client-supplied riderId when it is present.
 */
module.exports = async function softAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      req.user = await admin.auth().verifyIdToken(token);
      return next();
    } catch {
      if (ENFORCE) return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else if (ENFORCE) {
    return res.status(401).json({ error: 'No token' });
  }

  next();
};
