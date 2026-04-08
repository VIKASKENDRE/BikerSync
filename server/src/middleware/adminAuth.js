const admin = require('../services/firebaseAdmin');

// UIDs listed in ADMIN_UIDS env var (comma-separated) are granted admin access
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function adminAuth(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (!ADMIN_UIDS.includes(decoded.uid)) {
      return res.status(403).json({ error: 'Not an admin' });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Lightweight check — returns whether the token's UID is an admin
async function checkAdmin(uid) {
  return ADMIN_UIDS.includes(uid);
}

module.exports = { adminAuth, checkAdmin };
