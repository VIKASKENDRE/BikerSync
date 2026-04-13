const express = require('express');
const router  = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const {
  getMe, getStats, getRides, deleteRide,
  getUsers, deleteUser, resetData,
  getApiUsage, resetFallback,
} = require('../controllers/adminController');

// All routes require a valid Firebase ID token from an admin UID
router.use(adminAuth);

router.get('/me',              getMe);
router.get('/stats',           getStats);
router.get('/rides',           getRides);
router.delete('/rides/:rideId', deleteRide);
router.get('/users',           getUsers);
router.delete('/users/:uid',   deleteUser);
router.post('/reset',                   resetData);
router.get('/api-usage',               getApiUsage);
router.post('/api-usage/reset-fallback', resetFallback);

module.exports = router;
