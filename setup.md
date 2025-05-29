# 🚀 AI Screen Narrator Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env`
   - Add your Google API credentials:
   ```bash
   GOOGLE_API_KEY=your_actual_gemini_api_key
   PROJECT_ID=your_google_cloud_project_id
   LOCATION=us-central1
   ```

3. **Start the Application**
   ```bash
   npm run dev
   ```

4. **Open Browser**
   - Go to `http://localhost:3000`
   - Click "Start Narration" to begin

## 🔑 API Key Setup

### Getting Your Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API Key" 
4. Create a new API key or use existing one
5. Copy the key to your `.env` file

### Google Cloud Project (Optional for Enhanced Features)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Vertex AI API
4. Copy project ID to `.env` file

## 🛠 Configuration Options

### Screen Capture Settings
- `CAPTURE_INTERVAL_MS`: How often to capture screen (default: 1000ms)
- Lower = more responsive but higher CPU usage
- Higher = less responsive but better performance

### Audio Settings
- `DEFAULT_VOICE`: Text-to-speech voice selection
- `DEFAULT_LANGUAGE`: Language for commentary
- `SPEECH_SPEED`: Playback speed (0.5 - 2.0)

### Performance Tuning
- `MAX_CONTEXT_HISTORY`: Number of commentary items to remember
- More history = better context but higher memory usage

## 🎯 Usage Tips

### For Best Results:
1. **Stable Internet**: Required for Gemini API calls
2. **Screen Permissions**: Grant when prompted by browser
3. **Audio Permissions**: Enable for speech output
4. **Clear Screens**: AI works better with uncluttered interfaces

### Optimal Settings by Use Case:

**Real-time Presentations**
```
CAPTURE_INTERVAL_MS=500
SPEECH_SPEED=1.2
MAX_CONTEXT_HISTORY=30
```

**Casual Monitoring**
```
CAPTURE_INTERVAL_MS=2000
SPEECH_SPEED=1.0
MAX_CONTEXT_HISTORY=50
```

**Development Work**
```
CAPTURE_INTERVAL_MS=1500
SPEECH_SPEED=1.1
MAX_CONTEXT_HISTORY=40
```

## 🔧 Troubleshooting

### Common Issues:

**"Failed to start application"**
- Check your API key is valid
- Ensure `.env` file exists and is configured
- Verify internet connection

**"Screen capture error"**
- Grant screen recording permissions
- Try restarting the browser
- Check if another app is using screen capture

**"Audio playback error"**
- Enable audio permissions in browser
- Check system audio settings
- Try different browser

**"AI service error"**
- Verify Gemini API key is correct
- Check API quota/billing
- Ensure project ID is valid

### Performance Issues:

**High CPU Usage**
- Increase `CAPTURE_INTERVAL_MS`
- Close unnecessary applications
- Lower screen resolution temporarily

**Slow Commentary**
- Check internet speed
- Verify API key has proper quota
- Try different `LOCATION` (closer region)

**Memory Issues**
- Reduce `MAX_CONTEXT_HISTORY`
- Restart application periodically
- Close unused browser tabs

## 🚨 Privacy & Security

### Data Handling:
- Screen captures are sent to Google's Gemini API
- No data is stored locally beyond session
- Commentary history cleared on session end

### Recommendations:
- Don't use on screens with sensitive information
- Review Google's AI services privacy policy
- Use private browsing for extra privacy
- Consider running on dedicated screen/workspace

## 📋 Browser Compatibility

**Supported:**
- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

**Features Required:**
- WebSocket support
- Screen capture API
- Audio Web API
- ES6+ JavaScript

## 🔄 Updates & Maintenance

### Keeping Updated:
```bash
git pull origin main
npm install
npm run dev
```

### Monitoring:
- Check `/health` endpoint for service status
- Monitor console for errors
- Review commentary quality regularly

## 💡 Advanced Usage

### Custom Prompts:
Modify `src/services/geminiLive.ts` to customize AI commentary style

### Integration:
Use the REST API endpoints for integration with other tools:
- `POST /start` - Start narration
- `POST /stop` - Stop narration
- `GET /health` - Check status
- `GET /session` - Get session info

### WebSocket Events:
Connect directly to WebSocket for real-time updates:
```javascript
const socket = io('http://localhost:3000');
socket.on('commentary', (data) => {
  console.log('New commentary:', data.text);
});
```

---

Need help? Check the [Issues](https://github.com/your-repo/issues) or create a new one! 