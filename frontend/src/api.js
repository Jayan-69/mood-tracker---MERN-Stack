import axios from 'axios';

const API_URL = 'http://localhost:5000/api/moods';

export const saveMoodLog = (moodData) => {
  return axios.post(`${API_URL}/log`, moodData);
};

export const getMoodHistory = () => {
  return axios.get(`${API_URL}/history`);
};
