const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const auth    = require('../middleware/firebaseAuth');
const ctrl    = require('../controllers/socialController');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\//.test(file.mimetype));
  },
});

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
router.post  ('/posts',                             auth, upload.single('image'), ctrl.createPost);
router.delete('/posts/:postId',                     auth, ctrl.deletePost);
router.post  ('/posts/:postId/like',                auth, ctrl.toggleLike);
router.post  ('/posts/:postId/comment',             auth, ctrl.addComment);
router.delete('/posts/:postId/comments/:commentId', auth, ctrl.deleteComment);

module.exports = router;
