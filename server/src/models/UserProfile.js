const { Schema, model } = require('mongoose');

const userProfileSchema = new Schema({
  uid:         { type: String, required: true, unique: true, index: true },
  displayName: { type: String, required: true },
  bio:         { type: String, default: '' },
  bike:        { type: String, default: '' },  // e.g. "Royal Enfield Himalayan 2023"
  city:        { type: String, default: '' },
  avatarUrl:   { type: String, default: '' },
  followers:   [{ type: String }],             // array of UIDs
  following:   [{ type: String }],             // array of UIDs
}, { timestamps: true });

userProfileSchema.index({ displayName: 'text', bike: 'text', city: 'text' });

module.exports = model('UserProfile', userProfileSchema);
