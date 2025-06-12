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

// User Profile
export interface UserProfile {
  id?: number;
  emailBehavior: string;
  docsBehavior: string;
  youtubeLimit: string;
  workStyle: string;
  goals: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserProfileQuestion {
  id: string;
  label: string;
  placeholder: string;
  value: string;
} 