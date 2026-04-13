const mongoose = require('mongoose');

// Tracks Google Maps API call counts and estimated costs per calendar month.
// When estimatedCost >= MONTHLY_CAP the proxy switches to free fallbacks.
const ApiUsageSchema = new mongoose.Schema({
  month:         { type: String, required: true, unique: true }, // "2026-04"
  autocomplete:  { type: Number, default: 0 },  // Places Autocomplete requests
  details:       { type: Number, default: 0 },  // Places Details requests
  directions:    { type: Number, default: 0 },  // Directions API requests
  estimatedCost: { type: Number, default: 0 },  // USD
  fallbackMode:  { type: Boolean, default: false },
  updatedAt:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('ApiUsage', ApiUsageSchema);
