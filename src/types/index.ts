export interface ScreenFrame {
  timestamp: number;
  imageData: Buffer;
  width: number;
  height: number;
  format: string;
}

export interface CommentaryResponse {
  text: string;
  audioUrl?: string;
  timestamp: number;
  confidence: number;
}

export interface SessionContext {
  sessionId: string;
  startTime: number;
  frameCount: number;
  lastActivity: number;
  contextHistory: string[];
}

export interface GeminiLiveSession {
  sessionId: string;
  websocket: any;
  isActive: boolean;
  context: SessionContext;
}

export interface AppConfig {
  port: number;
  geminiApiKey: string;
  projectId: string;
  location: string;
  captureInterval: number;
  maxContextHistory: number;
}

export interface AudioSettings {
  voice: string;
  language: string;
  speed: number;
  pitch: number;
}

export type EventType = 
  | 'screen_capture'
  | 'commentary_generated' 
  | 'audio_ready'
  | 'session_started'
  | 'session_ended'
  | 'error';

export interface AppEvent {
  type: EventType;
  payload: any;
  timestamp: number;
} 