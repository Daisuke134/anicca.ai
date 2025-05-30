# ANICCA Proxy Server

This is the proxy server for ANICCA that securely handles Gemini API calls.

## Setup

### 1. Local Development

```bash
cd server
npm install
cp .env.example .env
# Edit .env with your GOOGLE_API_KEY and CLIENT_SECRET_KEY
npm run dev
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd server
vercel

# Set environment variables in Vercel dashboard:
# - GOOGLE_API_KEY: Your Gemini API key
# - CLIENT_SECRET_KEY: A secure random string
```

### 3. Configure Desktop App

Update your Electron app's `.env` file:

```env
USE_PROXY=true
ANICCA_SERVER_URL=https://your-app-name.vercel.app
ANICCA_CLIENT_KEY=your-client-secret-key
```

## Security Features

- API key is never exposed to client
- Client authentication via secret key
- Rate limiting (50 requests/day per client)
- CORS configured for security

## API Endpoints

### POST /api/analyze

Analyzes a screen capture using Gemini API.

**Headers:**
- `X-Client-Key`: Client authentication key
- `X-Client-Id`: Unique client identifier

**Body:**
```json
{
  "image": "base64_encoded_image",
  "language": "ja",
  "prompt": "analysis prompt",
  "previousUnderstanding": "optional"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "commentary": "AI response",
    "timestamp": "2024-01-01T00:00:00Z",
    "usage": {
      "remaining": 45
    }
  }
}
```