const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const auth    = require('../middleware/firebaseAuth');
const ctrl    = require('../controllers/socialController');

// Buffer uploads in memory so the file only reaches disk after content
// sniffing — the client-supplied mimetype and extension are never trusted
// (an .html file with a spoofed image/* mimetype would otherwise be served
// from /uploads as a stored-XSS page).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

/** Detect real image type from magic bytes; returns a safe extension or null. */
function sniffImageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return null;
}

// Persists a sniffed-valid image to uploads/ and sets req.file.filename for
// the controller (same contract as the old diskStorage setup).
function persistImage(req, res, next) {
  if (!req.file) return next();
  const ext = sniffImageExt(req.file.buffer);
  if (!ext) return res.status(415).json({ error: 'File is not a supported image (jpg/png/gif/webp)' });

  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const dest = path.join(__dirname, '..', '..', 'uploads', filename);
  fs.writeFile(dest, req.file.buffer, (err) => {
    if (err) return res.status(500).json({ error: 'Could not save image' });
    req.file.filename = filename;
    next();
  });
}

// Profiles
router.get ('/profile/:uid',  ctrl.getProfile);
router.put ('/profile',       auth, ctrl.upsertProfile);

// Follow
router.post  ('/follow/:uid', auth, ctrl.followUser);
router.delete('/follow/:uid', auth, ctrl.unfollowUser);

// Search
router.get('/search', ctrl.searchUsers);

// Feed (auth)
router.get('/feed', auth, ctrl.getFeed);

// Posts
router.get   ('/posts/:uid',                        ctrl.getUserPosts);
router.post  ('/posts',                             auth, upload.single('image'), persistImage, ctrl.createPost);
router.delete('/posts/:postId',                     auth, ctrl.deletePost);
router.post  ('/posts/:postId/like',                auth, ctrl.toggleLike);
router.post  ('/posts/:postId/comment',             auth, ctrl.addComment);
router.delete('/posts/:postId/comments/:commentId', auth, ctrl.deleteComment);

module.exports = router;
