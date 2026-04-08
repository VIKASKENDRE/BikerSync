const mongoose = require('mongoose');

const sosEventSchema = new mongoose.Schema(
  {
    rideId: { type: String, required: true },
    riderId: { type: String, required: true },
    displayName: String,
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    battery: Number,
    resolvedAt: Date,
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SOSEvent', sosEventSchema);
