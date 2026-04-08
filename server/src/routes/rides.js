const express = require('express');
const router = express.Router();
const { createRide, joinRide, endRide, getRide } = require('../controllers/rideController');

router.post('/', createRide);
router.get('/:rideId', getRide);
router.post('/:rideId/join', joinRide);
router.post('/:rideId/end', endRide);

module.exports = router;
