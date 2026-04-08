const SOSEvent = require('../models/SOSEvent');

async function triggerSOS(req, res) {
  try {
    const { rideId, riderId, displayName, lat, lng, battery } = req.body;
    if (!rideId || !riderId || lat == null || lng == null) {
      return res.status(400).json({ error: 'rideId, riderId, lat, lng required' });
    }

    const event = await SOSEvent.create({ rideId, riderId, displayName, lat, lng, battery });

    // Twilio SMS alert (optional - only runs if credentials are set)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio')(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
        const body = `🚨 BikerSync SOS from ${displayName}! Location: ${mapsLink} Battery: ${battery ?? 'unknown'}%`;

        const Rider = require('../models/Rider');
        const rider = await Rider.findOne({ riderId });
        const contacts = rider?.emergencyContacts ?? [];

        await Promise.allSettled(
          contacts.map((c) =>
            twilio.messages.create({ body, from: process.env.TWILIO_FROM_NUMBER, to: c.phone })
          )
        );
      } catch (smsErr) {
        console.warn('[SOS] SMS failed:', smsErr.message);
      }
    }

    res.json({ sosId: event._id, message: 'SOS logged' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function resolveSOS(req, res) {
  try {
    const event = await SOSEvent.findByIdAndUpdate(
      req.params.sosId,
      { resolved: true, resolvedAt: new Date() },
      { new: true }
    );
    if (!event) return res.status(404).json({ error: 'SOS event not found' });
    res.json({ message: 'SOS resolved', sosId: event._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { triggerSOS, resolveSOS };
