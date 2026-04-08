const { randomUUID } = require('crypto');
const Ride = require('../models/Ride');

async function createRide(req, res) {
  try {
    const { name, leadRiderId, displayName } = req.body;
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

    res.json({ rideId: ride.rideId, name: ride.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function joinRide(req, res) {
  try {
    const { rideId } = req.params;
    const { riderId, displayName, role = 'rider' } = req.body;

    const ride = await Ride.findOne({ rideId });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status === 'ended') return res.status(410).json({ error: 'Ride has ended' });

    const alreadyIn = ride.riders.some((r) => r.riderId === riderId);
    if (!alreadyIn) {
      ride.riders.push({ riderId, displayName, role });
      await ride.save();
    }

    res.json({ rideId: ride.rideId, name: ride.name, riders: ride.riders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function endRide(req, res) {
  try {
    const { rideId } = req.params;
    const ride = await Ride.findOneAndUpdate(
      { rideId },
      { status: 'ended', endedAt: new Date() },
      { new: true }
    );
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json({ message: 'Ride ended', rideId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getRide(req, res) {
  try {
    const ride = await Ride.findOne({ rideId: req.params.rideId });
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json(ride);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createRide, joinRide, endRide, getRide };
