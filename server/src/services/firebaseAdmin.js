const admin = require('firebase-admin');

// Only initialize when service-account credentials are present so local dev
// without them still boots; verifyIdToken calls will then throw and the auth
// middlewares treat the request as unauthenticated (soft mode) or reject it
// (AUTH_ENFORCE=true).
const configured = !!(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
);

if (!admin.apps.length && configured) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Railway stores the private key with literal \n — restore actual newlines
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    // Needed for admin.database() — RTDB membership writes (rtdbAdmin.js)
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
  });
}

if (!configured) {
  console.warn('[Firebase] Admin credentials missing — ID token verification disabled');
}

module.exports = admin;
