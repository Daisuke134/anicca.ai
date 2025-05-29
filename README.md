# anicca - AI Screen Narrator

![anicca Banner](https://img.shields.io/badge/anicca-AI%20Screen%20Narrator-purple?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

**anicca** is an intelligent desktop application that provides real-time AI-powered commentary and analysis of your screen activities using Google's Gemini 2.0 Flash API.

## ✨ Features

- 🎯 **Real-time Screen Analysis**: 8-second interval intelligent screen capture and analysis
- 🧠 **AI Commentary**: Contextual narration and psychological insights using Gemini 2.0 Flash
- 🔮 **Prediction System**: AI predicts your next actions with accuracy tracking
- 📊 **Daily Activity Logs**: Comprehensive analysis of your digital behavior patterns
- 🌍 **Multi-language Support**: Japanese and English interface with real-time switching
- 🔒 **Privacy-Focused**: Complete local data processing with SQLite storage
- 📈 **Understanding Evolution**: AI builds and maintains understanding of your behavior patterns

## 🛠 Technology Stack

- **Electron** - Cross-platform desktop framework
- **TypeScript** - Type-safe development
- **SQLite** - Local data storage
- **Gemini 2.0 Flash API** - Advanced AI analysis
- **IPC Communication** - Secure inter-process messaging

## 📋 Requirements

- **macOS 10.15+** (Catalina or later)
- **8GB RAM** recommended
- **Active internet connection** for AI analysis
- **Google Gemini API Key** ([Get one here](https://aistudio.google.com/))

## 🚀 Quick Start

### 1. Download

#### For Apple Silicon Macs (M1/M2/M3):
[⬇️ Download anicca for Apple Silicon](https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-1.0.0-arm64.dmg)

#### For Intel Macs:
[⬇️ Download anicca for Intel](https://github.com/Daisuke134/anicca.ai/releases/latest/download/anicca-1.0.0.dmg)

### 2. Install
1. Open the downloaded `.dmg` file
2. Drag **anicca** to your **Applications** folder
3. Launch anicca from Applications

### 3. Setup API Key
1. Get your free Gemini API key from [Google AI Studio](https://aistudio.google.com/)
2. Set it as an environment variable:
   ```bash
   export GOOGLE_API_KEY="your_api_key_here"
   ```
3. Restart anicca

### 4. Grant Permissions
- **Screen Recording**: Required for screen analysis
- **Accessibility**: For optimal experience

## 🎮 Usage

1. **Start Analysis**: Click "Start Narration" to begin screen monitoring
2. **View Insights**: Real-time commentary appears in the main interface
3. **Check Daily Logs**: Access comprehensive activity analysis
4. **Language Toggle**: Switch between Japanese and English instantly
5. **Privacy Control**: All data stays local on your machine

## 🏗 Development Setup

```bash
# Clone repository
git clone https://github.com/Daisuke134/anicca.ai.git
cd anicca.ai

# Install dependencies
npm install

# Set up environment variables
cp env.example .env
# Edit .env with your GOOGLE_API_KEY

# Development mode
npm run electron-dev

# Build for production
npm run build

# Create distributable
npm run dist:mac
```

## 📊 Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   Main Process   │    │  Gemini API     │
│   (Renderer)    │◄──►│   (Electron)     │◄──►│  (Analysis)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                       ┌──────────────────┐
                       │   SQLite DB      │
                       │   (Local)        │
                       └──────────────────┘
```

## 🔒 Privacy & Security

- **100% Local Processing**: Your screen data never leaves your device
- **Encrypted Storage**: SQLite database with secure local storage
- **API Privacy**: Only processed insights sent to Gemini API, not raw screenshots
- **No Telemetry**: Zero data collection or tracking

## 📈 Roadmap

- [ ] **Browser Control**: Direct webpage interaction capabilities
- [ ] **Long-term Memory**: Extended context and learning
- [ ] **Voice Mode**: Audio commentary and interaction
- [ ] **Custom Plugins**: Extensible analysis modules
- [ ] **Team Features**: Collaborative insights (optional)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- 📧 **Email**: [contact@anicca.ai](mailto:contact@anicca.ai)
- 🐛 **Issues**: [GitHub Issues](https://github.com/Daisuke134/anicca.ai/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/Daisuke134/anicca.ai/discussions)

## 🙏 Acknowledgments

- **Google Gemini Team** for the powerful AI capabilities
- **Electron Community** for the excellent desktop framework
- **TypeScript Team** for type-safe development tools

---

**Made with ❤️ for productivity enthusiasts**

*anicca - Understanding your digital journey* 