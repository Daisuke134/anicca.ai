# WebSocket Support in Electron & Gemini Live API Integration Analysis

## Executive Summary

**Yes, Electron supports WebSocket connections natively**, and the current ANICCA project architecture **can be modified to integrate with Gemini Live API** with moderate effort. The integration would require creating a new service alongside the existing REST-based GeminiRestService.

## WebSocket Support in Electron

### Native Support
Electron provides full native WebSocket support through:
1. **Main Process**: Node.js WebSocket implementation (requires `ws` package)
2. **Renderer Process**: Browser's native WebSocket API (no additional packages needed)

### Implementation Options for ANICCA
Given ANICCA's architecture with services in the main process, the recommended approach is:
- Use the `ws` npm package in the main process
- Create a new `GeminiLiveService` that manages WebSocket connections
- Maintain the existing REST service for backward compatibility

## Current Architecture Analysis

### Strengths for Integration
1. **Service-based Architecture**: Clean separation of concerns with dedicated services
2. **EventEmitter Pattern**: Already uses event-driven architecture (ScreenCaptureService)
3. **IPC Communication**: Established patterns for main-renderer communication
4. **Modular Design**: Easy to add new services without disrupting existing functionality

### Key Components
```
main.ts
├── ScreenCaptureService (EventEmitter) - 8-second capture loop
├── GeminiRestService - Current REST API implementation
├── SQLiteDatabase - Local storage
├── HighlightsManager - Summary generation
└── CommandExecutor - Action execution
```

## Proposed Integration Architecture

### 1. New GeminiLiveService
```typescript
// src/services/geminiLive.ts
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export class GeminiLiveService extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  async connect(apiKey: string) {
    const wsUrl = 'wss://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-exp:streamGenerateContent';
    
    this.ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    this.setupEventHandlers();
  }
  
  sendFrame(imageData: Buffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        contents: [{
          parts: [{
            inlineData: {
              data: imageData.toString('base64'),
              mimeType: 'image/png'
            }
          }]
        }]
      }));
    }
  }
}
```

### 2. Integration Points

#### Option A: Parallel Services (Recommended)
- Keep both REST and WebSocket services
- Use REST for one-shot analysis (current 8-second interval)
- Use WebSocket for continuous streaming when needed
- Switch between them based on use case

#### Option B: Full Migration
- Replace REST service entirely with WebSocket
- Maintain persistent connection
- Stream frames continuously
- Handle reconnection logic

### 3. Modified main.ts Integration
```typescript
// Add to services
let geminiLiveService: GeminiLiveService;

// In initializeServices()
geminiLiveService = new GeminiLiveService(database);
await geminiLiveService.connect(apiKey);

// Setup live streaming events
geminiLiveService.on('commentary', (data) => {
  mainWindow?.webContents.send('live-commentary', data);
});

// Option to switch between services
const useWebSocket = await database.getSetting('useWebSocket') === 'true';
```

## Implementation Requirements

### 1. Dependencies
```bash
npm install ws
npm install --save-dev @types/ws
```

### 2. Key Considerations
- **Connection Management**: Handle disconnections, reconnections
- **Error Handling**: Network failures, API limits
- **State Management**: Track connection state, buffering
- **Performance**: WebSocket overhead vs REST polling
- **API Compatibility**: Ensure Gemini Live API supports required features

### 3. Migration Path
1. **Phase 1**: Create GeminiLiveService alongside existing REST service
2. **Phase 2**: Add UI toggle to switch between services
3. **Phase 3**: Test and optimize WebSocket performance
4. **Phase 4**: Consider full migration if benefits justify

## Benefits of WebSocket Integration

1. **Real-time Streaming**: Continuous analysis without 8-second intervals
2. **Lower Latency**: Immediate response to screen changes
3. **Efficient**: Single connection vs multiple HTTP requests
4. **Bidirectional**: Can receive server-initiated updates

## Challenges

1. **Connection Stability**: Need robust reconnection logic
2. **Memory Management**: Long-lived connections may accumulate state
3. **Error Recovery**: More complex than request-response pattern
4. **API Limits**: Different rate limiting model for streaming

## Recommendation

The current ANICCA architecture is **well-suited for WebSocket integration**. The modular service design makes it straightforward to add a parallel WebSocket service without disrupting existing functionality. 

**Recommended approach**:
1. Start with parallel implementation (both REST and WebSocket)
2. Add user preference to choose connection type
3. Monitor performance and stability
4. Make WebSocket the default if it proves superior

The event-driven architecture and existing IPC patterns will make the integration smooth and maintainable.