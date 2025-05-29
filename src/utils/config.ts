import dotenv from 'dotenv';
import { AppConfig } from '../types';

dotenv.config();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  geminiApiKey: process.env.GOOGLE_API_KEY || '',
  projectId: process.env.PROJECT_ID || '',
  location: process.env.LOCATION || 'us-central1',
  captureInterval: parseInt(process.env.CAPTURE_INTERVAL_MS || '1000', 10),
  maxContextHistory: parseInt(process.env.MAX_CONTEXT_HISTORY || '50', 10),
};

export const validateConfig = (): void => {
  const required = ['geminiApiKey', 'projectId'];
  const missing = required.filter(key => !config[key as keyof AppConfig]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

export const audioSettings = {
  voice: process.env.DEFAULT_VOICE || 'en-US-Neural2-D',
  language: process.env.DEFAULT_LANGUAGE || 'en-US',
  speed: parseFloat(process.env.SPEECH_SPEED || '1.0'),
  pitch: parseFloat(process.env.SPEECH_PITCH || '0.0'),
};

export const wsSettings = {
  heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000', 10),
  timeout: parseInt(process.env.WS_TIMEOUT || '60000', 10),
}; 