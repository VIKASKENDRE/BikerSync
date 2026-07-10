const express = require('express');
const router = express.Router();
const softAuth = require('../middleware/softAuth');
const { triggerSOS, resolveSOS } = require('../controllers/sosController');

router.post('/trigger', softAuth, triggerSOS);
router.post('/:sosId/resolve', softAuth, resolveSOS);

module.exports = router;
