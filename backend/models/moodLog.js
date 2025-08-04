const mongoose = require('mongoose');

const moodLogSchema = new mongoose.Schema({
  mood: { type: String, required: true },
  date: { type: Date, default: Date.now },
  notes: { type: String, default: "" },
  emotionScores: { 
    type: Map, 
    of: Number,
    default: {} 
  },
  faceDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  handDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MoodLog', moodLogSchema);
