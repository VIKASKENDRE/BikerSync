const admin    = require('../services/firebaseAdmin');
const Ride     = require('../models/Ride');
const SOSEvent = require('../models/SOSEvent');
const ApiUsage = require('../models/ApiUsage');
const { checkAdmin } = require('../middleware/adminAuth');

// GET /api/admin/me — verify token and return admin status
async function getMe(req, res) {
  res.json({ uid: req.adminUid, admin: true });
}

// GET /api/admin/stats
async function getStats(req, res) {
  try {
    const [totalRides, activeRides, totalSOS] = await Promise.all([
      Ride.countDocuments(),
      Ride.countDocuments({ status: 'active' }),
      SOSEvent.countDocuments(),
    ]);

    // Firebase user count (capped at 1000 for free tier)
    const listResult = await admin.auth().listUsers(1000);
    const totalUsers = listResult.users.length;

    res.json({ totalRides, activeRides, totalUsers, totalSOS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/admin/rides
async function getRides(req, res) {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 }).limit(200);
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/admin/rides/:rideId
async function deleteRide(req, res) {
  try {
    const { rideId } = req.params;
    await Promise.all([
      Ride.deleteOne({ rideId }),
      SOSEvent.deleteMany({ rideId }),
    ]);
    res.json({ message: `Ride ${rideId} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/admin/users
async function getUsers(req, res) {
  try {
    const listResult = await admin.auth().listUsers(1000);
    const users = listResult.users.map((u) => ({
      uid:         u.uid,
      displayName: u.displayName ?? '—',
      email:       u.email ?? '—',
      provider:    u.providerData?.[0]?.providerId ?? 'unknown',
      createdAt:   u.metadata.creationTime,
      lastSignIn:  u.metadata.lastSignInTime,
    }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/admin/users/:uid
async function deleteUser(req, res) {
  try {
    const { uid } = req.params;
    if (uid === req.adminUid) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await admin.auth().deleteUser(uid);
    // Remove from any rides they were in
    await Ride.updateMany({}, { $pull: { riders: { riderId: uid } } });
    res.json({ message: `User ${uid} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/admin/reset  — wipe all rides and SOS events
async function resetData(req, res) {
  try {
    const { target } = req.body; // 'rides' | 'sos' | 'all'
    if (target === 'rides' || target === 'all') await Ride.deleteMany();
    if (target === 'sos'   || target === 'all') await SOSEvent.deleteMany();
    res.json({ message: `Reset complete: ${target}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/admin/api-usage  — last 6 months of Maps API usage
async function getApiUsage(req, res) {
  try {
    const records = await ApiUsage.find().sort({ month: -1 }).limit(6);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/admin/api-usage/reset-fallback  — manually clear fallback mode
async function resetFallback(req, res) {
  try {
    const { month } = req.body;
    await ApiUsage.updateOne({ month }, { fallbackMode: false });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getMe, getStats, getRides, deleteRide, getUsers, deleteUser, resetData, getApiUsage, resetFallback };
