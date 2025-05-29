import screenshot from 'screenshot-desktop';
import { ScreenFrame } from '../types';
import { EventEmitter } from 'events';

export class ScreenCaptureService extends EventEmitter {
  private captureInterval: number;
  private isCapturing: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(captureInterval: number = 1000) {
    super();
    this.captureInterval = captureInterval;
  }

  async startCapture(): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Screen capture is already running');
    }

    this.isCapturing = true;
    console.log(`Starting screen capture with ${this.captureInterval}ms interval`);

    this.intervalId = setInterval(async () => {
      try {
        await this.captureFrame();
      } catch (error) {
        console.error('Error capturing frame:', error);
        this.emit('error', error);
      }
    }, this.captureInterval);

    // Capture initial frame immediately
    await this.captureFrame();
  }

  stopCapture(): void {
    if (!this.isCapturing) return;

    this.isCapturing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    console.log('Screen capture stopped');
  }

  private async captureFrame(): Promise<void> {
    try {
      const imageBuffer = await screenshot({ format: 'png' });
      
      const frame: ScreenFrame = {
        timestamp: Date.now(),
        imageData: imageBuffer,
        width: 0, // Will be set after image processing
        height: 0, // Will be set after image processing
        format: 'png'
      };

      this.emit('frame', frame);
    } catch (error) {
      throw new Error(`Failed to capture screen: ${error}`);
    }
  }

  isActive(): boolean {
    return this.isCapturing;
  }

  updateInterval(newInterval: number): void {
    this.captureInterval = newInterval;
    if (this.isCapturing) {
      this.stopCapture();
      setTimeout(() => this.startCapture(), 100);
    }
  }
} 