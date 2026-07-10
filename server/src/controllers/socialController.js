const UserProfile = require('../models/UserProfile');
const Post        = require('../models/Post');
const path        = require('path');

// ── Profile ──────────────────────────────────────────────────────────────────

async function getProfile(req, res) {
  try {
    const profile = await UserProfile.findOne({ uid: req.params.uid });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.json(profile);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

// Upserts the caller's profile (uid comes from verified Firebase token)
async function upsertProfile(req, res) {
  const { uid, name, picture } = req.user; // from Firebase token
  const { bio, bike, city, avatarUrl } = req.body;
  try {
    const profile = await UserProfile.findOneAndUpdate(
      { uid },
      {
        $set: {
          displayName: name ?? req.body.displayName ?? 'Rider',
          ...(bio  !== undefined && { bio }),
          ...(bike !== undefined && { bike }),
          ...(city !== undefined && { city }),
          avatarUrl: avatarUrl ?? picture ?? '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json(profile);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

// ── Follow / Unfollow ────────────────────────────────────────────────────────

async function followUser(req, res) {
  const myUid     = req.user.uid;
  const targetUid = req.params.uid;
  if (myUid === targetUid) return res.status(400).json({ error: 'Cannot follow yourself' });
  try {
    await UserProfile.updateOne({ uid: myUid },     { $addToSet: { following: targetUid } });
    await UserProfile.updateOne({ uid: targetUid }, { $addToSet: { followers: myUid } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function unfollowUser(req, res) {
  const myUid     = req.user.uid;
  const targetUid = req.params.uid;
  try {
    await UserProfile.updateOne({ uid: myUid },     { $pull: { following: targetUid } });
    await UserProfile.updateOne({ uid: targetUid }, { $pull: { followers: myUid } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

// ── Posts ────────────────────────────────────────────────────────────────────

async function getFeed(req, res) {
  const myUid = req.user.uid;
  try {
    const me = await UserProfile.findOne({ uid: myUid });
    const uids = [...(me?.following ?? []), myUid];
    const posts = await Post.find({ authorUid: { $in: uids } })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(posts);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function getUserPosts(req, res) {
  try {
    const posts = await Post.find({ authorUid: req.params.uid })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(posts);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function createPost(req, res) {
  const { uid, name, picture } = req.user;
  const { caption, rideId, rideName } = req.body;
  // Image uploaded via multer → req.file; imageUrl can also be sent as text field
  const imageUrl = req.file
    ? `/uploads/${req.file.filename}`
    : (req.body.imageUrl ?? '');

  try {
    const profile = await UserProfile.findOne({ uid });
    const post = await Post.create({
      authorUid:    uid,
      authorName:   profile?.displayName ?? name ?? 'Rider',
      authorAvatar: profile?.avatarUrl   ?? picture ?? '',
      caption:      caption ?? '',
      imageUrl,
      rideId:   rideId   ?? '',
      rideName: rideName ?? '',
    });
    res.status(201).json(post);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function deletePost(req, res) {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post)                        return res.status(404).json({ error: 'Post not found' });
    if (post.authorUid !== req.user.uid) return res.status(403).json({ error: 'Not your post' });
    await post.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function toggleLike(req, res) {
  const uid = req.user.uid;
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const liked = post.likes.includes(uid);
    if (liked) {
      post.likes.pull(uid);
    } else {
      post.likes.push(uid);
    }
    await post.save();
    res.json({ liked: !liked, count: post.likes.length });
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function addComment(req, res) {
  const { uid, name, picture } = req.user;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });
  try {
    const profile = await UserProfile.findOne({ uid });
    const post    = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.comments.push({
      uid,
      name:      profile?.displayName ?? name ?? 'Rider',
      avatarUrl: profile?.avatarUrl   ?? picture ?? '',
      text:      text.trim(),
    });
    await post.save();
    res.json(post.comments[post.comments.length - 1]);
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

async function deleteComment(req, res) {
  const uid = req.user.uid;
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comment = post.comments.id(req.params.commentId);
    if (!comment)          return res.status(404).json({ error: 'Comment not found' });
    if (comment.uid !== uid) return res.status(403).json({ error: 'Not your comment' });
    comment.deleteOne();
    await post.save();
    res.json({ ok: true });
  } catch (e) {
    console.error('[Social]', e.message);
    res.status(500).json({ error: 'Request failed' });
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

async function searchUsers(req, res) {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const results = await UserProfile.find(
      { $text: { $search: q } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(20);
    res.json(results);
  } catch {
    // Fallback: regex search (works before text index is built)
    const regex = new RegExp(q, 'i');
    const results = await UserProfile.find({ displayName: regex }).limit(20);
    res.json(results);
  }
}

module.exports = {
  getProfile, upsertProfile,
  followUser, unfollowUser,
  getFeed, getUserPosts, createPost, deletePost,
  toggleLike, addComment, deleteComment,
  searchUsers,
};
