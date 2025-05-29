# AI Screen Narrator

An AI-powered real-time screen sharing application with live commentary using Google's Gemini Live API. This project provides intelligent, contextual narration of screen activities with sub-second latency.

## 🚀 Features

- **Real-time Screen Capture**: Continuous screen monitoring with intelligent frame analysis
- **Live AI Commentary**: Sub-second latency narration using Gemini Live API
- **Contextual Awareness**: AI maintains context across screen changes for coherent commentary
- **WebSocket Communication**: Real-time bidirectional streaming
- **Voice Output**: Natural speech synthesis with multiple voice options
- **Session Management**: Persistent sessions with context compression
- **Multi-language Support**: 30+ language support for commentary

## 🛠 Technology Stack

- **TypeScript** - Type-safe development
- **Gemini Live API** - Real-time multimodal AI processing
- **WebSocket** - Real-time communication
- **Express.js** - Web server framework
- **Socket.IO** - Enhanced WebSocket functionality
- **Screenshot Desktop** - Cross-platform screen capture
- **JIMP** - Image processing

## 📋 Prerequisites

- Node.js 18+ 
- Google Cloud Project with Vertex AI API enabled
- Gemini API key

## ⚙️ Setup

1. Clone and install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
GOOGLE_API_KEY=your_gemini_api_key
PROJECT_ID=your_google_cloud_project_id
LOCATION=us-central1
```

3. Start the application:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## 🏗 Project Structure

```
src/
├── index.ts              # Main application entry
├── services/
│   ├── geminiLive.ts     # Gemini Live API integration
│   ├── screenCapture.ts  # Screen capture service
│   └── audioOutput.ts    # Audio synthesis service
├── utils/
│   ├── imageProcessor.ts # Image processing utilities
│   └── contextManager.ts # Session context management
└── types/
    └── index.ts          # TypeScript type definitions
```

## 🎯 Usage

1. Start the server: `npm run dev`
2. Open browser at `http://localhost:3000`
3. Grant screen capture permissions
4. Enjoy real-time AI commentary of your screen activities!

## 🤖 How It Works

1. **Screen Capture**: Continuously captures screen at optimized intervals
2. **Image Processing**: Processes and compresses images for API efficiency
3. **Gemini Live API**: Sends visual data to Gemini for real-time analysis
4. **Context Management**: Maintains conversation context for coherent commentary
5. **Audio Output**: Converts AI responses to natural speech
6. **WebSocket Streaming**: Delivers commentary with minimal latency

## 📝 License

MIT 