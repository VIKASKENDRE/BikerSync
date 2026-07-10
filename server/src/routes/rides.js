const express = require('express');
const router = express.Router();
const softAuth = require('../middleware/softAuth');
const requireAuth = require('../middleware/firebaseAuth');
const { createRide, joinRide, endRide, getRide } = require('../controllers/rideController');

// softAuth: verifies the Firebase ID token when present (req.user), and
// rejects tokenless requests only once AUTH_ENFORCE=true. endRide is not
// called by any shipped client, so it can require auth immediately.
router.post('/', softAuth, createRide);
router.get('/:rideId', softAuth, getRide);
router.post('/:rideId/join', softAuth, joinRide);
router.post('/:rideId/end', requireAuth, endRide);

module.exports = router;
