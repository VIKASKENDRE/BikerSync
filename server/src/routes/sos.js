const express = require('express');
const router = express.Router();
const { triggerSOS, resolveSOS } = require('../controllers/sosController');

router.post('/trigger', triggerSOS);
router.post('/:sosId/resolve', resolveSOS);

module.exports = router;
