import { EventEmitter } from 'events';
import { CommentaryResponse, AudioSettings } from '../types';

export class AudioOutputService extends EventEmitter {
  private audioSettings: AudioSettings;
  private audioQueue: CommentaryResponse[] = [];
  private isPlaying: boolean = false;

  constructor(audioSettings: AudioSettings) {
    super();
    this.audioSettings = audioSettings;
  }

  async generateAudio(commentary: CommentaryResponse): Promise<string> {
    try {
      // In a real implementation, this would use Google Text-to-Speech API
      // or browser's Web Speech API for audio synthesis
      
      const audioUrl = await this.synthesizeSpeech(commentary.text);
      
      const enhancedCommentary: CommentaryResponse = {
        ...commentary,
        audioUrl
      };

      this.audioQueue.push(enhancedCommentary);
      
      if (!this.isPlaying) {
        await this.playNext();
      }

      return audioUrl;
    } catch (error) {
      console.error('Error generating audio:', error);
      throw error;
    }
  }

  private async synthesizeSpeech(text: string): Promise<string> {
    // Placeholder implementation
    // In production, this would call Google Text-to-Speech API
    
    try {
      // Mock API call to Google TTS
      const ttsRequest = {
        input: { text },
        voice: {
          languageCode: this.audioSettings.language,
          name: this.audioSettings.voice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: this.audioSettings.speed,
          pitch: this.audioSettings.pitch,
        },
      };

      // Simulate API response with a blob URL
      const audioBlob = new Blob([], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return audioUrl;
    } catch (error) {
      throw new Error(`Speech synthesis failed: ${error}`);
    }
  }

  private async playNext(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const commentary = this.audioQueue.shift()!;

    try {
      await this.playAudio(commentary);
      this.emit('audio_finished', commentary);
      
      // Play next in queue
      setTimeout(() => this.playNext(), 100);
    } catch (error) {
      console.error('Error playing audio:', error);
      this.emit('audio_error', { commentary, error });
      this.playNext(); // Continue with next item
    }
  }

  private async playAudio(commentary: CommentaryResponse): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!commentary.audioUrl) {
        reject(new Error('No audio URL provided'));
        return;
      }

      const audio = new Audio(commentary.audioUrl);
      
      audio.onended = () => {
        resolve();
      };
      
      audio.onerror = (error) => {
        reject(new Error(`Audio playback failed: ${error}`));
      };
      
      audio.play().catch(reject);
    });
  }

  updateSettings(newSettings: Partial<AudioSettings>): void {
    this.audioSettings = { ...this.audioSettings, ...newSettings };
  }

  clearQueue(): void {
    this.audioQueue = [];
  }

  getQueueLength(): number {
    return this.audioQueue.length;
  }

  isAudioPlaying(): boolean {
    return this.isPlaying;
  }

  async stopAudio(): Promise<void> {
    this.clearQueue();
    this.isPlaying = false;
    // In a real implementation, you'd also stop current audio playback
  }

  // Alternative: Use Web Speech API for browser-based TTS
  async synthesizeWithWebSpeech(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Web Speech API not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.audioSettings.language;
      utterance.rate = this.audioSettings.speed;
      utterance.pitch = this.audioSettings.pitch;

      utterance.onend = () => resolve();
      utterance.onerror = (error) => reject(error);

      window.speechSynthesis.speak(utterance);
    });
  }
} 