# ANICCA Proxy Server

Proxy server for ANICCA AI Screen Narrator to securely handle Gemini API requests.

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env.local` file with your API keys:
   ```
   # For Gemini API
   GEMINI_API_KEY=your_actual_api_key_here
   
   # For GitHub Releases (DMG download)
   GITHUB_TOKEN=your_github_personal_access_token
   GITHUB_OWNER=Daisuke134
   GITHUB_REPO=anicca.ai
   RELEASE_TAG=v4.0.0
   ```

4. Run locally:
   ```bash
   npm run dev
   ```

## Deployment

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - Go to Settings > Environment Variables
   - Add `GEMINI_API_KEY` with your actual key
   - Add `GITHUB_TOKEN` with your Personal Access Token
   - Add other GitHub-related variables if needed

## API Endpoints

### POST /api/gemini
Proxies requests to Gemini API.

Request body:
```json
{
  "endpoint": "/models/gemini-2.0-flash:generateContent",
  "data": {
    "contents": [...]
  }
}
```

### GET /api/download
Downloads the latest ANICCA DMG file from private GitHub releases.

Required environment variables:
- `GITHUB_TOKEN`: Personal Access Token with `repo` scope
- `GITHUB_OWNER`: Repository owner (default: Daisuke134)
- `GITHUB_REPO`: Repository name (default: anicca.ai)
- `RELEASE_TAG`: Release tag to download (default: v4.0.0)

## Security

- API key is stored only in Vercel environment variables
- CORS is configured to accept requests from any origin (adjust for production)
- All requests are logged for monitoring