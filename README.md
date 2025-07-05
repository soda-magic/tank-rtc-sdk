# Tank RTC SDK

JavaScript SDK for Tank RTC spatial audio and video server. This SDK provides easy integration for real-time spatial audio and video communication in web applications.

## Features

- **Spatial Audio**: Real-time audio communication with distance-based volume falloff
- **Spatial Video**: Real-time video communication with distance-based visibility
- **Cross-browser Support**: Works with Chrome, Firefox, Safari, and Edge
- **Safari Optimized**: Special handling for Safari's audio context requirements
- **Flexible Integration**: Works with React, Vue, vanilla JavaScript, and more
- **Multiple Formats**: ES6 modules and UMD bundles available
- **Automatic Connection Management**: Handles WebRTC connection resets for optimal performance

## Installation

### NPM (Recommended for React/Vue projects)

```bash
npm install tank-rtc-sdk
```

```javascript
import TankRTC from 'tank-rtc-sdk';

const tankRTC = new TankRTC({
  serverUrl: 'ws://localhost:9090'
});
```

### CDN (For vanilla HTML/JavaScript)

```html
<script src="https://unpkg.com/tank-rtc-sdk/dist/tank-rtc-sdk.umd.js"></script>
<script>
  const tankRTC = new TankRTC({
    serverUrl: 'ws://localhost:9090'
  });
</script>
```

### Local UMD Bundle

Download the UMD bundle and include it in your HTML:

```html
<script src="tank-rtc-sdk.umd.js"></script>
<script>
  const tankRTC = new TankRTC({
    serverUrl: 'ws://localhost:9090'
  });
</script>
```

## Quick Start

```javascript
// Create SDK instance
const tankRTC = new TankRTC({
  serverUrl: 'ws://localhost:9090'
});

// Set up event handlers
tankRTC.on('onConnect', () => {
  console.log('Connected to Tank RTC server');
});

tankRTC.on('onVideoSourceAdd', (clientId, url) => {
  console.log('Video source entered range:', clientId);
  // Create or update video element for this client
  const img = document.createElement('img');
  img.id = `video-${clientId}`;
  img.src = url; // The SDK provides the video URL
  document.body.appendChild(img);
});

tankRTC.on('onVideoSourceRemove', (clientId) => {
  console.log('Video source left range:', clientId);
  // Remove video element for this client
  const img = document.getElementById(`video-${clientId}`);
  if (img) {
    img.remove();
  }
});

// Connect to server
await tankRTC.connect();

// Start audio/video
await tankRTC.startSendingAudio();
await tankRTC.startListeningAudio();
await tankRTC.startSendingVideo();
await tankRTC.startViewingVideo();
```

## Configuration

```javascript
const config = {
  // Server connection
  serverUrl: 'ws://localhost:9090',           // WebSocket server URL

  // Video settings
  videoFrameRate: 30,                         // Frames per second
  videoWidth: 64,                             // Video width in pixels
  videoHeight: 64,                            // Video height in pixels
  videoQuality: 0.8,                          // JPEG quality (0.1-1.0)

  // Audio settings
  audioVolume: 1.0,                           // Audio volume (0.0-1.0)

  // Range
  maxHearingRange: 50.0,                      // Maximum hearing/viewing range

  // WebRTC settings
  iceServers: [                               // STUN/TURN servers
    { urls: 'stun:stun.l.google.com:19302' }
  ],

  // Debug settings
  debug: true                                 // Enable debug logging
};

const tankRTC = new TankRTC(config);
```

## API Reference

### Constructor

```javascript
new TankRTC(config)
```

Creates a new TankRTC instance with the specified configuration.

### Methods

#### Connection

- `connect()` - Connect to the Tank RTC server (establishes WebSocket connections only)
- `disconnect()` - Disconnect from the server
- `getConnectionState()` - Get current connection state

#### Audio

- `bindAudioElement(audioElement)` - Bind audio element for receiving mixed audio
- `startSendingAudio()` - Start sending audio from microphone (resets connections)
- `stopSendingAudio()` - Stop sending audio
- `startListeningAudio()` - Start listening to mixed audio (resets connections)
- `stopListeningAudio()` - Stop listening to audio

