/**
 * Tank RTC SDK - JavaScript SDK for spatial audio and video communication
 * @version 1.0.0
 */

// Default configuration
const DEFAULT_CONFIG = {
  serverUrl: 'ws://localhost:9090',
  videoFrameRate: 30,
  videoWidth: 64,
  videoHeight: 64,
  videoQuality: 0.8,
  audioVolume: 1.0,
  maxHearingRange: 50.0,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ],
  debug: true // Enable debug logging
};

/**
 * Tank RTC SDK Class
 */
class TankRTC {
  constructor(clientId, config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clientId = clientId;

    // Connection state
    this.isConnected = false;
    this.isSendingAudio = false;
    this.isListeningAudio = false;
    this.isSendingVideo = false;
    this.isViewingVideo = false;

    // WebRTC connections
    this.audioPeerConnection = null;
    this.videoPeerConnection = null;
    this.audioWsConnection = null;
    this.videoWsConnection = null;

    // Audio elements and streams
    this.localStream = null;
    this.remoteAudioElement = null;
    this.audioContext = null;
    this.analyser = null;
    this.gainNode = null;

    // Video elements and data
    this.videoDataChannel = null;
    this.videoCanvas = null;
    this.videoContext = null;
    this.videoElement = null;
    this.receivedVideos = new Map();
    this.videoFrameNumber = 0;
    this.videoInterval = null;

    // Safari-specific audio handling
    this.isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
    this.safariAudioContext = null;
    this.safariGainNode = null;
    this.safariAnalyser = null;
    this.safariUserInteractionNeeded = false;
    this.safariRemoteSource = null;
    this.safariRemoteGain = null;

    // Callbacks
    this.callbacks = {
      onConnect: null,
      onDisconnect: null,
      onVideoSourceAdd: null,
      onVideoSourceRemove: null,
      onVideoFrameUpdate: null,
      onAudioStateChange: null,
      onVideoStateChange: null,
      onError: null
    };

    this.log('TankRTC SDK initialized', {
      clientId: this.clientId,
      config: this.config,
      userAgent: navigator.userAgent,
      isSafari: this.isSafari
    });
  }

  /**
   * Logging utility
   */
  log(message, data = null) {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[TankRTC ${timestamp}] ${message}`, data);
      } else {
        console.log(`[TankRTC ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Error logging utility
   */
  logError(message, error = null) {
    const timestamp = new Date().toISOString();
    if (error) {
      console.error(`[TankRTC ${timestamp}] ERROR: ${message}`, error);
    } else {
      console.error(`[TankRTC ${timestamp}] ERROR: ${message}`);
    }
  }

  /**
   * Set callback handlers
   */
  on(event, callback) {
    if (this.callbacks.hasOwnProperty(event)) {
      this.callbacks[event] = callback;
      this.log('Callback registered', { event, callback: callback ? 'function' : 'null' });
    } else {
      this.logError('Unknown callback event', { event });
    }
    return this;
  }

  /**
   * Connect to the Tank RTC server
   */
  async connect() {
    this.log('Starting connection to server');
    try {
      // Don't establish WebSocket connections initially (following index.html pattern)
      // Connections will be established when needed for audio/video operations

      this.isConnected = true;
      this.log('Successfully connected to server');
      this.callbacks.onConnect?.();
      return true;
    } catch (error) {
      this.handleError('Connection failed', error);
      return false;
    }
  }

  /**
   * Create and send audio offer with correct intent
   */
  async createAudioOffer() {
    if (!this.audioPeerConnection || !this.audioWsConnection || this.audioWsConnection.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const offer = await this.audioPeerConnection.createOffer({
        offerToReceiveAudio: this.isListeningAudio,
        offerToReceiveVideo: false
      });
      await this.audioPeerConnection.setLocalDescription(offer);

      this.audioWsConnection.send(JSON.stringify({
        type: 'offer',
        clientId: this.clientId,
        sdp: offer.sdp
      }));
    } catch (error) {
      console.error('Error sending offer:', error);
    }
  }

  /**
   * Check if video connection is ready
   */
  isVideoConnectionReady() {
    return this.videoWsConnection && this.videoWsConnection.readyState === WebSocket.OPEN &&
           this.videoPeerConnection && this.videoDataChannel && this.videoDataChannel.readyState === 'open';
  }

  /**
   * Send video offer
   */
  async sendVideoOffer() {
    if (!this.videoPeerConnection || !this.videoWsConnection || this.videoWsConnection.readyState !== WebSocket.OPEN) {
      console.error('Video connection not ready:', {
        hasPeerConnection: !!this.videoPeerConnection,
        hasWsConnection: !!this.videoWsConnection,
        wsState: this.videoWsConnection?.readyState
      });
      return;
    }

    try {
      console.log('Creating video data channel with clientId:', this.clientId);

      // Create data channel first to ensure it's included in the offer
      const ordered = false;
      const dataChannel = this.videoPeerConnection.createDataChannel('video', {
        ordered: ordered,
        maxRetransmits: 0 // Prevent retransmissions for real-time video
      });

      console.log('Data channel created, label:', dataChannel.label, 'ready state:', dataChannel.readyState);

      // Set up data channel event handlers
      dataChannel.onopen = () => {
        console.log('👉 Video data channel opened!');
        this.videoDataChannel = dataChannel;
      };

      dataChannel.onclose = () => {
        console.log('Video data channel closed');
        this.videoDataChannel = null;
      };

      dataChannel.onerror = (error) => {
        console.error('Video data channel error:', error);
      };

      dataChannel.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          this.handleIncomingVideoMessage(event.data);
        } else if (event.data instanceof Blob) {
          // Firefox sends Blob, convert to ArrayBuffer
          const reader = new FileReader();
          reader.onload = () => {
            this.handleIncomingVideoMessage(reader.result);
          };
          reader.onerror = (error) => {
            this.logError('Error converting Blob to ArrayBuffer', error);
          };
          reader.readAsArrayBuffer(event.data);
        } else if (typeof event.data === 'string') {
          // Handle text messages (video-add, video-remove)
          try {
            const message = JSON.parse(event.data);
            switch (message.type) {
              case 'video-add':
                this.log('😊 Video source entered range', { clientId: message.clientId });
                // The video will appear in the next frame update
                break;
              case 'video-remove':
                this.log('😩 Video source left range', { clientId: message.clientId });
                // Remove the video from display immediately
                const videoData = this.receivedVideos.get(message.clientId);
                if (videoData) {
                  URL.revokeObjectURL(videoData.url);
                }
                this.receivedVideos.delete(message.clientId);
                this.callbacks.onVideoSourceRemove?.(message.clientId);
                break;
              default:
                this.log('Unknown text message', { message });
            }
          } catch (error) {
            this.logError('Error parsing text message', error);
          }
        }
      };

      const offer = await this.videoPeerConnection.createOffer();
      console.log('Created video offer, SDP length:', offer.sdp.length);
      await this.videoPeerConnection.setLocalDescription(offer);

      console.log('Sending video offer via WebSocket');
      this.videoWsConnection.send(JSON.stringify({
        type: 'offer',
        clientId: this.clientId,
         sdp: offer.sdp
      }));
    } catch (error) {
      console.error('Error sending video offer:', error);
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    this.log('Disconnecting from server');
    this.stopSendingAudio();
    this.stopListeningAudio();
    this.stopSendingVideo();
    this.stopViewingVideo();

    // Safari-specific cleanup
    this.cleanupSafariAudio(true);

    if (this.audioWsConnection) {
      this.audioWsConnection.close();
      this.audioWsConnection = null;
      this.log('Audio WebSocket connection closed');
    }

    if (this.videoWsConnection) {
      this.videoWsConnection.close();
      this.videoWsConnection = null;
      this.log('Video WebSocket connection closed');
    }

    if (this.audioPeerConnection) {
      this.audioPeerConnection.close();
      this.audioPeerConnection = null;
      this.log('Audio peer connection closed');
    }

    if (this.videoPeerConnection) {
      this.videoPeerConnection.close();
      this.videoPeerConnection = null;
      this.log('Video peer connection closed');
    }

    // Clear received videos
    this.receivedVideos.forEach(videoData => {
      URL.revokeObjectURL(videoData.url);
    });
    this.receivedVideos.clear();
    this.log('Cleared all received videos');

    this.isConnected = false;
    this.log('Disconnected from server');
    this.callbacks.onDisconnect?.();
  }

  /**
   * Start sending audio
   */
  async startSendingAudio() {
    this.log('Starting audio sending', {
      isSendingAudio: this.isSendingAudio,
      hasLocalStream: !!this.localStream
    });

    if (this.isSendingAudio) {
      this.log('Already sending audio');
      return;
    }

    try {
      this.log('Requesting microphone access');
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.isSendingAudio = true;

      // Always create fresh connection when starting sending (like index.html)
      if (this.audioWsConnection) {
        this.log('Closing existing audio WebSocket connection');
        this.audioWsConnection.close();
        this.audioWsConnection = null;
      }

      if (this.audioPeerConnection) {
        this.log('Closing existing audio peer connection');
        this.audioPeerConnection.close();
        this.audioPeerConnection = null;
      }

      // Re-establish audio connection only (independent of video)
      await this.initializeAudioConnection();
      await this.resetPeerConnection();

      // Add local audio track
      this.localStream.getTracks().forEach(track => {
        this.audioPeerConnection.addTrack(track, this.localStream);
      });

      // Create and send offer with fresh connection
      await this.createAudioOffer();

      this.log('Audio sending started successfully');
      this.callbacks.onAudioStateChange?.('sending', true);
    } catch (error) {
      this.isSendingAudio = false;
      this.handleError('Failed to start sending audio', error);
      throw error;
    }
  }

  /**
   * Stop sending audio
   */
  stopSendingAudio() {
    // Notify server that we're stopping sending (primary cleanup)
    if (this.audioWsConnection && this.audioWsConnection.readyState === WebSocket.OPEN && this.clientId) {
      this.audioWsConnection.send(JSON.stringify({
        type: 'stop-sending',
        clientId: this.clientId
      }));
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        // Remove track from peer connection
        if (this.audioPeerConnection) {
          const sender = this.audioPeerConnection.getSenders().find(s => s.track === track);
          if (sender) {
            this.audioPeerConnection.removeTrack(sender);
          }
        }
      });
      this.localStream = null;
    }

