import Jimp from 'jimp';
import { ScreenFrame } from '../types';

export class ImageProcessor {
  private static readonly MAX_WIDTH = 1024;
  private static readonly MAX_HEIGHT = 768;
  private static readonly QUALITY = 80;

  static async processFrame(frame: ScreenFrame): Promise<ScreenFrame> {
    try {
      const image = await Jimp.read(frame.imageData);
      
      // Get original dimensions
      const originalWidth = image.getWidth();
      const originalHeight = image.getHeight();
      
      // Calculate new dimensions while maintaining aspect ratio
      const { width, height } = this.calculateOptimalDimensions(
        originalWidth, 
        originalHeight
      );
      
      // Resize and compress
      const processedImage = image
        .resize(width, height)
        .quality(this.QUALITY);
      
      // Convert back to buffer
      const processedBuffer = await processedImage.getBufferAsync(Jimp.MIME_PNG);
      
      return {
        ...frame,
        imageData: processedBuffer,
        width,
        height,
      };
    } catch (error) {
      throw new Error(`Failed to process image: ${error}`);
    }
  }

  static async detectSignificantChanges(
    currentFrame: ScreenFrame, 
    previousFrame: ScreenFrame | null
  ): Promise<boolean> {
    if (!previousFrame) return true;

    try {
      const current = await Jimp.read(currentFrame.imageData);
      const previous = await Jimp.read(previousFrame.imageData);
      
      // Resize both to same small size for comparison
      const comparisonSize = 64;
      const currentSmall = current.resize(comparisonSize, comparisonSize);
      const previousSmall = previous.resize(comparisonSize, comparisonSize);
      
      // Calculate pixel difference
      const diff = Jimp.diff(currentSmall, previousSmall);
      const changePercentage = diff.percent;
      
      // Consider significant if more than 5% pixels changed
      return changePercentage > 0.05;
    } catch (error) {
      console.error('Error detecting changes:', error);
      return true; // Default to processing if error occurs
    }
  }

  static encodeToBase64(imageData: Buffer): string {
    return imageData.toString('base64');
  }

  static async createThumbnail(frame: ScreenFrame, size: number = 256): Promise<Buffer> {
    try {
      const image = await Jimp.read(frame.imageData);
      const thumbnail = image
        .resize(size, size)
        .quality(60);
      
      return await thumbnail.getBufferAsync(Jimp.MIME_JPEG);
    } catch (error) {
      throw new Error(`Failed to create thumbnail: ${error}`);
    }
  }

  private static calculateOptimalDimensions(
    originalWidth: number, 
    originalHeight: number
  ): { width: number; height: number } {
    const aspectRatio = originalWidth / originalHeight;
    
    let width = originalWidth;
    let height = originalHeight;
    
    // Scale down if too large
    if (width > this.MAX_WIDTH) {
      width = this.MAX_WIDTH;
      height = Math.round(width / aspectRatio);
    }
    
    if (height > this.MAX_HEIGHT) {
      height = this.MAX_HEIGHT;
      width = Math.round(height * aspectRatio);
    }
    
    return { width, height };
  }
} 