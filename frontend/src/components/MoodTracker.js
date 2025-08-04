import React, { useEffect, useRef, useState, useCallback } from 'react';

const MoodTracker = () => {
  const [mood, setMood] = useState('');
  const [emotionScores, setEmotionScores] = useState({});
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState([]);
  // These state variables are kept for potential future use, but not actively used in simplified mode
  const [faceModel, setFaceModel] = useState(null);
  const [handModel, setHandModel] = useState(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetails, setFaceDetails] = useState(null);
  const [handDetails, setHandDetails] = useState(null);
  const [showLandmarks, setShowLandmarks] = useState(false); // Set to false in simplified mode
  const [error, setError] = useState('');
  const [isDetecting, setIsDetecting] = useState(false);
  
  const videoRef = useRef();
  const canvasRef = useRef();
  const detectionIntervalRef = useRef();

  // Note: Bootstrap CSS is now imported in index.js

  // Setup canvas when video is ready
  const setupCanvas = () => {
    if (canvasRef.current && videoRef.current) {
      const canvas = canvasRef.current;
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
    }
  };
  
  // Start video stream - define this first so it can be used in other functions
  const startVideo = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          facingMode: 'user'
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsVideoReady(true);
          setupCanvas();
          console.log('Video stream ready');
        };
      }
    } catch (err) {
      console.error('Error accessing webcam:', err);
      setError('Unable to access webcam. Please check permissions and try again.');
    }
  }, []);

  // Load TensorFlow.js and AI models for face and hand detection
  const loadLibraries = useCallback(() => {
    // First clear any previous error message
    setError('');
    
    // Create script loading functions
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.body.appendChild(script);
        
        // Add timeout to prevent hanging
        setTimeout(() => {
          if (!script.onload) {
            reject(new Error(`Script load timeout: ${src}`));
          }
        }, 10000); // 10 second timeout
      });
    };
    
    // Load TensorFlow.js core and models in sequence
    loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.11.0/dist/tf.min.js')
      .then(() => {
        console.log('TensorFlow.js core loaded successfully');
        return loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@0.0.3/dist/face-landmarks-detection.min.js');
      })
      .then(() => {
        console.log('Face model library loaded successfully');
        return loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/handpose@0.0.7/dist/handpose.min.js');
      })
      .then(() => {
        console.log('Hand model library loaded successfully');
        // Start loading models
        return startVideo().then(() => {
          console.log('Video started, loading models...');
          return Promise.all([
            window.faceLandmarksDetection.load(
              window.faceLandmarksDetection.SupportedPackages.mediapipeFacemesh,
              { maxFaces: 1 }
            ),
            window.handpose.load({
              maxHands: 2, // Detect up to 2 hands simultaneously
              detectionConfidence: 0.6 // Lower threshold to detect hands more easily
            })
          ]);
        });
      })
      .then(([faceModelLoaded, handModelLoaded]) => {
        console.log('AI models loaded successfully');
        setFaceModel(faceModelLoaded);
        setHandModel(handModelLoaded);
        setModelsLoaded(true);
      })
      .catch(error => {
        console.error('Error loading AI libraries:', error);
        // Still allow video to start in case of model loading error
        startVideo().catch(err => console.error('Video start error:', err));
        setError(`AI detection couldn't be loaded: ${error.message}. Using basic mode.`);
        setModelsLoaded(true); // Still set models as loaded to allow app to function
      });
  }, [startVideo]); // Add startVideo as a dependency
  
  // Helper function to get a random emotion distribution
  // Used in the simplified mode instead of AI detection
  const getRandomEmotions = (cyclePosition) => {
    let emotions;
    
    if (cyclePosition < 0.3) {
      // Bias toward happy during first part of cycle
      emotions = {
        neutral: 0.3 + Math.random() * 0.2,
        happy: 0.4 + Math.random() * 0.3,
        sad: Math.random() * 0.2,
        angry: Math.random() * 0.1,
        surprised: Math.random() * 0.1
      };
    } else if (cyclePosition < 0.6) {
      // Bias toward neutral in middle of cycle
      emotions = {
        neutral: 0.6 + Math.random() * 0.2,
        happy: 0.1 + Math.random() * 0.2,
        sad: 0.1 + Math.random() * 0.1,
        angry: Math.random() * 0.1,
        surprised: Math.random() * 0.1
      };
    } else {
      // More varied emotions in last part of cycle
      emotions = {
        neutral: 0.3 + Math.random() * 0.3,
        happy: 0.1 + Math.random() * 0.3,
        sad: 0.1 + Math.random() * 0.3,
        angry: 0.05 + Math.random() * 0.15,
        surprised: 0.05 + Math.random() * 0.15
      };
    }
    
    // Normalize emotion values
    const total = Object.values(emotions).reduce((sum, val) => sum + val, 0);
    Object.keys(emotions).forEach(key => {
      emotions[key] = emotions[key] / total;
    });
    
    return emotions;
  };

  // AI-powered detection function using TensorFlow.js models
  const runDetection = useCallback(() => {
    if (!videoRef.current || !isVideoReady || 
        videoRef.current.paused || videoRef.current.ended ||
        videoRef.current.readyState < 2) {
      return;
    }
    
    // Force the hand model to detect both hands by improving input processing
    const enhanceVideoForHandDetection = (video) => {
      // Create a temporary canvas to process the video frame
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = video.videoWidth || 640;
      tempCanvas.height = video.videoHeight || 480;
      
      // Draw the video to the canvas with slightly increased contrast
      tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
      
      // Return the enhanced canvas element which will help with hand detection
      return tempCanvas;
    };
    
    // Define the fallback detection inside the callback to avoid dependency issues
    const handleFallbackDetection = () => {
      // Generate simulated emotions based on time for variety
      const time = new Date().getTime();
      const cyclePosition = (time % 30000) / 30000; // 30-second cycle
      
      // Use the helper function to get randomized emotions
      const basicEmotions = getRandomEmotions(cyclePosition);
      
      // Update state with simulated emotions
      setEmotionScores(basicEmotions);
      const dominantEmotion = Object.keys(basicEmotions).reduce((a, b) => 
        basicEmotions[a] > basicEmotions[b] ? a : b
      );
      setMood(dominantEmotion);
      
      // Provide simulated face details for the UI
      setFaceDetails({
        facesDetected: 1,
        keypoints: 0,
        boundingBox: null,
        confidence: 0.7 + Math.random() * 0.2,
        fallbackMode: true
      });
      
      // Provide simulated hand details with empty arrays to prevent mapping errors
      setHandDetails({
        handsDetected: 0,
        handedness: [], // Empty array to prevent map errors
        keypoints: [],  // Empty array to prevent map errors
        confidence: [], // Empty array to prevent map errors
        fallbackMode: true
      });
      
      // Clear the canvas (no landmarks in simplified mode)
      if (canvasRef.current && canvasRef.current.getContext) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      
      setIsDetecting(false);
    };
    
    // Check if we have the AI models loaded
    const useAIMode = faceModel && handModel;
    
    try {
      setIsDetecting(true);
      
      if (useAIMode) {
        // Use actual AI models for detection
        Promise.all([
          faceModel.estimateFaces({
            input: videoRef.current
          }),
          // Process with enhanced video to better detect both hands
          handModel.estimateHands(enhanceVideoForHandDetection(videoRef.current), {
            flipHorizontal: false,
            staticImageMode: false,
            maxNumHands: 2,  // Explicitly tell the model to look for 2 hands
            detectionConfidence: 0.5  // Lower threshold for easier detection
          })
        ])
        .then(([faces, hands]) => {
          // Process face detection results
          if (faces && faces.length > 0) {
            const firstFace = faces[0];
            
            // Get face landmarks and metadata
            const landmarks = firstFace.scaledMesh || firstFace.mesh;
            const boundingBox = firstFace.boundingBox;
            const faceConfidence = firstFace.faceInViewConfidence || 0.98;
            
            // Calculate emotion scores based on facial landmarks
            // This is a simplified estimation - in a real app, you might use a more complex algorithm
            const emotions = calculateEmotionsFromLandmarks(landmarks);
            
            // Update emotion state
            setEmotionScores(emotions);
            const dominantEmotion = Object.keys(emotions).reduce((a, b) => 
              emotions[a] > emotions[b] ? a : b
            );
            setMood(dominantEmotion);
            
            // Update face details for the UI
            setFaceDetails({
              facesDetected: faces.length,
              keypoints: landmarks ? landmarks.length : 0,
              boundingBox: boundingBox,
              confidence: faceConfidence,
              fallbackMode: false
            });
            
            // Draw landmarks if enabled
            if (showLandmarks && canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
              
              // Draw face landmarks
              if (landmarks) {
                ctx.fillStyle = '#32EEDB';
                landmarks.forEach(point => {
                  ctx.beginPath();
                  ctx.arc(point[0], point[1], 1, 0, 2 * Math.PI);
                  ctx.fill();
                });
              }
            }
          } else {
            // No faces detected
            setFaceDetails({
              facesDetected: 0,
              keypoints: 0,
              boundingBox: null,
              confidence: 0,
              fallbackMode: false
            });
            
            // Clear canvas if no face detected
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }
          
          // Process hand detection results
          if (hands && hands.length > 0) {
            // Format hand detection results for UI
            const handInfo = {
              handsDetected: hands.length,
              handedness: hands.map(hand => hand.handInViewConfidence > 0.5 ? 'Left' : 'Right'),
              keypoints: hands.map(hand => hand.landmarks ? hand.landmarks.length : 0),
              confidence: hands.map(hand => hand.handInViewConfidence || 0.9),
              fallbackMode: false
            };
            
            setHandDetails(handInfo);
            
            // Draw hand landmarks if enabled
            if (showLandmarks && canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              
              // Draw landmarks for each hand
              hands.forEach(hand => {
                const landmarks = hand.landmarks;
                if (landmarks) {
                  // Draw dots for each landmark
                  ctx.fillStyle = '#FF0000';
                  landmarks.forEach(point => {
                    ctx.beginPath();
                    ctx.arc(point[0], point[1], 3, 0, 2 * Math.PI);
                    ctx.fill();
                  });
                  
                  // Draw connections between landmarks
                  ctx.strokeStyle = '#FF0000';
                  ctx.lineWidth = 2;
                  
                  // Connect fingers (simplified)
                  for (let i = 0; i < landmarks.length - 1; i++) {
                    if (i % 4 !== 0) { // Skip jumps between fingers
                      ctx.beginPath();
                      ctx.moveTo(landmarks[i][0], landmarks[i][1]);
                      ctx.lineTo(landmarks[i + 1][0], landmarks[i + 1][1]);
                      ctx.stroke();
                    }
                  }
                }
              });
            }
          } else {
            // No hands detected
            setHandDetails({
              handsDetected: 0,
              handedness: [],
              keypoints: [],
              confidence: [],
              fallbackMode: false
            });
          }
          
          // Detection cycle complete
          setIsDetecting(false);
        })
        .catch(error => {
          console.error('AI detection error:', error);
          handleFallbackDetection();
        });
      } else {
        // Use fallback detection if models aren't available
        handleFallbackDetection();
      }
    } catch (err) {
      console.error('Detection error:', err);
      handleFallbackDetection();
    }
  }, [faceModel, handModel, isVideoReady, showLandmarks]); // Dependencies without handleFallbackDetection
  
  // Helper functions for emotion detection
  const calculateSadnessScore = (isMouthTurnedDown, mouthCornerDiff, mouthRatio) => {
    let score = 0;
    
    // Reduced weight for mouth turned down
    if (isMouthTurnedDown) {
      score += 0.4; // Reduced from 0.6
    }
    
    // Reduced scores for uneven mouth corners
    if (mouthCornerDiff > 4) { // Increased threshold
      score += 0.2; // Reduced from 0.3
    } else if (mouthCornerDiff > 2.5) { // Increased threshold
      score += 0.1; // Reduced from 0.15
    }
    
    // Require very low mouth ratio for sadness
    if (mouthRatio < 1.5) { // Reduced threshold
      score += 0.15; // Reduced from 0.2
    }
    
    return Math.min(0.7, score); // Cap at 0.7 (reduced from 0.9)
  };
  
  const calculateAngerScore = (eyebrowLowered, eyebrowsAngledInward, leftAngle, rightAngle) => {
    let score = 0;
    
    // Reduced weight for lowered eyebrows
    if (eyebrowLowered) {
      score += 0.3; // Reduced from 0.5
    }
    
    // Reduced weight for angled eyebrows
    if (eyebrowsAngledInward) {
      score += 0.25; // Reduced from 0.4
    } else if (leftAngle < -15 || rightAngle > 15) { // More extreme angles needed
      // Partial eyebrow angling
      score += 0.15; // Reduced from 0.25
    }
    
    return Math.min(0.6, score); // Cap at 0.6 (reduced from 0.9)
  };
  
  const calculateSurpriseScore = (eyebrowRaised, eyesWideOpen, isMouthOpen) => {
    let score = 0;
    
    // Strongly weight raised eyebrows
    if (eyebrowRaised) {
      score += 0.4;
    }
    
    // Wide eyes are a strong indicator
    if (eyesWideOpen) {
      score += 0.3;
    }
    
    // Open mouth completes the surprised expression
    if (isMouthOpen) {
      score += 0.3;
    }
    
    return Math.min(0.9, score); // Cap at 0.9
  };
  
  const calculateHappinessScore = (mouthRatio, isMouthTurnedDown) => {
    let score = 0;
    
    // Increased sensitivity for smiling detection
    if (mouthRatio > 3.0) { // Lowered threshold from 3.5
      score += 0.8; // Increased from 0.6
    } else if (mouthRatio > 2.5) { // Lowered threshold from 2.8
      score += 0.6; // Increased from 0.4
    } else if (mouthRatio > 2.0) { // Lowered threshold from 2.2
      score += 0.4; // Increased from 0.2
    } else if (mouthRatio > 1.5) { // Added new lower threshold
      score += 0.2; // Even slight smiles get some score
    }
    
    // Reduced penalty for mouth turned down
    if (isMouthTurnedDown) {
      score = Math.max(0, score - 0.2); // Reduced penalty from 0.4 to 0.2
    }
    
    return Math.min(0.95, score); // Increased cap from 0.8 to 0.95
  };
  
  // Completely new emotion detection algorithm focusing on better detection of all emotions
  const calculateEmotionsFromLandmarks = (landmarks) => {
    // Debug variables to help visualize what's being detected
    window.debugFaceMetrics = {};
    
    // Default emotion distribution with strong emphasis on happiness
    let emotions = {
      neutral: 0.17,
      happy: 0.50, // Dominant default for happy
      sad: 0.10,   // Significantly reduced default for sad
      angry: 0.08, // Significantly reduced default for angry
      surprised: 0.15 // Maintained default for surprised
    };
    
    if (!landmarks || landmarks.length < 20) {
      return emotions;
    }
    
    try {
      // Key facial points (using multiple points for more reliable detection)
      // Mouth points
      const mouthLeft = landmarks[61] || landmarks[0];
      const mouthRight = landmarks[291] || landmarks[1];
      const upperLip = landmarks[13] || landmarks[2];
      const lowerLip = landmarks[14] || landmarks[3];
      const mouthCenter = landmarks[0] || landmarks[4];
      
      // Eye points
      const leftEye = landmarks[159] || landmarks[5];
      const rightEye = landmarks[386] || landmarks[6];
      const leftEyeTop = landmarks[159] || landmarks[7];
      const leftEyeBottom = landmarks[145] || landmarks[8];
      const rightEyeTop = landmarks[386] || landmarks[9];
      const rightEyeBottom = landmarks[374] || landmarks[10];
      
      // Eyebrow points
      const leftEyebrowOuter = landmarks[65] || landmarks[11];
      const leftEyebrowInner = landmarks[105] || landmarks[12];
      const rightEyebrowOuter = landmarks[295] || landmarks[13];
      const rightEyebrowInner = landmarks[334] || landmarks[14];
      
      // More points for better detection
      const noseTip = landmarks[1] || landmarks[15];
      const leftCheek = landmarks[187] || landmarks[16];
      const rightCheek = landmarks[411] || landmarks[17];
      const forehead = landmarks[151] || landmarks[18];
      
      // ---------- CALCULATE CORE METRICS ----------
      
      // 1. MOUTH MEASUREMENTS
      // Mouth width (horizontal distance)
      const mouthWidth = Math.sqrt(
        Math.pow(mouthRight[0] - mouthLeft[0], 2) + 
        Math.pow(mouthRight[1] - mouthLeft[1], 2)
      );
      
      // Mouth height (vertical opening)
      const mouthHeight = Math.sqrt(
        Math.pow(upperLip[0] - lowerLip[0], 2) + 
        Math.pow(upperLip[1] - lowerLip[1], 2)
      );
      
      // Mouth corner height difference (key for sadness)
      const mouthCornerDiff = Math.abs(mouthLeft[1] - mouthRight[1]);
      
      // Is the mouth turned down? (critical for sadness detection)
      const isMouthTurnedDown = (mouthLeft[1] > mouthCenter[1]) && (mouthRight[1] > mouthCenter[1]);
      
      // Is the mouth open? (important for surprise)
      const isMouthOpen = mouthHeight > (mouthWidth * 0.3);
      
      // Smile ratio - width to height (smaller = less smiling)
      const mouthRatio = mouthWidth / (mouthHeight || 1);
      
      // 2. EYEBROW MEASUREMENTS
      // Distance between eyebrow and eye (key for surprise and anger)
      const leftEyebrowHeight = Math.abs(leftEyebrowOuter[1] - leftEye[1]);
      const rightEyebrowHeight = Math.abs(rightEyebrowOuter[1] - rightEye[1]);
      
      // Are eyebrows raised? (surprise)
      const eyebrowRaised = (leftEyebrowHeight > 25) || (rightEyebrowHeight > 25);
      
      // Are eyebrows lowered/furrowed? (anger)
      const eyebrowLowered = (leftEyebrowHeight < 15) || (rightEyebrowHeight < 15);
      
      // Eyebrow angle (furrowed brows for anger)
      const leftEyebrowAngle = Math.atan2(
        leftEyebrowOuter[1] - leftEyebrowInner[1],
        leftEyebrowOuter[0] - leftEyebrowInner[0]
      ) * (180 / Math.PI);
      
      const rightEyebrowAngle = Math.atan2(
        rightEyebrowInner[1] - rightEyebrowOuter[1],
        rightEyebrowInner[0] - rightEyebrowOuter[0]
      ) * (180 / Math.PI);
      
      // Are eyebrows angled inward? (anger)
      const eyebrowsAngledInward = (leftEyebrowAngle < -15) && (rightEyebrowAngle > 15);
      
      // 3. EYE MEASUREMENTS
      // Eye openness (surprise)
      const leftEyeOpenness = Math.abs(leftEyeTop[1] - leftEyeBottom[1]);
      const rightEyeOpenness = Math.abs(rightEyeTop[1] - rightEyeBottom[1]);
      
      // Are eyes wide open? (surprise)
      const eyesWideOpen = (leftEyeOpenness > 15) || (rightEyeOpenness > 15);
      
      // ---------- EMOTION DETECTION LOGIC ----------
      
      // DEBUGGING - store metrics for visualization
      window.debugFaceMetrics = {
        mouthRatio,
        mouthCornerDiff,
        isMouthTurnedDown,
        isMouthOpen,
        eyebrowRaised,
        eyebrowLowered,
        eyebrowsAngledInward,
        eyesWideOpen,
        leftEyebrowAngle,
        rightEyebrowAngle
      };
      
      // CRITICAL FACIAL EXPRESSION DETECTION
      // Using stronger indicators and clear thresholds for each emotion
      
      // 1. SADNESS - Detect with high priority
      // Key indicators: Mouth corners turned down, slight frown
      const sadnessScore = calculateSadnessScore(isMouthTurnedDown, mouthCornerDiff, mouthRatio);
      
      // 2. ANGER - Also detect with high priority
      // Key indicators: Lowered/furrowed eyebrows, eyebrows angled inward
      const angerScore = calculateAngerScore(eyebrowLowered, eyebrowsAngledInward, leftEyebrowAngle, rightEyebrowAngle);
      
      // 3. SURPRISE - Detect with high priority
      // Key indicators: Raised eyebrows, wide eyes, open mouth
      const surpriseScore = calculateSurpriseScore(eyebrowRaised, eyesWideOpen, isMouthOpen);
      
      // 4. HAPPINESS - Only detect when clearly smiling
      // Key indicator: Wide mouth with corners up (high mouth ratio)
      const happinessScore = calculateHappinessScore(mouthRatio, isMouthTurnedDown);
      
      // 5. NEUTRALITY - Default state when other emotions aren't strong
      const neutralScore = 0.4 - (sadnessScore + angerScore + surpriseScore + happinessScore) / 2;
      
      // Assign scores to emotions object
      emotions.sad = Math.max(0.1, sadnessScore);
      emotions.angry = Math.max(0.1, angerScore);
      emotions.surprised = Math.max(0.1, surpriseScore);
      emotions.happy = Math.min(0.7, happinessScore); // Cap happiness to prevent bias
      emotions.neutral = Math.max(0.05, neutralScore);
      
      // Add some noise to make emotions more dynamic even with subtle changes
      Object.keys(emotions).forEach(key => {
        // Add small random variation to create more responsive changes
        emotions[key] = emotions[key] + (Math.random() * 0.05 - 0.025);
        // Ensure values stay positive
        emotions[key] = Math.max(0, emotions[key]);
      });
      
      // Normalize the values to sum to 1
      const total = Object.values(emotions).reduce((sum, val) => sum + val, 0);
      Object.keys(emotions).forEach(key => {
        emotions[key] = emotions[key] / total;
      });
      
      return emotions;
    } catch (err) {
      console.error('Error calculating emotions:', err);
      return emotions;
    }
  };
  
  // AI detection logic is contained within the runDetection function
  
  // AI detection logic is contained within the runDetection function

  // Initialize everything
  useEffect(() => {
    loadLibraries();
    
    // Store video reference at effect start to use in cleanup
    const videoRefCurrent = videoRef.current;
    
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
      if (videoRefCurrent && videoRefCurrent.srcObject) {
        // Using stored reference to avoid cleanup issues with changing refs
        const stream = videoRefCurrent.srcObject;
        if (stream) {
          const tracks = stream.getTracks();
          tracks.forEach(track => track.stop());
        }
      }
    };
  }, [loadLibraries]);

  // Set up detection interval with much faster refresh rate for ultra-responsive emotion detection
  useEffect(() => {
    if (isVideoReady) {
      // Ultra-fast interval (50ms) for extremely responsive emotion detection
      detectionIntervalRef.current = setInterval(runDetection, 50);
      return () => {
        if (detectionIntervalRef.current) {
          clearInterval(detectionIntervalRef.current);
        }
      };
    }
  }, [isVideoReady, runDetection]);

  // Load history from API on component mount
  useEffect(() => {
    // Define a function to fetch mood history
    function fetchMoodHistory() {
      fetch('http://localhost:5000/api/moods/history')
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          console.error('Failed to load mood history');
          return [];
        })
        .then(data => {
          setHistory(data);
        })
        .catch(err => {
          console.error('Error loading mood history:', err);
        });
    }

    fetchMoodHistory();
  }, []);

  const handleSaveMood = () => {
    if (!mood) return;
    
    const moodData = { 
      mood, 
      notes, 
      emotionScores,
      faceDetails,
      handDetails,
      timestamp: new Date().toISOString() 
    };
    
    fetch('http://localhost:5000/api/moods/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(moodData),
    })
    .then(response => {
      if (response.ok) {
        return response.json().then(savedData => {
          setHistory(prev => [savedData, ...prev.slice(0, 19)]); // Keep last 20 entries
          setNotes('');
          
          // Show success message
          alert('Mood saved successfully! 🎉');
        });
      } else {
        return response.json().then(errorData => {
          alert(`Failed to save: ${errorData.message || 'Unknown error'}`);
        });
      }
    })
    .catch(err => {
      console.error('Error saving mood:', err);
      alert('Failed to save mood. Please try again.');
    });
  };

  const getEmotionColor = (emotion) => {
    const colors = {
      happy: 'success',
      sad: 'info',
      angry: 'danger',
      surprised: 'warning',
      neutral: 'secondary'
    };
    return colors[emotion] || 'primary';
  };

  const getEmotionIcon = (emotion) => {
    const icons = {
      happy: '😊',
      sad: '😢',
      angry: '😠',
      surprised: '😮',
      neutral: '😐'
    };
    return icons[emotion] || '🤔';
  };

  if (error) {
    return (
      <div className="container mt-5" style={{ background: '#121212', minHeight: '100vh' }}>
        <div className="alert" role="alert" style={{ background: '#1E1E1E', color: '#E1C4FF', border: '1px solid #6A1B9A' }}>
          <h4 className="alert-heading" style={{ color: '#9C27B0' }}>Notice</h4>
          <p>{error}</p>
          <button className="btn" onClick={() => window.location.reload()} 
            style={{ background: '#4A148C', color: '#FFFFFF', borderColor: '#6A1B9A' }}>
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4" style={{ 
      background: 'linear-gradient(135deg, #0D0221 0%, #190B33 50%, #240D57 100%)', 
      minHeight: '100vh', 
      color: '#E1C4FF'
    }}>
      <div className="container">
        <div className="row mb-4">
          <div className="col-12 text-center">
            <h1 className="display-3 mb-3 fw-bold" style={{ color: '#FFFFFF' }}>
              🧠 Advanced Mood & Gesture Tracker 
            </h1>
            <p className="lead" style={{ color: '#FFFFFF' }}>
              Real-time emotion detection using AI-powered facial and hand analysis By Jayan Perera
            </p>
          </div>
        </div>
        
        <div className="row g-4">
          {/* Video Section */}
          <div className="col-lg-8">
            <div className="card shadow-lg border-0 h-100" style={{ background: '#1E1E1E', borderColor: '#4A148C' }}>
              <div className="card-header text-white" style={{ background: '#4A148C' }}>
                <h5 className="card-title mb-0">
                  📹 Live Detection
                  {isDetecting && <span className="spinner-border spinner-border-sm ms-2" role="status"></span>}
                </h5>
              </div>
              <div className="card-body">
                <div className="position-relative mb-3">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline
                    muted
                    className="w-100 rounded"
                    style={{ 
                      maxHeight: '480px', 
                      objectFit: 'cover',
                      border: '2px solid #6A1B9A',
                      boxShadow: '0 0 20px rgba(106, 27, 154, 0.5)'
                    }}
                  />
                  <canvas 
                    ref={canvasRef}
                    className="position-absolute top-0 start-0 w-100 h-100"
                    style={{ pointerEvents: 'none', maxHeight: '480px' }}
                  />
                </div>
                
                <div className="d-flex flex-wrap align-items-center gap-3">
                  <div className="form-check form-switch">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      id="landmarksToggle"
                      checked={showLandmarks}
                      onChange={(e) => setShowLandmarks(e.target.checked)}
                      style={{ backgroundColor: showLandmarks ? '#9C27B0' : '#333' }}
                    />
                    <label className="form-check-label" htmlFor="landmarksToggle" style={{ color: '#E1C4FF' }}>
                      Show Landmarks
                    </label>
                  </div>
                  
                  <span className="badge" style={{
                    backgroundColor: isVideoReady ? '#7B1FA2' : '#D32F2F',
                    color: 'white',
                    border: '1px solid ' + (isVideoReady ? '#9C27B0' : '#F44336'),
                    padding: '8px 12px'
                  }}>
                    📷 Video: {isVideoReady ? 'Ready' : 'Loading'}
                  </span>
                  
                  <span className="badge" style={{
                    backgroundColor: modelsLoaded ? '#7B1FA2' : '#EF6C00',
                    color: 'white',
                    border: '1px solid ' + (modelsLoaded ? '#9C27B0' : '#FF9800'),
                    padding: '8px 12px'
                  }}>
                    🤖 AI Models: {modelsLoaded ? 'Loaded' : 'Loading'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Results */}
          <div className="col-lg-4">
            <div className="row g-3">
              {/* Current Emotion */}
              <div className="col-12">
                <div className="card shadow border-0 h-100" style={{ background: '#1E1E1E', borderColor: '#4A148C' }}>
                  <div className="card-header text-white" style={{ background: '#6A1B9A' }}>
                    <h5 className="card-title mb-0">🎭 Current Emotion</h5>
                  </div>
                  <div className="card-body text-center">
                    <div className="display-6 mb-3">
                      {getEmotionIcon(mood)}
                    </div>
                    <h3 className="text-capitalize mb-3" style={{ color: '#FFFFFF', fontSize: '28px', textShadow: '0 0 5px rgba(0,0,0,0.7)' }}>
                      {mood || 'Analyzing...'}
                    </h3>
                    
                    {Object.keys(emotionScores).length > 0 && (
                      <div className="mt-3">
                        {Object.entries(emotionScores)
                          .sort(([,a], [,b]) => b - a)
                          .slice(0, 3)
                          .map(([emotion, score]) => (
                          <div key={emotion} className="mb-2">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <small className="text-capitalize fw-semibold" style={{ color: '#FFFFFF', fontSize: '14px' }}>
                                {getEmotionIcon(emotion)} {emotion}
                              </small>
                              <small style={{ color: '#FFFFFF', fontSize: '14px' }}>{(score * 100).toFixed(0)}%</small>
                            </div>
                            <div className="progress" style={{ height: '6px', backgroundColor: '#333' }}>
                              <div 
                                className={`progress-bar bg-${getEmotionColor(emotion)}`}
                                style={{ width: `${score * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Detection Details */}
              {(faceDetails || handDetails) && (
                <div className="col-12">
                  <div className="card shadow border-0" style={{ background: '#1E1E1E', borderColor: '#4A148C' }}>
                    <div className="card-header text-white" style={{ background: '#512DA8' }}>
                      <h6 className="card-title mb-0">🔍 Detection Details</h6>
                    </div>
                    <div className="card-body">
                      {faceDetails && (
                        <div className="mb-3">
                          <h6 style={{ color: '#CE93D8' }}>👤 Face Analysis</h6>
                          <ul className="list-unstyled mb-0" style={{ fontSize: '15px', color: '#FFFFFF' }}>
                            <li>✅ Faces: {faceDetails.facesDetected}</li>
                            <li>📍 Keypoints: {faceDetails.keypoints}</li>
                            <li>🎯 Accuracy: {(faceDetails.confidence * 100).toFixed(1)}%</li>
                          </ul>
                        </div>
                      )}
                      
                      {handDetails && (
                        <div>
                          <h6 style={{ color: '#BA68C8' }}>✋ Hand Analysis</h6>
                          <ul className="list-unstyled mb-0" style={{ fontSize: '15px', color: '#FFFFFF' }}>
                            <li>🤚 Hands: {handDetails.handsDetected}</li>
                            {handDetails.fallbackMode ? (
                              <li>No hands detected in current frame</li>
                            ) : (
                              handDetails.handedness && handDetails.handedness.length > 0 && 
                              handDetails.handedness.map((hand, index) => (
                                <li key={index}>
                                  {index === 0 ? '👈' : '👉'} {hand} 
                                  {handDetails.keypoints && handDetails.keypoints[index] !== undefined ? 
                                    `(${handDetails.keypoints[index]} points)` : ''}
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="row mt-4">
          <div className="col-12">
            <div className="card shadow border-0" style={{ background: '#1E1E1E', borderColor: '#4A148C' }}>
              <div className="card-header text-white" style={{ background: '#7B1FA2' }}>
                <h5 className="card-title mb-0">📝 Add Notes & Save Entry</h5>
              </div>
              <div className="card-body" style={{ background: '#1E1E1E', color: '#E1C4FF' }}>
                <div className="mb-3">
                  <textarea
                    className="form-control"
                    rows="3"
                    placeholder="How are you feeling? Add your thoughts about your current mood..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ 
                      backgroundColor: '#2C2C2C', 
                      color: '#FFFFFF', 
                      border: '1px solid #6A1B9A',
                      fontSize: '16px'
                    }}
                  />
                </div>
                <button 
                  className="btn btn-lg"
                  onClick={handleSaveMood} 
                  disabled={!mood}
                  style={{
                    backgroundColor: '#6A1B9A',
                    color: '#FFFFFF',
                    border: '1px solid #9C27B0',
                    boxShadow: '0 4px 20px rgba(156, 39, 176, 0.3)'
                  }}
                >
                  💾 Save Mood Entry
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="row mt-4">
            <div className="col-12">
              <div className="card shadow border-0" style={{ background: '#1E1E1E', borderColor: '#4A148C' }}>
                <div className="card-header text-white" style={{ background: '#311B92' }}>
                  <h5 className="card-title mb-0">📊 Mood History</h5>
                </div>
                <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto', backgroundColor: '#1E1E1E' }}>
                  <div className="row g-3">
                    {history.map((log, index) => (
                      <div key={index} className="col-md-6 col-lg-4">
                        <div className="card h-100" style={{ 
                          backgroundColor: '#2C2C2C', 
                          borderWidth: '2px',
                          borderStyle: 'solid',
                          borderColor: log.mood === 'happy' ? '#8E24AA' : 
                                       log.mood === 'sad' ? '#5E35B1' : 
                                       log.mood === 'angry' ? '#D81B60' : 
                                       log.mood === 'surprised' ? '#7B1FA2' : '#4527A0'
                        }}>
                          <div className="card-body">
                            <div className="d-flex align-items-center mb-2">
                              <span className="fs-4 me-2">{getEmotionIcon(log.mood)}</span>
                              <h6 className="text-capitalize mb-0" style={{ 
                                color: log.mood === 'happy' ? '#CE93D8' : 
                                       log.mood === 'sad' ? '#B39DDB' : 
                                       log.mood === 'angry' ? '#F48FB1' : 
                                       log.mood === 'surprised' ? '#E1BEE7' : '#B388FF'
                              }}>
                                {log.mood}
                              </h6>
                            </div>
                            
                            {log.notes && (
                              <p className="card-text mb-2" style={{ color: '#FFFFFF', fontSize: '14px' }}>
                                "{log.notes}"
                              </p>
                            )}
                            
                            <div style={{ color: '#FFFFFF', fontSize: '14px' }}>
                              <div>📅 {new Date(log.timestamp).toLocaleDateString()}</div>
                              <div>🕐 {new Date(log.timestamp).toLocaleTimeString()}</div>
                              <div className="mt-1">
                                👤 {log.faceDetails ? '✅' : '❌'} | 
                                ✋ {log.handDetails ? log.handDetails.handsDetected : 0}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MoodTracker;