#### Video

- `startSendingVideo()` - Start sending video from camera (resets connections)
- `stopSendingVideo()` - Stop sending video
- `startViewingVideo()` - Start viewing video from other clients (resets connections)
- `stopViewingVideo()` - Stop viewing video

#### Events

- `on(event, callback)` - Set event callback handler

### Events

- `onConnect` - Fired when connected to server
- `onDisconnect` - Fired when disconnected from server
- `onVideoSourceAdd(clientId, url)` - Fired when video source enters range (provides video URL)
- `onVideoSourceRemove(clientId)` - Fired when video source leaves range
- `onAudioStateChange(type, isActive)` - Fired when audio state changes (type: 'sending'|'listening')
- `onVideoStateChange(type, isActive)` - Fired when video state changes (type: 'sending'|'viewing')
- `onError(message, error)` - Fired when an error occurs

## Examples

### Basic Audio/Video Chat

```html
<!DOCTYPE html>
<html>
<head>
    <title>Tank RTC Chat</title>
</head>
<body>
    <div>
        <button id="connect">Connect</button>
        <button id="sendAudio">Send Audio</button>
        <button id="listenAudio">Listen Audio</button>
        <button id="sendVideo">Send Video</button>
        <button id="viewVideo">View Video</button>
    </div>

    <div id="videos"></div>
    <audio id="remoteAudio" autoplay></audio>

    <script src="tank-rtc-sdk.umd.js"></script>
    <script>
        const tankRTC = new TankRTC({
            serverUrl: 'ws://localhost:9090'
        });

        // Bind audio element
        tankRTC.bindAudioElement(document.getElementById('remoteAudio'));

        // Handle video sources
        tankRTC.on('onVideoSourceAdd', (clientId, url) => {
            const img = document.createElement('img');
            img.id = `video-${clientId}`;
            img.src = url; // Use the provided URL
            img.style.width = '200px';
            img.style.height = '200px';
            img.style.border = '1px solid #ccc';
            document.getElementById('videos').appendChild(img);
        });

        tankRTC.on('onVideoSourceRemove', (clientId) => {
            const img = document.getElementById(`video-${clientId}`);
            if (img) img.remove();
        });

        // Event handlers
        document.getElementById('connect').onclick = () => tankRTC.connect();
        document.getElementById('sendAudio').onclick = () => tankRTC.startSendingAudio();
        document.getElementById('listenAudio').onclick = () => tankRTC.startListeningAudio();
        document.getElementById('sendVideo').onclick = () => tankRTC.startSendingVideo();
        document.getElementById('viewVideo').onclick = () => tankRTC.startViewingVideo();
    </script>
</body>
</html>
```

### React Integration

```jsx
import React, { useEffect, useRef, useState } from 'react';
import TankRTC from 'tank-rtc-sdk';

function TankRTCComponent() {
  const tankRTCRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videos, setVideos] = useState({});

  useEffect(() => {
    const tankRTC = new TankRTC({
      serverUrl: 'ws://localhost:9090'
    });

    tankRTC.on('onConnect', () => setIsConnected(true));
    tankRTC.on('onDisconnect', () => setIsConnected(false));

    tankRTC.on('onVideoSourceAdd', (clientId, url) => {
      setVideos(prev => ({ ...prev, [clientId]: url }));
    });

    tankRTC.on('onVideoSourceRemove', (clientId) => {
      setVideos(prev => {
        const newVideos = { ...prev };
        delete newVideos[clientId];
        return newVideos;
      });
    });

    tankRTCRef.current = tankRTC;
    tankRTC.connect();

    return () => {
      tankRTC.disconnect();
    };
  }, []);

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <div>
        {Object.entries(videos).map(([clientId, url]) => (
          <img
            key={clientId}
            src={url}
            style={{ width: 200, height: 200, border: '1px solid #ccc' }}
            alt={`Video from ${clientId}`}
          />
        ))}
      </div>
    </div>
  );
}
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## License

MIT License - see LICENSE file for details.