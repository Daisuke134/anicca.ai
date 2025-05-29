import { VertexAI } from '@google-cloud/vertexai';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { 
  GeminiLiveSession, 
  SessionContext, 
  ScreenFrame, 
  CommentaryResponse 
} from '../types';
import { ImageProcessor } from '../utils/imageProcessor';

export class GeminiLiveService extends EventEmitter {
  private vertexAI: VertexAI;
  private sessions: Map<string, GeminiLiveSession> = new Map();
  private maxContextHistory: number;

  constructor(projectId: string, location: string, maxContextHistory: number = 50) {
    super();
    this.vertexAI = new VertexAI({ project: projectId, location });
    this.maxContextHistory = maxContextHistory;
  }

  async createSession(sessionId: string): Promise<GeminiLiveSession> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const context: SessionContext = {
      sessionId,
      startTime: Date.now(),
      frameCount: 0,
      lastActivity: Date.now(),
      contextHistory: []
    };

    // Initialize WebSocket connection to Gemini Live API
    const websocket = await this.initializeWebSocket(sessionId);

    const session: GeminiLiveSession = {
      sessionId,
      websocket,
      isActive: true,
      context
    };

    this.sessions.set(sessionId, session);
    
    console.log(`Created Gemini Live session: ${sessionId}`);
    this.emit('session_started', { sessionId });
    
    return session;
  }

  async processScreenFrame(sessionId: string, frame: ScreenFrame): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not found or inactive`);
    }

    try {
      // Process and optimize the image
      const processedFrame = await ImageProcessor.processFrame(frame);
      const base64Image = ImageProcessor.encodeToBase64(processedFrame.imageData);

      // Update session context
      session.context.frameCount++;
      session.context.lastActivity = Date.now();

      // Create context-aware prompt
      const prompt = this.createContextualPrompt(session.context, processedFrame);

      // Send to Gemini Live API via WebSocket
      const message = {
        type: 'screen_analysis',
        timestamp: Date.now(),
        sessionId,
        content: {
          image: base64Image,
          prompt,
          context: session.context.contextHistory.slice(-5) // Last 5 interactions
        }
      };

      if (session.websocket.readyState === WebSocket.OPEN) {
        session.websocket.send(JSON.stringify(message));
      } else {
        throw new Error('WebSocket connection not ready');
      }

    } catch (error) {
      console.error(`Error processing frame for session ${sessionId}:`, error);
      this.emit('error', { sessionId, error });
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.isActive = false;
    
    if (session.websocket && session.websocket.readyState === WebSocket.OPEN) {
      session.websocket.close();
    }

    this.sessions.delete(sessionId);
    console.log(`Ended session: ${sessionId}`);
    this.emit('session_ended', { sessionId });
  }

  private async initializeWebSocket(sessionId: string): Promise<WebSocket> {
    // Note: This is a conceptual implementation
    // The actual Gemini Live API WebSocket endpoint would be used here
    const wsUrl = `wss://gemini-live-api.googleapis.com/v1/sessions`;
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json'
      }
    });

    ws.on('open', () => {
      console.log(`WebSocket connected for session ${sessionId}`);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        this.handleGeminiResponse(sessionId, response);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      this.emit('error', { sessionId, error });
    });

    ws.on('close', () => {
      console.log(`WebSocket closed for session ${sessionId}`);
    });

    return ws;
  }

  private handleGeminiResponse(sessionId: string, response: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const commentary: CommentaryResponse = {
        text: response.content || response.text || '',
        timestamp: Date.now(),
        confidence: response.confidence || 0.9
      };

      // Update context history
      session.context.contextHistory.push(commentary.text);
      
      // Trim context history if too long
      if (session.context.contextHistory.length > this.maxContextHistory) {
        session.context.contextHistory = session.context.contextHistory.slice(-this.maxContextHistory);
      }

      this.emit('commentary_generated', { sessionId, commentary });

    } catch (error) {
      console.error(`Error handling Gemini response for session ${sessionId}:`, error);
    }
  }

  private createContextualPrompt(context: SessionContext, frame: ScreenFrame): string {
    const recentContext = context.contextHistory.slice(-3).join(' ');
    
    return `You are a real-time screen narrator providing live commentary on what's happening on screen. 
    
Current context from previous observations: ${recentContext}

Please analyze this screen capture and provide a brief, natural commentary about what you see, focusing on:
1. Any changes from previous observations
2. Current activities or applications visible
3. User interactions or workflow patterns
4. Notable elements or content

Keep the commentary conversational, engaging, and under 50 words. 
Frame count: ${context.frameCount}
Time since start: ${Math.round((Date.now() - context.startTime) / 1000)}s`;
  }

  private async getAccessToken(): Promise<string> {
    // Implementation would get OAuth token for Gemini API
    // This is a placeholder - actual implementation would use Google Auth
    return 'placeholder_token';
  }

  getSessionInfo(sessionId: string): SessionContext | null {
    const session = this.sessions.get(sessionId);
    return session ? session.context : null;
  }

  getAllSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session ? session.isActive : false;
  }
} 