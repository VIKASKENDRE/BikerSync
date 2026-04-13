const { Schema, model } = require('mongoose');

const commentSchema = new Schema({
  uid:       { type: String, required: true },
  name:      { type: String, required: true },
  avatarUrl: { type: String, default: '' },
  text:      { type: String, required: true, maxlength: 500 },
}, { timestamps: true });

const postSchema = new Schema({
  authorUid:   { type: String, required: true, index: true },
  authorName:  { type: String, required: true },
  authorAvatar:{ type: String, default: '' },
  caption:     { type: String, default: '', maxlength: 1000 },
  imageUrl:    { type: String, default: '' },
  rideId:      { type: String, default: '' },   // optional linked ride
  rideName:    { type: String, default: '' },
  likes:       [{ type: String }],              // UIDs who liked
  comments:    [commentSchema],
}, { timestamps: true });

module.exports = model('Post', postSchema);
