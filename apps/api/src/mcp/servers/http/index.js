#!/usr/bin/env node
// HTTP MCP server – moved from apps/api/mcp-servers/http-mcp-server.js
// NOTE: identical behavior; path relocated under src/ for consistency

import http from 'http';

const PORT = process.env.PORT || 3333;
const SLACK_API_URL = process.env.SLACK_API_URL;
const USER_ID = process.env.USER_ID;
const SLACK_USER_ID = process.env.SLACK_USER_ID || '';

if (!SLACK_API_URL || !USER_ID) {
  console.error('HTTP MCP server missing SLACK_API_URL or USER_ID');
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405; res.end('Method Not Allowed'); return;
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const response = await fetch(SLACK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userId: payload.userId || USER_ID, slackUserId: SLACK_USER_ID })
      });
      const text = await response.text();
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(text);
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'HTTP MCP error', message: e?.message || String(e) }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`HTTP MCP server listening on ${PORT}`);
});

