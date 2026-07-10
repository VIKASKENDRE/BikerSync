const admin = require('./firebaseAdmin');

// Server-side RTDB writes via the Admin SDK (bypasses security rules).
// Membership entries under /rides/$rideId/members/$uid gate all client
// access once the strict v2 rules are deployed. No-ops when the Admin SDK
// or FIREBASE_DATABASE_URL isn't configured (local dev).

const ready = () => !!(admin.apps.length && process.env.FIREBASE_DATABASE_URL);

/** role: 'lead' | 'rider' | 'sweep' — best-effort, never throws. */
function setMember(rideId, uid, role) {
  if (!ready() || !rideId || !uid) return;
  try {
    admin.database().ref(`rides/${rideId}/members/${uid}`).set(role).catch(() => {});
  } catch {}
}

module.exports = { setMember };
