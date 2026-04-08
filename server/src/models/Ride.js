const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema(
  {
    rideId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    leadRiderId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'active', 'ended'], default: 'pending' },
    riders: [
      {
        riderId: String,
        displayName: String,
        role: { type: String, enum: ['lead', 'sweep', 'rider'], default: 'rider' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    startedAt: Date,
    endedAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Ride', rideSchema);
