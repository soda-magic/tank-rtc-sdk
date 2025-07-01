import React, { useEffect, useRef, useState } from 'react';
import TankRTC from 'tank-rtc-sdk';

/**
 * TankRTC React Component
 * Demonstrates how to integrate TankRTC SDK with React
 */
function TankRTCComponent() {
  const tankRTCRef = useRef(null);
  const audioRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videos, setVideos] = useState({});
  const [position, setPosition] = useState({ x: 0, z: 0 });
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState(null);

  // Audio/Video states
  const [isSendingAudio, setIsSendingAudio] = useState(false);
  const [isListeningAudio, setIsListeningAudio] = useState(false);
  const [isSendingVideo, setIsSendingVideo] = useState(false);
  const [isViewingVideo, setIsViewingVideo] = useState(false);

  useEffect(() => {
    // Initialize TankRTC
    const tankRTC = new TankRTC({
      serverUrl: 'ws://localhost:9090',
      videoFrameRate: 30,
      videoWidth: 64,
      videoHeight: 64,
      videoQuality: 0.8,
      audioVolume: 1.0,
      positionUpdateInterval: 1000,
      maxHearingRange: 50.0
    });

    // Set up event handlers
    tankRTC.on('onConnect', () => {
      setIsConnected(true);
      setStatus('Connected');
      setError(null);
    });

    tankRTC.on('onDisconnect', () => {
      setIsConnected(false);
      setStatus('Disconnected');
      setVideos({});
    });

    tankRTC.on('onVideoSourceAdd', (clientId, url) => {
      console.log('Video source entered range:', clientId);
      setVideos(prev => ({ ...prev, [clientId]: url }));
    });

    tankRTC.on('onVideoSourceRemove', (clientId) => {
      console.log('Video source left range:', clientId);
      setVideos(prev => {
        const newVideos = { ...prev };
        delete newVideos[clientId];
        return newVideos;
      });
    });

    tankRTC.on('onAudioStateChange', (type, isActive) => {
      console.log(`Audio ${type}: ${isActive ? 'started' : 'stopped'}`);
      if (type === 'sending') {
        setIsSendingAudio(isActive);
      } else if (type === 'listening') {
        setIsListeningAudio(isActive);
      }
    });

    tankRTC.on('onVideoStateChange', (type, isActive) => {
      console.log(`Video ${type}: ${isActive ? 'started' : 'stopped'}`);
      if (type === 'sending') {
        setIsSendingVideo(isActive);
      } else if (type === 'viewing') {
        setIsViewingVideo(isActive);
      }
    });

    tankRTC.on('onError', (message, error) => {
      console.error('TankRTC Error:', message, error);
      setError(message);
    });

    // Store reference and connect
    tankRTCRef.current = tankRTC;

    // Bind audio element when it's available
    if (audioRef.current) {
      tankRTC.bindAudioElement(audioRef.current);
    }

    tankRTC.connect();

    // Cleanup on unmount
    return () => {
      if (tankRTCRef.current) {
        tankRTCRef.current.disconnect();
      }
    };
  }, []);

  // Event handlers
  const handleConnect = async () => {
    if (tankRTCRef.current) {
      try {
        setStatus('Connecting...');
        await tankRTCRef.current.connect();
      } catch (error) {
        setError(`Connection failed: ${error.message}`);
      }
    }
  };

  const handleDisconnect = () => {
    if (tankRTCRef.current) {
      tankRTCRef.current.disconnect();
    }
  };

  const handleStartSendingAudio = async () => {
    if (tankRTCRef.current) {
      try {
        await tankRTCRef.current.startSendingAudio();
      } catch (error) {
        setError(`Failed to start sending audio: ${error.message}`);
      }
    }
  };

  const handleStopSendingAudio = () => {
    if (tankRTCRef.current) {
      tankRTCRef.current.stopSendingAudio();
    }
  };

  const handleStartListeningAudio = async () => {
    if (tankRTCRef.current) {
      try {
        await tankRTCRef.current.startListeningAudio();
      } catch (error) {
        setError(`Failed to start listening audio: ${error.message}`);
      }
    }
  };

  const handleStopListeningAudio = () => {
    if (tankRTCRef.current) {
      tankRTCRef.current.stopListeningAudio();
    }
  };

  const handleStartSendingVideo = async () => {
    if (tankRTCRef.current) {
      try {
        await tankRTCRef.current.startSendingVideo();
      } catch (error) {
        setError(`Failed to start sending video: ${error.message}`);
      }
    }
  };

  const handleStopSendingVideo = () => {
    if (tankRTCRef.current) {
      tankRTCRef.current.stopSendingVideo();
    }
  };

  const handleStartViewingVideo = async () => {
    if (tankRTCRef.current) {
      try {
        await tankRTCRef.current.startViewingVideo();
      } catch (error) {
        setError(`Failed to start viewing video: ${error.message}`);
      }
    }
  };

  const handleStopViewingVideo = () => {
    if (tankRTCRef.current) {
      tankRTCRef.current.stopViewingVideo();
    }
  };

  const handlePositionChange = (axis, value) => {
    const newPosition = { ...position, [axis]: parseFloat(value) };
    setPosition(newPosition);
    if (tankRTCRef.current) {
      tankRTCRef.current.setPosition(newPosition.x, newPosition.z);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>Tank RTC - React Integration Example</h1>

      {/* Status and Error Display */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          padding: '10px',
          margin: '10px 0',
          borderRadius: '3px',
          fontWeight: 'bold',
          backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
          color: isConnected ? '#155724' : '#721c24'
        }}>
          Status: {status}
        </div>

        {error && (
          <div style={{
            padding: '10px',
            margin: '10px 0',
            borderRadius: '3px',
            backgroundColor: '#fff3cd',
            color: '#856404'
          }}>
            Error: {error}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
        <div style={{ marginBottom: '10px' }}>
          <button
            onClick={handleConnect}
            disabled={isConnected}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Connect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Disconnect
          </button>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <button
            onClick={handleStartSendingAudio}
            disabled={!isConnected || isSendingAudio}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Start Sending Audio
          </button>
          <button
            onClick={handleStopSendingAudio}
            disabled={!isConnected || !isSendingAudio}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Stop Sending Audio
          </button>
          <button
            onClick={handleStartListeningAudio}
            disabled={!isConnected || isListeningAudio}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Start Listening Audio
          </button>
          <button
            onClick={handleStopListeningAudio}
            disabled={!isConnected || !isListeningAudio}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Stop Listening Audio
          </button>
        </div>

        <div style={{ marginBottom: '10px' }}>
          <button
            onClick={handleStartSendingVideo}
            disabled={!isConnected || isSendingVideo}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Start Sending Video
          </button>
          <button
            onClick={handleStopSendingVideo}
            disabled={!isConnected || !isSendingVideo}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Stop Sending Video
          </button>
          <button
            onClick={handleStartViewingVideo}
            disabled={!isConnected || isViewingVideo}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Start Viewing Video
          </button>
          <button
            onClick={handleStopViewingVideo}
            disabled={!isConnected || !isViewingVideo}
            style={{ margin: '5px', padding: '10px 15px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Stop Viewing Video
          </button>
        </div>

        <div>
          <label style={{ marginRight: '10px' }}>
            X:
            <input
              type="number"
              value={position.x}
              onChange={(e) => handlePositionChange('x', e.target.value)}
              style={{ width: '80px', margin: '0 5px' }}
            />
          </label>
          <label>
            Z:
            <input
              type="number"
              value={position.z}
              onChange={(e) => handlePositionChange('z', e.target.value)}
              style={{ width: '80px', margin: '0 5px' }}
            />
          </label>
        </div>
      </div>

      {/* Video Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: '10px'
      }}>
        {Object.entries(videos).map(([clientId, url]) => (
          <VideoItem
            key={clientId}
            clientId={clientId}
            url={url}
          />
        ))}
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
    </div>
  );
}

/**
 * Video Item Component
 * Renders a single video stream
 */
function VideoItem({ clientId, url }) {
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '5px',
      padding: '10px',
      textAlign: 'center'
    }}>
      <img
        src={url}
        alt={`Video from ${clientId}`}
        style={{
          width: '100%',
          height: '150px',
          objectFit: 'cover',
          borderRadius: '3px'
        }}
      />
      <div style={{
        marginTop: '5px',
        fontSize: '12px',
        color: '#666'
      }}>
        Client: {clientId}
      </div>
    </div>
  );
}

export default TankRTCComponent;