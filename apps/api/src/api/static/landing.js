// Anicca Landing Page
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Anicca - Voice AI Assistant</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(to bottom right, #1a1a2e, #16213e);
            color: white;
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            max-width: 600px;
        }
        h1 {
            font-size: 3em;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #00d4ff, #7a5cff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .tagline {
            font-size: 1.3em;
            margin-bottom: 40px;
            opacity: 0.9;
        }
        .download-section {
            margin: 40px 0;
        }
        .download-btn {
            display: inline-block;
            background: linear-gradient(45deg, #00d4ff, #7a5cff);
            color: white;
            padding: 15px 40px;
            border-radius: 30px;
            text-decoration: none;
            font-size: 1.1em;
            margin: 10px;
            transition: transform 0.2s;
        }
        .download-btn:hover {
            transform: scale(1.05);
        }
        .version {
            font-size: 0.9em;
            opacity: 0.7;
            margin-top: 10px;
        }
        .features {
            margin: 40px 0;
            text-align: left;
            display: inline-block;
        }
        .features li {
            margin: 10px 0;
        }
        .footer {
            margin-top: 50px;
            opacity: 0.7;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Anicca</h1>
        <p class="tagline">Your Voice-Powered AI Assistant</p>
        
        <div class="features">
            <ul>
                <li>🎯 Say "Hey Anicca" to start</li>
                <li>🔗 Slack integration via MCP</li>
                <li>🚀 Auto-start at login</li>
                <li>🎙️ No UI needed - just your voice</li>
                <li>💻 Works on Intel & Apple Silicon Macs</li>
            </ul>
        </div>
        
        <div class="download-section">
            <h2>Download Anicca v0.5</h2>
            <a href="/api/download?arch=arm64" class="download-btn">
                Download for Apple Silicon
            </a>
            <br>
            <a href="/api/download?arch=x64" class="download-btn">
                Download for Intel Mac
            </a>
            <p class="version">Version 0.5.0 - Voice Edition</p>
        </div>
        
        <div class="footer">
            <p>© 2025 Anicca AI</p>
        </div>
    </div>
</body>
</html>`;
  
  res.status(200).send(html);
}