/**
 * Tank RTC SDK TypeScript Definitions
 * @version 1.0.0
 */

export interface TankRTCConfig {
  /** WebSocket server URL */
  serverUrl?: string;
  /** Video frame rate (frames per second) */
  videoFrameRate?: number;
  /** Video width in pixels */
  videoWidth?: number;
  /** Video height in pixels */
  videoHeight?: number;
  /** JPEG quality (0.1-1.0) */
  videoQuality?: number;
  /** Audio volume (0.0-1.0) */
  audioVolume?: number;
  /** Position update frequency in milliseconds */
  positionUpdateInterval?: number;
  /** Maximum hearing/viewing range */
  maxHearingRange?: number;
  /** WebRTC ICE servers */
  iceServers?: RTCIceServer[];
}

export interface TankRTCConnectionState {
  /** Whether connected to server */
  isConnected: boolean;
  /** Whether sending audio */
  isSendingAudio: boolean;
  /** Whether listening to audio */
  isListeningAudio: boolean;
  /** Whether sending video */
  isSendingVideo: boolean;
  /** Whether viewing video */
  isViewingVideo: boolean;
  /** Client ID */
  clientId: string;
  /** Current position */
  position: { x: number; z: number };
}

export type TankRTCEvent =
  | 'onConnect'
  | 'onDisconnect'
  | 'onVideoSourceAdd'
  | 'onVideoSourceRemove'
  | 'onAudioStateChange'
  | 'onVideoStateChange'
  | 'onError';

export type TankRTCEventCallback =
  | (() => void) // onConnect, onDisconnect
  | ((clientId: string) => void) // onVideoSourceAdd, onVideoSourceRemove
  | ((type: 'sending' | 'listening', isActive: boolean) => void) // onAudioStateChange
  | ((type: 'sending' | 'viewing', isActive: boolean) => void) // onVideoStateChange
  | ((message: string, error: Error) => void); // onError

export declare class TankRTC {
  constructor(config?: TankRTCConfig);

  /**
   * Set event callback handler
   */
  on(event: TankRTCEvent, callback: TankRTCEventCallback): TankRTC;

  /**
   * Connect to the Tank RTC server
   */
  connect(): Promise<boolean>;

  /**
   * Disconnect from the server
   */
  disconnect(): void;

  /**
   * Get current connection state
   */
  getConnectionState(): TankRTCConnectionState;

  /**
   * Set client position in 2D space
   */
  setPosition(x: number, z: number): void;

  /**
   * Manually update position on server
   */
  updatePosition(): Promise<void>;

  /**
   * Bind audio element for receiving mixed audio
   */
  bindAudioElement(audioElement: HTMLAudioElement): void;

  /**
   * Start sending audio from microphone
   */
  startSendingAudio(): Promise<void>;

  /**
   * Stop sending audio
   */
  stopSendingAudio(): void;

  /**
   * Start listening to mixed audio
   */
  startListeningAudio(): Promise<void>;

  /**
   * Stop listening to audio
   */
  stopListeningAudio(): void;

  /**
   * Bind img element for displaying video from specific client
   */
  bindVideoElement(imgElement: HTMLImageElement, clientId: string): void;

  /**
   * Start sending video from camera
   */
  startSendingVideo(): Promise<void>;

  /**
   * Stop sending video
   */
  stopSendingVideo(): void;

  /**
   * Start viewing video from other clients
   */
  startViewingVideo(): Promise<void>;

  /**
   * Stop viewing video
   */
  stopViewingVideo(): void;
}

export default TankRTC;