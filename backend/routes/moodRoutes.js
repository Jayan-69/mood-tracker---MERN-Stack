const express = require('express');
const moodController = require('../controllers/moodController');

const router = express.Router();

router.post('/log', moodController.addMoodLog);
router.get('/history', moodController.getMoodHistory);

module.exports = router;
