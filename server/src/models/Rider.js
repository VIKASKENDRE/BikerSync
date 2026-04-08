const mongoose = require('mongoose');

const riderSchema = new mongoose.Schema(
  {
    riderId: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    phone: String,
    emergencyContacts: [
      {
        name: String,
        phone: String,
      },
    ],
    preferredRole: { type: String, enum: ['lead', 'sweep', 'rider'], default: 'rider' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Rider', riderSchema);