    this.isSendingAudio = false;
    this.cleanupSafariAudio();

    this.log('Audio sending stopped');
    this.callbacks.onAudioStateChange?.('sending', false);
  }

  /**
   * Start listening to audio
   */
  async startListeningAudio() {
    if (this.isListeningAudio) {
      this.log('Already listening to audio, skipping');
      return;
    }

    try {
      if (this.isSafari) {
        this.log('Initializing Safari audio context');
        await this.initializeSafariAudioContext();
      }

      this.isListeningAudio = true;

      // Always create fresh connection when starting listening (like index.html)
      if (this.audioWsConnection) {
        this.log('Closing existing audio WebSocket connection');
        this.audioWsConnection.close();
        this.audioWsConnection = null;
      }

      if (this.audioPeerConnection) {
        this.log('Closing existing audio peer connection');
        this.audioPeerConnection.close();
        this.audioPeerConnection = null;
      }

      // Re-establish audio connection only (independent of video)
      await this.initializeAudioConnection();
      await this.resetPeerConnection();

      // Re-add local audio track if we were sending
      if (this.isSendingAudio && this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.audioPeerConnection.addTrack(track, this.localStream);
        });
      }

      // Create and send offer with fresh connection
      await this.createAudioOffer();

      this.log('Audio listening started successfully');
      this.callbacks.onAudioStateChange?.('listening', true);

      // Note: setupRemoteAudio will be called automatically when audio tracks are received
      this.log('Audio listening setup complete - waiting for audio tracks');
    } catch (error) {
      this.isListeningAudio = false;
      this.handleError('🔴 Failed to start listening audio', error);
    }
  }

  /**
   * Stop listening to audio
   */
  stopListeningAudio() {
    this.isListeningAudio = false;
    this.callbacks.onAudioStateChange?.('listening', false);

    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement = null;
    }
    this.log('Audio listening stopped');
    this.cleanupSafariAudio();
  }

  /**
   * Start sending video
   */
  async startSendingVideo() {
    this.log('🟡 Starting webcam...');

    if (this.isSendingVideo) {
      this.log('Already sending video, skipping');
      return;
    }

    try {
      this.log('Requesting camera access');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: this.config.videoWidth },
          height: { ideal: this.config.videoHeight },
          frameRate: { ideal: this.config.videoFrameRate }
        }
      });
      this.log('Camera access granted', {
        tracks: stream.getTracks().length,
        trackKinds: stream.getTracks().map(t => t.kind)
      });

      // Set up canvas for video processing
      this.log('Creating video canvas');
      this.videoCanvas = document.createElement('canvas');
      this.videoCanvas.width = this.config.videoWidth;
      this.videoCanvas.height = this.config.videoHeight;
      this.videoContext = this.videoCanvas.getContext('2d');

      // Create video element to draw from (like index.html)
      this.log('Creating video element');
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = stream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true; // Important for Chrome

      // Store reference for cleanup
      window.videoElement = this.videoElement;

      // Safari-specific fix: temporarily attach to DOM to ensure video works
      if (this.isSafari) {
        this.log('Adding video element to DOM for Safari');
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.left = '-9999px';
        this.videoElement.style.top = '-9999px';
        this.videoElement.style.width = '1px';
        this.videoElement.style.height = '1px';
        document.body.appendChild(this.videoElement);
      }

      // Wait for video to be ready.
      this.log('Waiting for video to be ready');
      await new Promise((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          // Additional wait for video to actually start playing
          this.videoElement.oncanplay = () => {
            // Force a small delay to ensure video is fully ready
            setTimeout(resolve, 100);
          };
          this.videoElement.play().then(() => {
            // Video play started successfully
          }).catch((error) => {
            // If autoplay fails, still resolve after a delay
            setTimeout(resolve, 200);
          });
        };
      });

      // Safari-specific: Additional wait to ensure video is actually streaming
      if (this.isSafari) {
        this.log('Additional Safari video readiness check');
        await new Promise((resolve) => {
          let checkCount = 0;
          const checkVideo = () => {
            if (this.videoElement.videoWidth > 0 && this.videoElement.videoHeight > 0 && !this.videoElement.paused) {
              resolve();
            } else if (checkCount < 50) { // 5 seconds max
              checkCount++;
              setTimeout(checkVideo, 100);
            } else {
              resolve();
            }
          };
          checkVideo();
        });
      }

      this.isSendingVideo = true;

      // Re-establish video WebSocket connection only (independent of audio)
      await this.initializeVideoConnection();

      // Wait for data channel to be ready (only if not already ready)
      if (!this.isVideoConnectionReady()) {
        this.log('Waiting for video data channel to open');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        while (!this.videoDataChannel || this.videoDataChannel.readyState !== 'open') {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Video data channel failed to open within 5 seconds');
          }
        }
      }

      // Start video capture loop
      this.log('Starting video frame sending loop');
      this.videoInterval = setInterval(() => {
        this.sendVideoFrame();
      }, 1000 / this.config.videoFrameRate);

      this.log('🟢 Video sending started successfully');
      this.callbacks.onVideoStateChange?.('sending', true);

    } catch (error) {
      this.handleError('🔴 Failed to start sending video', error);
    }
  }

  /**
   * Stop sending video
   */
  stopSendingVideo() {
    this.log('🟡 Stopping video sending');

    // Notify server that we're stopping sending video
    if (this.videoDataChannel && this.videoDataChannel.readyState === 'open') {
      this.videoDataChannel.send(JSON.stringify({
          type: 'stop-video'
      }));
    }

    if (this.videoInterval) {
      this.log('Clearing video interval');
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }

    if (this.videoElement) {
      this.log('Stopping video tracks');
      if (this.videoElement.srcObject) {
        this.videoElement.srcObject.getTracks().forEach(track => track.stop());
      }
      if (this.isSafari && this.videoElement.parentNode) {
        this.log('Removing video element from DOM for Safari');
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }

    this.videoCanvas = null;
    this.videoContext = null;
    this.isSendingVideo = false;

    // Only close video connection if both sending and viewing are stopped
    if (!this.isSendingVideo && !this.isViewingVideo) {
      if (this.videoPeerConnection) {
        this.log('Closing video peer connection');
        this.videoPeerConnection.close();
        this.videoPeerConnection = null;
      }
      if (this.videoWsConnection) {
        this.log('Closing video WebSocket connection');
        this.videoWsConnection.close();
        this.videoWsConnection = null;
      }
      this.videoDataChannel = null;
    }

    this.log('🔴 Video sending stopped');
    this.callbacks.onVideoStateChange?.('sending', false);
  }

  /**
   * Start viewing video
   */
  async startViewingVideo() {
    this.log('Starting video viewing', {
      isViewingVideo: this.isViewingVideo,
      hasVideoDataChannel: !!this.videoDataChannel
    });

    if (this.isViewingVideo) {
      this.log('Already viewing video, skipping');
      return;
    }

    try {
      this.isViewingVideo = true;

      // Re-establish video WebSocket connection only (independent of audio)
      await this.initializeVideoConnection();

      // Wait for data channel to be ready (only if not already ready)
      if (!this.isVideoConnectionReady()) {
        this.log('Waiting for video data channel to open');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        while (!this.videoDataChannel || this.videoDataChannel.readyState !== 'open') {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error('Video data channel failed to open within 5 seconds');
          }
        }
      }

      // Start cleanup interval for old video entries (like index.html)
      this.videoCleanupInterval = setInterval(() => {
        this.cleanupOldVideos();
      }, 1000); // Clean up every second

      this.log('🟢 Video viewing started');
      this.callbacks.onVideoStateChange?.('viewing', true);
    } catch (error) {
      this.handleError('🔴 Failed to start viewing video', error);
    }
  }

  /**
   * Clean up old video entries to prevent memory leaks
   */
  cleanupOldVideos() {
    const currentTime = BigInt(Date.now()) * BigInt(1000000); // nanoseconds
    const cleanupThresholdMs = 2000; // Clean up entries older than 2 seconds

    for (const [clientID, videoData] of this.receivedVideos.entries()) {
      const frameAgeMs = Number(currentTime - videoData.timestamp) / 1000000;
      if (frameAgeMs > cleanupThresholdMs) {
        // Revoke blob URL to free memory
        URL.revokeObjectURL(videoData.url);
        this.receivedVideos.delete(clientID);
        this.log('Cleaned up old video entry', { clientID, frameAgeMs });
      }
    }
  }

  /**
   * Stop viewing video
   */
  stopViewingVideo() {
    this.log('🟡 Stopping video viewing');

    this.isViewingVideo = false;

    // Stop cleanup interval
    if (this.videoCleanupInterval) {
      this.log('Clearing video cleanup interval');
      clearInterval(this.videoCleanupInterval);
      this.videoCleanupInterval = null;
    }

    // Notify UI to remove all video elements before clearing data
    this.log('Notifying UI to remove all video elements');
    this.receivedVideos.forEach((videoData, clientId) => {
      this.callbacks.onVideoSourceRemove?.(clientId);
    });

    // Clear received videos
    this.receivedVideos.forEach(videoData => {
      URL.revokeObjectURL(videoData.url);
    });
    this.receivedVideos.clear();
    this.log('Cleared all received videos');

    // Only close video connection if both sending and viewing are stopped
    if (!this.isSendingVideo && !this.isViewingVideo) {
      if (this.videoPeerConnection) {
        this.log('Closing video peer connection');
        this.videoPeerConnection.close();
        this.videoPeerConnection = null;
      }
      if (this.videoWsConnection) {
        this.log('Closing video WebSocket connection');
        this.videoWsConnection.close();
        this.videoWsConnection = null;
      }
      this.videoDataChannel = null;
    }

    this.log('🔴 Video viewing stopped');
    this.callbacks.onVideoStateChange?.('viewing', false);
  }

  /**
   * Handle audio WebSocket messages
   */
  async handleAudioMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.log('Received audio message', { type: message.type });

      switch (message.type) {
        case 'answer':
          this.log('Setting audio remote description', {
            sdp: message.sdp ? message.sdp.substring(0, 100) + '...' : 'no sdp',
            fullSdp: message.sdp // Log full SDP for debugging
          });
          await this.audioPeerConnection.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: message.sdp
          }));
          this.log('Audio remote description set successfully');
          break;

        case 'ice-candidate':
          this.log('Adding audio ICE candidate');
          const candidate = JSON.parse(message.candidate);
          await this.audioPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          this.log('Audio ICE candidate added successfully');
          break;

        default:
          this.log('Unknown audio message type', { type: message.type });
      }
    } catch (error) {
      this.handleError('Audio message handling error', error);
    }
  }

  /**
   * Handle video message
   */
  handleVideoMessage(message) {
    switch (message.type) {
      case 'answer':
        console.log('Received video answer');
        if (this.videoPeerConnection) {
          const answer = new RTCSessionDescription({
            type: 'answer',
            sdp: message.sdp
          });
          this.videoPeerConnection.setRemoteDescription(answer).then(() => {
            console.log('Video answer set successfully');
          }).catch(error => {
            console.error('Error setting video answer:', error);
          });
        }
        break;
      case 'ice-candidate':
        console.log('Received video ICE candidate');
        if (this.videoPeerConnection && this.videoPeerConnection.remoteDescription) {
          const candidate = JSON.parse(message.candidate);
          this.videoPeerConnection.addIceCandidate(candidate).then(() => {
            console.log('Video ICE candidate added successfully');
          }).catch(error => {
            console.error('Error adding video ICE candidate:', error);
          });
        }
        break;
      case 'error':
        console.error('Video connection error:', message.message);
        break;
      default:
        console.log('Unknown video message type:', message.type);
    }
  }

  /**
   * Handle incoming video message
   */
  handleIncomingVideoMessage(data) {
    try {
      // Basic validation - check if data is too small for a valid frame
      if (!data || data.byteLength < 20) { // Minimum size for header + some data
        return; // Keep last good image
      }

      const view = new DataView(data);
      const clientIDLen = view.getUint32(0, false); // Big endian

      // Validate client ID length
      if (clientIDLen <= 0 || clientIDLen > 1000 || clientIDLen + 16 > data.byteLength) {
        return; // Keep last good image
      }

      const clientID = new TextDecoder().decode(data.slice(4, 4 + clientIDLen));

      // Validate client ID is not empty
      if (!clientID || clientID.trim() === '') {
        return; // Keep last good image
      }

      const timestamp = view.getBigUint64(4 + clientIDLen, false);
      const frameNumber = view.getUint32(12 + clientIDLen, false);
      const videoData = data.slice(16 + clientIDLen);

      // Validate video data is not empty
      if (!videoData || videoData.byteLength === 0) {
        return; // Keep last good image
      }

      // Check frame age - drop frames that are too old
      const currentTime = BigInt(Date.now()) * BigInt(1000000); // nanoseconds
      const frameAgeMs = Number(currentTime - timestamp) / 1000000; // Convert to milliseconds

      if (frameAgeMs > 1000) { // 1 second threshold
        return; // Frame is too old, drop it
      }

      // Validate JPEG data by checking for JPEG header
      if (videoData.byteLength < 2) {
        return; // Not enough data for JPEG header
      }

      // Convert to Uint8Array for proper byte access
      const videoBytes = new Uint8Array(videoData);

      if (videoBytes[0] !== 0xFF || videoBytes[1] !== 0xD8) {
        return; // Not a valid JPEG, keep last good image
      }

      // Parse JPEG dimensions directly from binary data
      const dimensions = this.getJPEGDimensions(videoBytes);
      if (!dimensions) {
        return; // Could not parse dimensions, keep last good image
      }

      // Check if image dimensions are correct
      if (dimensions.width !== this.config.videoWidth || dimensions.height !== this.config.videoHeight) {
        return; // Wrong dimensions, keep last good image
      }

      // Convert video data to blob URL with proper MIME type for Firefox
      const blob = new Blob([videoData], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      // Check if this is a new video source
      const isNewVideoSource = !this.receivedVideos.has(clientID);

      // Store video data
      this.receivedVideos.set(clientID, {
        url: url,
        timestamp: timestamp,
        frameNumber: frameNumber
      });

      // Only call onVideoSourceAdd for new video sources, not for every frame
      if (isNewVideoSource) {
        this.log('New video source detected', { clientID, url });
        this.callbacks.onVideoSourceAdd?.(clientID, url);
      } else {
        // Update existing video element's src to animate the image
        // this.log('Updating existing video frame', { clientID, frameNumber });
        // The callback should handle updating the existing img src
        this.callbacks.onVideoFrameUpdate?.(clientID, url);
      }

    } catch (error) {
      this.logError('Error handling video message', error);
      // Don't update display on error - keep last good image
    }
  }

  /**
   * Send video frame (video capture loop)
   */
  sendVideoFrame() {
    if (!this.videoContext || !this.videoElement || !this.videoDataChannel || this.videoDataChannel.readyState !== 'open') {
      return;
    }

    // Check if video element is ready and has valid dimensions
    if (this.videoElement.videoWidth === 0 || this.videoElement.videoHeight === 0) {
      return; // Video not ready yet
    }

    // Draw video frame to canvas
    try {
      this.videoContext.drawImage(this.videoElement, 0, 0, this.config.videoWidth, this.config.videoHeight);
    } catch (error) {
      this.logError('Error drawing video to canvas', error);
      return;
    }

    // Convert to JPEG
    this.videoCanvas.toBlob((blob) => {
      if (blob) {
        // Create binary message with header (like index.html)
        const clientIDBytes = new TextEncoder().encode(this.clientId);
        const clientIDLen = clientIDBytes.length;
        const timestamp = BigInt(Date.now()) * BigInt(1000000); // nanoseconds

        // Calculate total message size
        const totalSize = 4 + clientIDLen + 8 + 4 + blob.size;
        const message = new ArrayBuffer(totalSize);
        const view = new DataView(message);

        // Write header
        view.setUint32(0, clientIDLen, false); // Big endian
        new Uint8Array(message, 4, clientIDLen).set(clientIDBytes);
        view.setBigUint64(4 + clientIDLen, timestamp, false);
        view.setUint32(12 + clientIDLen, this.videoFrameNumber++, false);

        // Read blob data
        const reader = new FileReader();
        reader.onload = () => {
          new Uint8Array(message, 16 + clientIDLen).set(new Uint8Array(reader.result));

          // Send via data channel
          try {
            this.videoDataChannel.send(message);
          } catch (error) {
            this.logError('Error sending video frame via data channel', error);
          }
        };
        reader.readAsArrayBuffer(blob);
      } else {
        this.logError('Failed to create video blob');
        // Safari fallback: try toDataURL method
        if (this.isSafari) {
          try {
            const dataURL = this.videoCanvas.toDataURL('image/jpeg', this.config.videoQuality);
            const base64Data = dataURL.split(',')[1];
            const binaryData = atob(base64Data);
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
              bytes[i] = binaryData.charCodeAt(i);
            }

            // Create binary message with header
            const clientIDBytes = new TextEncoder().encode(this.clientId);
            const clientIDLen = clientIDBytes.length;
            const timestamp = BigInt(Date.now()) * BigInt(1000000); // nanoseconds

            // Calculate total message size
            const totalSize = 4 + clientIDLen + 8 + 4 + bytes.length;
            const message = new ArrayBuffer(totalSize);
            const view = new DataView(message);

            // Write header
            view.setUint32(0, clientIDLen, false); // Big endian
            new Uint8Array(message, 4, clientIDLen).set(clientIDBytes);
            view.setBigUint64(4 + clientIDLen, timestamp, false);
            view.setUint32(12 + clientIDLen, this.videoFrameNumber++, false);

            // Copy image data
            new Uint8Array(message, 16 + clientIDLen).set(bytes);

            // Send via data channel
            this.videoDataChannel.send(message);
          } catch (fallbackError) {
            this.logError('Safari fallback also failed', fallbackError);
          }
        }
      }
    }, 'image/jpeg', this.config.videoQuality);
  }

  /**
   * Setup remote audio
   */
  async setupRemoteAudio(stream) {
    this.log('Setting up remote audio', {
      isListeningAudio: this.isListeningAudio,
      hasRemoteAudioElement: !!this.remoteAudioElement,
      isSafari: this.isSafari,
      streamTracks: stream ? stream.getTracks().length : 0,
      streamId: stream ? stream.id : 'no-stream',
      streamActive: stream ? stream.active : false
    });

    if (!this.isListeningAudio) {
      this.log('Skipping remote audio setup - not listening');
      return;
    }

    if (!stream) {
      this.logError('No stream provided to setupRemoteAudio');
      return;
    }

    // Log stream details
    this.log('Stream details', {
      id: stream.id,
      active: stream.active,
      tracks: stream.getTracks().map(t => ({
        id: t.id,
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      }))
    });

    // Add stream event listeners for debugging
    stream.onaddtrack = (event) => {
      this.log('Stream track added', { track: event.track });
    };
    stream.onremovetrack = (event) => {
      this.log('Stream track removed', { track: event.track });
    };
    stream.onended = () => {
      this.log('Stream ended');
    };

    // Add track event listeners
    stream.getTracks().forEach(track => {
      track.onended = () => {
        this.log('Track ended', { trackId: track.id, kind: track.kind });
      };
      track.onmute = () => {
        this.log('Track muted', { trackId: track.id, kind: track.kind });
      };
      track.onunmute = () => {
        this.log('Track unmuted', { trackId: track.id, kind: track.kind });
      };

      // Add MediaStreamTrack event listeners to check for actual data
      if (track.kind === 'audio') {
        this.log('Setting up audio track monitoring', { trackId: track.id });

        // Check if track has enabled state
        this.log('Audio track state', {
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        });

        // Monitor track state changes
        const checkTrackState = () => {
          /*this.log('Audio track state check', {
            id: track.id,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          });*/
        };

        // Check immediately and then every 2 seconds
        checkTrackState();
        const trackStateInterval = setInterval(() => {
          if (track.readyState === 'ended') {
            clearInterval(trackStateInterval);
            return;
          }
          checkTrackState();
        }, 2000);
      }
    });

    if (this.isSafari) {
      this.log('Initializing Safari audio context for remote audio');
      await this.initializeSafariAudioContext();
    }

    // Clear existing audio element
    if (this.remoteAudioElement) {
      this.log('Clearing existing audio element');
      this.remoteAudioElement.srcObject = null;
      if (document.body.contains(this.remoteAudioElement)) {
        document.body.removeChild(this.remoteAudioElement);
      }
    }

    // Create new Audio element
    this.log('Creating new audio element');
    this.remoteAudioElement = new Audio();
    this.remoteAudioElement.autoplay = true;

    // Set the stream with a small delay to ensure proper initialization
    setTimeout(() => {
      this.log('Setting srcObject on audio element');
      this.remoteAudioElement.srcObject = stream;
      this.log('srcObject set successfully');

      // Log audio element properties
      this.log('Audio element properties', {
        srcObject: !!this.remoteAudioElement.srcObject,
        autoplay: this.remoteAudioElement.autoplay,
        volume: this.remoteAudioElement.volume,
        muted: this.remoteAudioElement.muted,
        paused: this.remoteAudioElement.paused,
        readyState: this.remoteAudioElement.readyState,
        networkState: this.remoteAudioElement.networkState
      });

      // Safari needs higher volume and specific audio context handling
      if (this.isSafari) {
        this.remoteAudioElement.volume = 1.0;
        // Connect remote audio to Safari's audio context for proper processing
        if (this.safariAudioContext && !this.safariUserInteractionNeeded) {
          try {
            this.safariRemoteSource = this.safariAudioContext.createMediaStreamSource(stream);
            this.safariRemoteGain = this.safariAudioContext.createGain();
            this.safariRemoteGain.gain.value = 2.0; // Volume boost for Safari
            this.safariRemoteSource.connect(this.safariRemoteGain);
            this.safariRemoteGain.connect(this.safariAudioContext.destination);
            this.log('Safari: Connected remote audio to audio context');
          } catch (error) {
            this.logError('Safari: Failed to connect remote audio to context', error);
          }
        }
      } else {
        this.remoteAudioElement.volume = 1.0;
        this.log('Remote audio volume set', { volume: 1.0 });
      }

      this.log('Attempting to play remote audio');
      this.remoteAudioElement.play().then(() => {
        this.log('Remote audio started successfully');
        // Log audio state after successful play
        this.log('Audio state after play', {
          paused: this.remoteAudioElement.paused,
          currentTime: this.remoteAudioElement.currentTime,
          duration: this.remoteAudioElement.duration,
          volume: this.remoteAudioElement.volume,
          muted: this.remoteAudioElement.muted,
          readyState: this.remoteAudioElement.readyState,
          networkState: this.remoteAudioElement.networkState
        });
      }).catch(e => {
        this.log('Audio autoplay blocked, adding click handler', { error: e.message });
        // Add click handler to enable audio
        const enableAudio = async () => {
          try {
            // Resume Safari audio context if needed
            if (this.isSafari && this.safariAudioContext && this.safariAudioContext.state === 'suspended') {
              this.log('Resuming Safari audio context during user interaction');
              await this.safariAudioContext.resume();
              this.safariUserInteractionNeeded = false;
            }

            // Try to play the audio
            await this.remoteAudioElement.play();
            this.log('Audio enabled after user interaction');

            // Remove the event listener
            document.removeEventListener('click', enableAudio);
            document.removeEventListener('touchstart', enableAudio);
            document.removeEventListener('keydown', enableAudio);
          } catch (err) {
            this.logError('Failed to enable audio after user interaction', err);
          }
        };

        // Add multiple event listeners for better user interaction detection
        document.addEventListener('click', enableAudio, { once: true });
        document.addEventListener('touchstart', enableAudio, { once: true });
        document.addEventListener('keydown', enableAudio, { once: true });
      });

      // Add comprehensive event listeners for debugging
      this.remoteAudioElement.addEventListener('loadstart', () => {
        this.log('Audio loadstart event');
      });
      this.remoteAudioElement.addEventListener('durationchange', () => {
        this.log('Audio durationchange event', { duration: this.remoteAudioElement.duration });
      });
      this.remoteAudioElement.addEventListener('loadedmetadata', () => {
        this.log('Audio loadedmetadata event', {
          duration: this.remoteAudioElement.duration,
          videoWidth: this.remoteAudioElement.videoWidth,
          videoHeight: this.remoteAudioElement.videoHeight
        });
      });
      this.remoteAudioElement.addEventListener('loadeddata', () => {
        this.log('Audio loadeddata event');
      });
      this.remoteAudioElement.addEventListener('progress', () => {
        this.log('Audio progress event');
      });
      this.remoteAudioElement.addEventListener('canplay', () => {
        this.log('Audio canplay event');
      });
      this.remoteAudioElement.addEventListener('canplaythrough', () => {
        this.log('Audio canplaythrough event');
      });
      this.remoteAudioElement.addEventListener('play', () => {
        this.log('Audio play event');
      });
      this.remoteAudioElement.addEventListener('playing', () => {
        this.log('Audio playing event');
      });
      this.remoteAudioElement.addEventListener('waiting', () => {
        this.log('Audio waiting event');
      });
      this.remoteAudioElement.addEventListener('seeking', () => {
        this.log('Audio seeking event');
      });
      this.remoteAudioElement.addEventListener('seeked', () => {
        this.log('Audio seeked event');
      });
      this.remoteAudioElement.addEventListener('timeupdate', () => {
      });
      this.remoteAudioElement.addEventListener('ended', () => {
        this.log('Audio ended event');
      });
      this.remoteAudioElement.addEventListener('ratechange', () => {
        this.log('Audio ratechange event', { playbackRate: this.remoteAudioElement.playbackRate });
      });
      this.remoteAudioElement.addEventListener('volumechange', () => {
        this.log('Audio volumechange event', { volume: this.remoteAudioElement.volume });
      });
      this.remoteAudioElement.addEventListener('suspend', () => {
        this.log('Audio suspend event');
      });
      this.remoteAudioElement.addEventListener('abort', () => {
        this.log('Audio abort event');
      });
      this.remoteAudioElement.addEventListener('error', (e) => {
        this.logError('Audio error event', e);
        this.log('Audio error details', {
          error: this.remoteAudioElement.error,
          errorCode: this.remoteAudioElement.error ? this.remoteAudioElement.error.code : null,
          errorMessage: this.remoteAudioElement.error ? this.remoteAudioElement.error.message : null
        });
      });
      this.remoteAudioElement.addEventListener('stalled', () => {
        this.log('Audio stalled event');
      });
      this.remoteAudioElement.addEventListener('emptied', () => {
        this.log('Audio emptied event');
      });

      // Add periodic audio state logging to see if audio is progressing
      const audioStateInterval = setInterval(() => {
        if (this.remoteAudioElement && !this.remoteAudioElement.paused) {
          /*this.log('Audio state check', {
            currentTime: this.remoteAudioElement.currentTime,
            duration: this.remoteAudioElement.duration,
            volume: this.remoteAudioElement.volume,
            muted: this.remoteAudioElement.muted,
            readyState: this.remoteAudioElement.readyState,
            networkState: this.remoteAudioElement.networkState,
            hasSrcObject: !!this.remoteAudioElement.srcObject,
            srcObjectTracks: this.remoteAudioElement.srcObject ? this.remoteAudioElement.srcObject.getTracks().length : 0
          });*/
        } else {
          clearInterval(audioStateInterval);
        }
      }, 1000); // Log every second
    }, 100); // Small delay to ensure audio element is ready
  }

  /**
   * Safari-specific audio context management
   */
  async initializeSafariAudioContext() {
    this.log('Initializing Safari audio context', {
      isSafari: this.isSafari,
      hasExistingContext: !!this.safariAudioContext
    });

    if (!this.isSafari || this.safariAudioContext) {
      this.log('Skipping Safari audio context initialization');
      return;
    }

    try {
      this.safariAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.log('Safari audio context created', {
        state: this.safariAudioContext.state,
        sampleRate: this.safariAudioContext.sampleRate
      });

      if (this.safariAudioContext.state === 'suspended') {
        this.log('Safari audio context suspended, waiting for user interaction');
        this.safariUserInteractionNeeded = true;

        // Create a more robust user interaction handler
        const resumeAudio = async (event) => {
          try {
            this.log('User interaction detected, resuming Safari audio context');

            // Resume the audio context
            await this.safariAudioContext.resume();
            this.safariUserInteractionNeeded = false;

            this.log('Safari audio context resumed successfully', {
              state: this.safariAudioContext.state
            });

            // Remove all event listeners
            document.removeEventListener('click', resumeAudio);
            document.removeEventListener('touchstart', resumeAudio);
            document.removeEventListener('keydown', resumeAudio);

            // If we have a remote audio element, try to play it
            if (this.remoteAudioElement && this.remoteAudioElement.paused) {
              this.log('Attempting to play remote audio after context resume');
              await this.remoteAudioElement.play();
              this.log('Remote audio started after context resume');
            }
          } catch (error) {
            this.handleError('🔴 Failed to resume Safari audio context', error);
          }
        };

        // Add multiple event listeners for better user interaction detection
        document.addEventListener('click', resumeAudio, { once: true });
        document.addEventListener('touchstart', resumeAudio, { once: true });
        document.addEventListener('keydown', resumeAudio, { once: true });

        this.log('Added user interaction listeners for Safari audio context');
      } else {
        this.log('Safari audio context already active');
      }
    } catch (error) {
      this.logError('Failed to initialize Safari audio context', error);
      this.handleError('Failed to initialize Safari audio context', error);
    }
  }

  /**
   * Safari-specific audio cleanup
   */
  cleanupSafariAudio(closeContext = false) {
    this.log('Cleaning up Safari audio', {
      isSafari: this.isSafari,
      hasAudioContext: !!this.safariAudioContext,
      closeContext,
      isSendingAudio: this.isSendingAudio,
      isListeningAudio: this.isListeningAudio
    });

    if (!this.isSafari || !this.safariAudioContext) {
      this.log('No Safari audio context to clean up');
      return;
    }

    try {
      if (this.safariRemoteSource) {
        this.log('Disconnecting Safari remote source');
        this.safariRemoteSource.disconnect();
        this.safariRemoteSource = null;
      }
      if (this.safariRemoteGain) {
        this.log('Disconnecting Safari remote gain');
        this.safariRemoteGain.disconnect();
        this.safariRemoteGain = null;
      }
      if (this.safariGainNode) {
        this.log('Disconnecting Safari gain node');
        this.safariGainNode.disconnect();
        this.safariGainNode = null;
      }
      if (this.safariAnalyser) {
        this.log('Disconnecting Safari analyser');
        this.safariAnalyser.disconnect();
        this.safariAnalyser = null;
      }

      if (closeContext || (!this.isSendingAudio && !this.isListeningAudio)) {
        this.log('Closing Safari audio context');
        this.safariAudioContext.close();
        this.safariAudioContext = null;
        this.safariUserInteractionNeeded = false;
      }
      this.log('Safari audio cleanup completed');
    } catch (error) {
      this.logError('Safari audio cleanup error', error);
      this.handleError('Safari audio cleanup error', error);
    }
  }

  /**
   * Handle errors
   */
  handleError(message, error) {
    this.logError(`TankRTC Error: ${message}`, error);
    this.callbacks.onError?.(message, error);
  }

  /**
   * Get connection state
   */
  getConnectionState() {
    const state = {
      isConnected: this.isConnected,
      isSendingAudio: this.isSendingAudio,
      isListeningAudio: this.isListeningAudio,
      isSendingVideo: this.isSendingVideo,
      isViewingVideo: this.isViewingVideo,
      clientId: this.clientId
    };
    this.log('Getting connection state', state);
    return state;
  }

  /**
   * Parse JPEG dimensions directly from binary data
   */
  getJPEGDimensions(data) {
    try {
      let offset = 2; // Skip JPEG SOI marker (0xFF 0xD8)

      while (offset < data.byteLength - 1) {
        // Look for JPEG markers (0xFF followed by non-zero byte)
        if (data[offset] === 0xFF && data[offset + 1] !== 0x00) {
          const marker = data[offset + 1];

          // SOF0, SOF1, SOF2 markers contain image dimensions
          if (marker >= 0xC0 && marker <= 0xC3) {
            if (offset + 9 < data.byteLength) {
              const height = (data[offset + 5] << 8) | data[offset + 6];
              const width = (data[offset + 7] << 8) | data[offset + 8];
              return { width, height };
            }
          }

          // Skip marker and length
          if (offset + 2 < data.byteLength) {
            const length = (data[offset + 2] << 8) | data[offset + 3];
            offset += 2 + length;
          } else {
            break;
          }
        } else {
          offset++;
        }
      }
    } catch (error) {
      this.logError('Error parsing JPEG dimensions', error);
    }
    return null;
  }

  /**
   * Initialize only video connection (independent of audio)
   */
  async initializeVideoConnection() {
    this.log('Initializing video connection');

    // Reuse existing connection if it's already open
    if (this.videoWsConnection && this.videoWsConnection.readyState === WebSocket.OPEN &&
      this.videoPeerConnection && this.videoDataChannel && this.videoDataChannel.readyState === 'open') {
      console.log('Reusing existing video connection');
      return;
    }

    const videoWsUrl = `${this.config.serverUrl}/webrtc-video`;

    // Create WebSocket connection for video
    this.videoWsConnection = new WebSocket(videoWsUrl);

    this.videoWsConnection.onopen = () => {
      this.sendVideoOffer();
    };

    this.videoWsConnection.onmessage = (event) => {
      if (!event.data) {
        console.log('No data in video message', event);
        return;
      }
      const message = JSON.parse(event.data);
      this.handleVideoMessage(message);
    };

    this.videoWsConnection.onclose = () => {
      this.videoWsConnection = null;
    };

    this.videoWsConnection.onerror = (error) => {
      console.error('Video WebSocket error:', error);
    };

    // Create video peer connection
    this.videoPeerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    // Handle ICE candidates
    this.videoPeerConnection.onicecandidate = (event) => {
      if (event.candidate && this.videoWsConnection && this.videoWsConnection.readyState === WebSocket.OPEN) {
        this.videoWsConnection.send(JSON.stringify({
          type: 'ice-candidate',
          clientId: this.clientId,
          candidate: JSON.stringify(event.candidate)
        }));
      }
    };

    this.videoPeerConnection.oniceconnectionstatechange = () => {
      // ICE connection state changed
    };

    this.videoPeerConnection.onconnectionstatechange = () => {
      // Connection state changed
    };
  }

  /**
   * Initialize only audio connection (independent of video)
   */
  async initializeAudioConnection() {
    if (this.audioWsConnection && this.audioWsConnection.readyState === WebSocket.OPEN) {
      return true; // Already connected
    }

    const audioWsUrl = `${this.config.serverUrl}/webrtc-audio`;

    await new Promise((resolve, reject) => {
      this.audioWsConnection = new WebSocket(audioWsUrl);

      this.audioWsConnection.onopen = async () => {
        console.log('WebSocket connected');

        // Use the pre-generated clientId
        console.log('Using client ID:', this.clientId);

        // Create peer connection
        this.audioPeerConnection = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        });

        // Monitor connection states
        this.audioPeerConnection.oniceconnectionstatechange = () => {
          if (this.audioPeerConnection.iceConnectionState === 'connected' || this.audioPeerConnection.iceConnectionState === 'completed') {
            this.isConnected = true;
            console.log('🟢 Audio Connected');
          } else if (this.audioPeerConnection.iceConnectionState === 'failed') {
            console.error('ICE connection failed!');
            this.isConnected = false;
            console.log('🔴 AudioConnection failed');
          }
        };

        this.audioPeerConnection.onconnectionstatechange = () => {
          console.log('Connection state:', this.audioPeerConnection.connectionState);
          if (this.audioPeerConnection.connectionState === 'connected') {
            console.log('WebRTC connection established!');
          } else if (this.audioPeerConnection.connectionState === 'failed' || this.audioPeerConnection.connectionState === 'disconnected') {
            this.isConnected = false;
            console.log('🔴 Audio Connection failed');
          }
        };

        // Handle incoming tracks (mixed audio from server)
        this.audioPeerConnection.ontrack = (event) => {
          this.log('Received remote track from server (mixed audio)', {
            streams: event.streams.length,
            trackKind: event.track.kind
          });
          // Always setup audio when tracks are received - the server only sends audio
          // to clients that have requested it (listening clients)
          this.setupRemoteAudio(event.streams[0]);
        };

        // Handle ICE candidates
        this.audioPeerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            this.log('Sending audio ICE candidate', { candidate: event.candidate });
            this.audioWsConnection.send(JSON.stringify({
              type: 'ice-candidate',
              clientId: this.clientId,
              candidate: JSON.stringify(event.candidate)
            }));
          }
        };

        resolve(true);
      };

      this.audioWsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };

      this.audioWsConnection.onclose = (event) => {
        this.log('🔴 Audio Disconnected');
        this.isConnected = false;
      };

      this.audioWsConnection.onmessage = this.handleAudioMessage.bind(this);;
    });
  }

  // Reset peer connection when changing modes
  async resetPeerConnection() {
    if (this.audioPeerConnection) {
      this.audioPeerConnection.close();
      this.audioPeerConnection = null;
    }
    return await this.createPeerConnection();
  }

  // Create peer connection
  async createPeerConnection() {
    if (this.audioPeerConnection) {
      return this.audioPeerConnection;
    }

    this.audioPeerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      iceCandidatePoolSize: 10
    });

    // Safari-specific: Pre-configure audio transceiver to prevent duplicates
    if (this.isSafari && this.isListeningAudio) {
      this.audioPeerConnection.addTransceiver('audio', { direction: 'recvonly' });
      console.log('Safari: Pre-configured audio transceiver for receiving');
    }

    // Monitor connection states
    this.audioPeerConnection.oniceconnectionstatechange = () => {
      if (this.audioPeerConnection.iceConnectionState === 'connected' || this.audioPeerConnection.iceConnectionState === 'completed') {
        this.isConnected = true;
        console.log('🟢 Audio Connected');
      } else if (this.audioPeerConnection.iceConnectionState === 'failed') {
        this.isConnected = false;
        console.error('🔴 Audio ICE connection failed');
      }
    };

    this.audioPeerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.audioPeerConnection.connectionState);
      if (this.audioPeerConnection.connectionState === 'connected') {
        console.log('WebRTC connection established!');
      } else if (this.audioPeerConnection.connectionState === 'failed' || this.audioPeerConnection.connectionState === 'disconnected') {
        this.isConnected = false;
        console.error('🔴 Audio connection failed');
      }
    };

    // Handle incoming tracks (mixed audio from server)
    this.audioPeerConnection.ontrack = (event) => {
      console.log('Received remote track from server (mixed audio)');
      // Always setup audio when tracks are received - the server only sends audio
      // to clients that have requested it (listening clients)
      this.setupRemoteAudio(event.streams[0]);
    };

    // Handle ICE candidates
    this.audioPeerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.audioWsConnection.send(JSON.stringify({
          type: 'ice-candidate',
          clientId: this.clientId,
          candidate: JSON.stringify(event.candidate)
        }));
      }
    };

    return this.audioPeerConnection;
  }
}

// Export for ES6 modules
export default TankRTC;

// Export for UMD/global usage
if (typeof window !== 'undefined') {
  window.TankRTC = TankRTC;
}