const { randomUUID } = require('crypto');
const Ride = require('../models/Ride');
const { setMember } = require('../services/rtdbAdmin');

// req.user is set by softAuth/firebaseAuth when a valid Firebase ID token is
// sent. The verified uid always overrides client-supplied rider ids; the
// body fallbacks only serve legacy app versions until AUTH_ENFORCE=true.

async function createRide(req, res) {
  try {
    const { name, displayName } = req.body;
    const leadRiderId = req.user?.uid ?? req.body.leadRiderId;
    if (!name || !leadRiderId) return res.status(400).json({ error: 'name and leadRiderId required' });

    const rideId = randomUUID().slice(0, 8).toUpperCase();

    const ride = await Ride.create({
      rideId,
      name,
      leadRiderId,
      status: 'active',
      startedAt: new Date(),
      riders: [{ riderId: leadRiderId, displayName, role: 'lead' }],
    });

    // RTDB membership gates client access under the strict v2 rules
    setMember(rideId, leadRiderId, 'lead');

    res.json({ rideId: ride.rideId, name: ride.name });
  } catch (err) {
    console.error('[Rides] create failed:', err.message);
    res.status(500).json({ error: 'Could not create ride' });
  }
}

async function joinRide(req, res) {
  try {
    const { rideId } = req.params;
    const { displayName } = req.body;
    const riderId = req.user?.uid ?? req.body.riderId;
    if (!riderId) return res.status(400).json({ error: 'riderId required' });
    // 'lead' cannot be claimed by joining — only createRide assigns it
    const role = req.body.role === 'sweep' ? 'sweep' : 'rider';

    const ride = await Ride.findOne({ rideId });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status === 'ended') return res.status(410).json({ error: 'Ride has ended' });

    const alreadyIn = ride.riders.some((r) => r.riderId === riderId);
    if (!alreadyIn) {
      ride.riders.push({ riderId, displayName, role });
      await ride.save();
    }
    setMember(rideId, riderId, role);

    res.json({ rideId: ride.rideId, name: ride.name, riders: ride.riders });
  } catch (err) {
    console.error('[Rides] join failed:', err.message);
    res.status(500).json({ error: 'Could not join ride' });
  }
}

async function endRide(req, res) {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findOne({ rideId });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.leadRiderId !== req.user.uid) {
      return res.status(403).json({ error: 'Only the ride lead can end the ride' });
    }

    ride.status = 'ended';
    ride.endedAt = new Date();
    await ride.save();
    res.json({ message: 'Ride ended', rideId });
  } catch (err) {
    console.error('[Rides] end failed:', err.message);
    res.status(500).json({ error: 'Could not end ride' });
  }
}

async function getRide(req, res) {
  try {
    const ride = await Ride.findOne({ rideId: req.params.rideId });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // Authenticated callers must be members to see the rider list
    if (req.user) {
      const uid = req.user.uid;
      const isMember = ride.leadRiderId === uid || ride.riders.some((r) => r.riderId === uid);
      if (!isMember) return res.status(403).json({ error: 'Not a member of this ride' });
    }

    res.json(ride);
  } catch (err) {
    console.error('[Rides] get failed:', err.message);
    res.status(500).json({ error: 'Could not fetch ride' });
  }
}

module.exports = { createRide, joinRide, endRide, getRide };
