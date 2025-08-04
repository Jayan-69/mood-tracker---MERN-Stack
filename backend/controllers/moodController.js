const MoodLog = require('../models/moodLog');

// Add mood log
const addMoodLog = async (req, res) => {
  try {
    const { mood, notes, emotionScores, faceDetails, handDetails, timestamp } = req.body;
    
    // Create a new mood log with all the data
    const newMoodLog = new MoodLog({
      mood,
      notes,
      emotionScores,
      faceDetails,
      handDetails,
      timestamp: timestamp || Date.now()
    });
    
    await newMoodLog.save();
    res.status(200).json(newMoodLog);
  } catch (err) {
    console.error('Error saving mood log:', err);
    res.status(500).json({ message: 'Error saving mood log', error: err.message });
  }
};

// Get mood history
const getMoodHistory = async (req, res) => {
  try {
    // Sort by timestamp (newest first)
    const logs = await MoodLog.find().sort({ timestamp: -1 }).limit(20);
    res.status(200).json(logs);
  } catch (err) {
    console.error('Error fetching mood history:', err);
    res.status(500).json({ message: 'Error fetching mood history', error: err.message });
  }
};

module.exports = { addMoodLog, getMoodHistory };
