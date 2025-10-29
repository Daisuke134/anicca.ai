# anicca — Voice Agent for Behavioral Change

## Overview
anicca is a voice agent designed for behavioral change. It handles daily schedules, reminders, communications, meditation, and information retrieval through voice commands alone. The desktop experience focuses on "system tray residence, voice-only, minimal UI" to create a hands-free, eyes-free experience.

- **Mission**: Transform user behavior and guide them toward their ideal self. Ultimately, Anicca will act autonomously to alleviate the suffering of all living beings (Anicca = impermanence).
- **Core Principle**: Silence by default—speak only when necessary, briefly and precisely. External transmissions (Slack, etc.) require explicit user approval before execution.
---

## Key Features
- **Voice-Complete**: Conversation start/end, instructions, and result confirmation all via voice. Basic operations from tray icon.
- **Schedules & Reminders**: Register and execute recurring/one-time tasks. Wake-up, bedtime, pre-meeting notifications, etc.
- **Google Calendar Integration**: Fetch, create, update, and delete calendar events using hosted MCP.
- **Slack Integration**: Retrieve channel lists and history, draft and send thread replies (sending requires approval).
- **Local Storage & Privacy-First**: Settings/sessions/schedules are primarily stored in `~/.anicca/` (with encryption).

---

## Repository Structure
```
.
├── apps/
│   ├── desktop/                 # Desktop app (Electron + TypeScript)
│   │   ├── assets/desktop/      # Tray/app icons, etc.
│   │   ├── build/               # entitlements, etc.
│   │   ├── electron-builder-voice.yml
│   │   └── src/
│   │       ├── main-voice-simple.ts   # Entry point: tray/bridge/hotkey, etc.
│   │       ├── config.ts              # Proxy resolution, constants
│   │       ├── agents/                # RealtimeAgent, SessionManager, MCP integration
│   │       └── services/              # Auth (PKCE), encryption, networking
│   │
│   ├── api/                     # Proxy API (Express)
│   │   └── src/
│   │       ├── server.js        # CORS/JSON/routing aggregation
│   │       ├── routes/          # /api/* endpoint aggregation
│   │       ├── api/             # Handlers (realtime, mcp, auth, etc.)
│   │       ├── services/        # Token/external API wrappers
│   │       ├── config/          # Integrated environment config
│   │       └── lib/utils/       # DB, encryption, logger
│   │
│   ├── web/                     # Web app (Next.js)
│   │   ├── app/                 # UI routes
│   │   └── components/          # UI components
│   │
│   ├── landing/                 # Landing page (static)
│   │   └── landing/             # HTML/CSS/JS
│   │
│   └── workspace-mcp/           # Google Workspace MCP (FastMCP)
│       ├── gcalendar/ etc.      # gmail/gsheets/gdrive MCP tools
│       ├── core/                # tool_registry, etc.
│       └── fastmcp_server.py    # MCP endpoint
│
├── docs/                        # Design/requirements/validation notes
├── examples/                    # Reference code/external examples
└── README.md
```

- **apps/desktop**: Core of the voice experience. Connects to OpenAI Realtime, handles audio I/O, system tray residence, automatic execution of scheduled tasks, etc.
- **apps/api**: Proxy layer handling client identity verification, short-lived authorization, MCP/external tool integration, etc.
- **apps/web**: Anicca's web application (UI).
- **apps/landing**: Product introduction page.
- **apps/workspace-mcp**: Hosted MCP server for Google Calendar, etc.

---

## User Experience Flow
1. Desktop app launches and resides in system tray. Voice input is ready.
2. Enter conversation mode with hotkey (MediaPlayPause/F8) and give voice commands. For scheduled tasks, conversation mode activates automatically with appropriate prompts.
3. Make voice requests like "Tell me today's schedule," "Wake me up in 10 minutes," "Set a morning meeting at 9 AM."
4. Schedule creation and notifications proceed automatically. External transmissions (Slack, etc.) require approval just before sending.
5. After silence/response completion, automatically returns to silent mode and waits in system tray.

---

## Architecture (High-Level)
- **Realtime Voice**: Bridge (a small HTTP/WS server) in the desktop app streams audio and connects to OpenAI Realtime. Input is PCM16, output is also PCM16 for playback.
- **MCP (Tools)**:
  - **Hosted MCP** (Google Calendar, etc.): Server-side MCP endpoints are injected into the agent as "hosted tools" to fetch/create/update/delete events via voice.
  - **Local MCP (filesystem)**: Safely limited read/write access to files under `~/.anicca`.
- **Scheduled Tasks**: `~/.anicca/scheduled_tasks.json` is the single source of truth. Voice side monitors changes and auto-generates `today_schedule.json` (read-only view). Announcements reference the view; no writes to the view.
- **Authentication & Least Privilege**: Client uses publicly shareable anonymous key with PKCE login. Server verifies identity and issues short-lived authorization tokens to protect APIs. Secret keys are never distributed to clients.
- **Data Storage**: Primarily local (`~/.anicca`). Stores sessions/settings/schedules. Encryption applied as needed.

---

## Security/Privacy Approach
- **Local-First**: Personal data is primarily stored in `~/.anicca`. Sessions are encrypted.
- **Minimal Exposure**: Client holds only "publicly shareable auth config." Privileged operations execute on server.
- **Short-Lived Tokens**: Server issues authorization tokens that expire quickly, limiting API access.
- **Explicit Approval**: External transmissions (Slack, etc.) require user approval immediately before sending.
- **Safe MCP Usage**: Hosted MCP permits only necessary tools; local MCP limits access scope.

---

## Web and Landing Positioning
- **Web App**: Web version of Anicca.
- **Landing**: Product introduction/guidance page.

---

## License
MIT

## Contribution
Issues and PRs are welcome. Please discuss major changes in advance.

## Contact
keiodaisuke@gmail.com
