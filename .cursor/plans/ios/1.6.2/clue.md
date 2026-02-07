Unbrowse: 100x Faster Than Browser Automation
Your @openclaw agent is browsing the web like a human. That's the problem
Every time your agent needs to do something on a website — check prices, place a trade, submit a form — it launches Chrome, waits for JavaScript to render, finds elements in the DOM, clicks buttons, and scrapes text off the screen.
This takes 10-45 seconds per action. It fails 15-30% of the time. And it requires a full headless browser eating 500MB+ of RAM.
Meanwhile, every single one of those actions was just an API call wearing a button costume.
The 100x Gap
Here's what happens when your agent checks Polymarket odds:
Browser automation:
Launch Chrome 5s
Load the page 3s
Wait for JavaScript 2s
Find the element 1s
Read the text 1s
─────────────────────────
Total 12s
When that page loaded, it called GET /api/markets/election — a single request that returned everything as clean JSON in 200ms.
Your agent spent 12 seconds doing what took the website 200 milliseconds.
Now scale that. A workflow with 10 web actions: 2+ minutes of browser automation vs 2 seconds of direct API calls. That's not a small optimization. That's the difference between an agent that feels broken and one that feels instant.
It's Not Just Reading
This isn't only about getting data faster. Every action on the web is an API call.
Click "Place Trade"? That's a POST request. Submit a form on LinkedIn? POST. Send a message on Slack? POST. Book a flight? POST.
The browser is just a GUI on top of API calls. Your agent doesn't need the GUI.
Browser automation (place a trade):
Navigate to market 5s
Find the input 2s
Type the amount 1s
Click "Place Trade" 1s
Wait for confirmation 3s
─────────────────────────────
Total 12s
Failure rate: ~20%
Unbrowse:
Done.
POST /api/trades 200ms
Read data. Submit forms. Place trades. Post content. Book flights. All at API speed.
How Unbrowse Works
Unbrowse watches what websites do, not what they show.
1. Capture — Browse a site once. Unbrowse intercepts all network traffic via Chrome DevTools Protocol. Every XHR, fetch, WebSocket, auth header, and cookie is recorded.
2. Extract — Captured traffic is analyzed to identify real API endpoints. Auth methods are detected automatically — Bearer tokens, cookies, API keys. Parameters are inferred. Endpoints are clustered by resource.
3. Generate — A complete API skill is produced: documented endpoints, TypeScript client, auth config. Your agent can now call these APIs directly.
One browse session. Permanent API access. No browser needed again.
The Numbers
Browser Automation Unbrowse
Speed 10-45 seconds 200ms
Reliability 70-85% 95%+
Resources Headless Chrome (500MB+) HTTP calls
Data Scraped DOM text Clean JSON
Actions Click, type, wait, pray Direct API calls
Built on OpenClaw
Unbrowse is a plugin for OpenClaw — an open-source framework for AI agents that actually do things.
Most AI agents can talk. OpenClaw agents can act. They send emails, manage calendars, deploy code, monitor chats, post to social media, run cron jobs — all autonomously. Think of it as giving AI models hands.
Unbrowse makes those hands 100x faster on the web.
Here's how they fit together:
OpenClaw gives your agent tools — file system, shell, browser control, messaging, scheduling, memory
Unbrowse captures any website's internal APIs and turns them into new tools automatically
Your agent gets permanent, fast access to every site it's ever visited
First visit uses the browser. Every visit after is a direct API call. Your agent gets faster the more it works.
Skills That Compound
Every API Unbrowse captures becomes a "skill" — a reusable package any OpenClaw agent can install.
One agent figures out Polymarket's API. Now every agent can trade on Polymarket at API speed without ever opening a browser. One agent maps Airbnb's internal endpoints. Now every agent can search listings in 200ms.
Skills compound. The ecosystem gets smarter with every user.
We're building a marketplace where agents share and trade these skills — using x402 micropayments so agents can buy capabilities for themselves. No human approval needed. Agents acquiring their own tools.
The Bigger Picture
The current approach to agent web access is broken:
Official APIs — Great, but ~1% of websites have them
MCP servers — Great, but someone has to build each one manually
Browser automation — Works everywhere, but it's slow, brittle, and expensive
99% of the web is locked behind browser automation. Unbrowse unlocks it at API speed.
Every website already has internal APIs. React apps, SPAs, dashboards — they all fetch data from backends. The browser is just a rendering layer. Browser automation is literally:
1. Launching a browser
2. Rendering HTML from JSON
3. Scraping the HTML back into data
4. Clicking buttons that send API requests the agent could've made directly
JSON → HTML → data → API calls. That's four steps to do what one step could.
Open Source
Both projects are MIT licensed:
npm install -g openclaw
openclaw plugins install @getfoundry/unbrowse-openclaw
OpenClaw: github.com/openclaw/openclaw
Unbrowse: github.com/lekt9/unbrowse-openclaw
Every website already has an API. Your agent just didn't know about it.