import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { ScreenCaptureService } from './services/screenCapture';
import { GeminiLiveService } from './services/geminiLive';
import { AudioOutputService } from './services/audioOutput';
import { ImageProcessor } from './utils/imageProcessor';
import { config, validateConfig, audioSettings } from './utils/config';
import { ScreenFrame, CommentaryResponse } from './types';

class AIScreenNarrator {
  private app: express.Application;
  private server: any;
  private io: Server;
  private screenCapture: ScreenCaptureService;
  private geminiService: GeminiLiveService;
  private audioService: AudioOutputService;
  private currentSessionId: string | null = null;
  private lastFrame: ScreenFrame | null = null;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Initialize services
    this.screenCapture = new ScreenCaptureService(config.captureInterval);
    this.geminiService = new GeminiLiveService(
      config.projectId, 
      config.location, 
      config.maxContextHistory
    );
    this.audioService = new AudioOutputService(audioSettings);

    this.setupRoutes();
    this.setupSocketHandlers();
    this.setupServiceEventHandlers();
  }

  private setupRoutes(): void {
    // Serve static files for the web interface
    this.app.use(express.static('public'));
    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        services: {
          screenCapture: this.screenCapture.isActive(),
          geminiSession: this.currentSessionId !== null,
          audioService: this.audioService.isAudioPlaying()
        },
        timestamp: new Date().toISOString()
      });
    });

    // Get current session info
    this.app.get('/session', (req, res) => {
      if (!this.currentSessionId) {
        return res.status(404).json({ error: 'No active session' });
      }

      const sessionInfo = this.geminiService.getSessionInfo(this.currentSessionId);
      return res.json(sessionInfo);
    });

    // Start/stop endpoints
    this.app.post('/start', async (req, res) => {
      try {
        await this.startNarration();
        res.json({ message: 'Narration started', sessionId: this.currentSessionId });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/stop', async (req, res) => {
      try {
        await this.stopNarration();
        res.json({ message: 'Narration stopped' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('start_narration', async () => {
        try {
          await this.startNarration();
          socket.emit('narration_started', { sessionId: this.currentSessionId });
        } catch (error: any) {
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('stop_narration', async () => {
        try {
          await this.stopNarration();
          socket.emit('narration_stopped');
        } catch (error: any) {
          socket.emit('error', { message: error.message });
        }
      });

      socket.on('update_settings', (settings) => {
        if (settings.audio) {
          this.audioService.updateSettings(settings.audio);
        }
        if (settings.captureInterval) {
          this.screenCapture.updateInterval(settings.captureInterval);
        }
        socket.emit('settings_updated');
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  }

  private setupServiceEventHandlers(): void {
    // Screen capture events
    this.screenCapture.on('frame', async (frame: ScreenFrame) => {
      try {
        // Check for significant changes to avoid processing identical frames
        const hasSignificantChanges = await ImageProcessor.detectSignificantChanges(
          frame, 
          this.lastFrame
        );

        if (hasSignificantChanges && this.currentSessionId) {
          await this.geminiService.processScreenFrame(this.currentSessionId, frame);
          this.lastFrame = frame;
          
          // Emit frame data to connected clients
          this.io.emit('frame_captured', {
            timestamp: frame.timestamp,
            hasChanges: hasSignificantChanges
          });
        }
      } catch (error) {
        console.error('Error processing frame:', error);
        this.io.emit('error', { message: 'Frame processing error' });
      }
    });

    this.screenCapture.on('error', (error) => {
      console.error('Screen capture error:', error);
      this.io.emit('error', { message: 'Screen capture error' });
    });

    // Gemini service events
    this.geminiService.on('commentary_generated', async (data: { sessionId: string, commentary: CommentaryResponse }) => {
      const { sessionId, commentary } = data;
      
      try {
        // Generate audio for the commentary
        await this.audioService.generateAudio(commentary);
        
        // Emit commentary to all connected clients
        this.io.emit('commentary', {
          sessionId,
          text: commentary.text,
          timestamp: commentary.timestamp,
          confidence: commentary.confidence
        });

        console.log(`Commentary: ${commentary.text}`);
      } catch (error) {
        console.error('Error processing commentary:', error);
      }
    });

    this.geminiService.on('session_started', (data) => {
      console.log('Gemini session started:', data.sessionId);
      this.io.emit('session_started', data);
    });

    this.geminiService.on('session_ended', (data) => {
      console.log('Gemini session ended:', data.sessionId);
      this.io.emit('session_ended', data);
    });

    this.geminiService.on('error', (error) => {
      console.error('Gemini service error:', error);
      this.io.emit('error', { message: 'AI service error' });
    });

    // Audio service events
    this.audioService.on('audio_finished', (commentary) => {
      this.io.emit('audio_finished', { timestamp: commentary.timestamp });
    });

    this.audioService.on('audio_error', (data) => {
      console.error('Audio error:', data.error);
      this.io.emit('error', { message: 'Audio playback error' });
    });
  }

  private async startNarration(): Promise<void> {
    if (this.currentSessionId) {
      throw new Error('Narration is already running');
    }

    // Generate unique session ID
    this.currentSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Create Gemini Live session
      await this.geminiService.createSession(this.currentSessionId);
      
      // Start screen capture
      await this.screenCapture.startCapture();
      
      console.log('AI Screen Narration started successfully');
    } catch (error) {
      this.currentSessionId = null;
      throw error;
    }
  }

  private async stopNarration(): Promise<void> {
    if (!this.currentSessionId) {
      return;
    }

    try {
      // Stop screen capture
      this.screenCapture.stopCapture();
      
      // End Gemini session
      await this.geminiService.endSession(this.currentSessionId);
      
      // Stop audio
      await this.audioService.stopAudio();
      
      this.currentSessionId = null;
      this.lastFrame = null;
      
      console.log('AI Screen Narration stopped');
    } catch (error) {
      console.error('Error stopping narration:', error);
      throw error;
    }
  }

  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();
      
      // Start the server
      this.server.listen(config.port, () => {
        console.log(`🚀 AI Screen Narrator running on port ${config.port}`);
        console.log(`📱 Open http://localhost:${config.port} to access the interface`);
        console.log(`🤖 Gemini Live API integration ready`);
        console.log(`🎤 Audio synthesis enabled`);
      });
    } catch (error) {
      console.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    await this.stopNarration();
    this.server.close();
    console.log('Application stopped');
  }
}

// Create and start the application
const app = new AIScreenNarrator();

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down gracefully...');
  await app.stop();
  process.exit(0);
});

// Start the application
app.start().catch(console.error);

export default AIScreenNarrator; 