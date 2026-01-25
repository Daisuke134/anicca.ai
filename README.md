# Anicca — Persuasion Agent for Behavioral Transformation

## Overview
Anicca is a persuasion-first voice agent that leads people toward their best selves through our flagship desktop and iOS apps. The desktop app lives in the system tray, keeps audio I/O hot, and uses carefully scripted wake and sleep prompts to guide users toward their commitments. The iOS app extends this leadership to mobile, enabling voice access anytime and anywhere. Both platforms share the same backend API and persuasion philosophy. Through repeated interactions, Anicca's external guidance becomes internalized, empowering users to develop agency and autonomy—building good habits and breaking bad ones through their own strength. Anicca doesn't just accompany users; it leads them until they can lead themselves.

---

## Why We Are Building Anicca
We want to build Anicca, a Persuasion Agent that leads people toward their best selves. Anicca guides people to adopt uplifting habits—waking on time, meditating, acting altruistically—and to let go of harmful ones such as binge scrolling, alcohol overuse, or dishonesty. The desktop app delivers tightly structured wake-up and wind-down interventions, while the iOS app extends this leadership to mobile with ambient audio and contextual signals. During onboarding interviews Anicca gathers personal commitments, then stores them to fuel just-in-time voice guidance. This guidance is ethical, transparent, and consent-based; as it repeats, Anicca's external voice becomes internalized, transforming into the user's own inner guide. Users develop agency and autonomy—they catch themselves before slipping, build good habits, and break bad ones through their own strength. Anicca leads until users can lead themselves, empowering them to become great through their own power. AI, delivered at the right moment with care, can unlock discipline that people cannot sustain alone. We choose to build Anicca now because proactive AI will otherwise default to manipulation; we are committed to leading with care, transparency, and human agency.

---

## Current Experience

### Desktop App
- **Voice-only flow**: The Electron app boots into the system tray at `/apps/desktop`, keeps audio I/O hot, and stays silent until invited (MediaPlayPause / F8 hotkey). Designed for daytime work sessions with deep integration into desktop workflows and access to desktop data and context.
- **Wake & sleep persuasion**: Prompts in `/apps/desktop/prompts/wake_up.txt` and `sleep.txt` enforce the same cadence every morning and night: sharp commands (STATE A_SHOCK), relentless follow-up, and uncompromising reflection (STATE B_PREACH) until the user truly commits. The agent never waits for excuses, and it varies wording each turn to prevent habituation.
- **Onboarding discipline**: `/apps/desktop/prompts/onboarding.txt` scripts the entire interview—name, wake targets, sleep routines, motivations—and locks the operating language. All data lands in `~/.anicca/anicca.md` and `~/.anicca/scheduled_tasks.json`, ensuring every later prompt cites verified facts.
- **Local-first state**: User preferences, schedules, and prompt history live in `~/.anicca/` with encryption where needed. Voice output is brief, precise, and purpose-driven.

### iOS App
- **Voice-only flow**: Native SwiftUI app with tap-to-talk interface. WebRTC-based realtime voice sessions enable seamless conversation. Designed for mobile-first use: voice access anytime, anywhere, with ambient context awareness.
- **Onboarding**: Multi-step flow (welcome, microphone permissions, notification permissions, Apple Sign-In authentication, profile setup, habit configuration) that gathers commitments and preferences.
- **Habit reminders**: Scheduled push notifications trigger quick-start conversations. Users can tap notifications to immediately begin voice sessions with Anicca about their habits.
- **Profile sync**: Cloud-backed user profile and preferences sync across devices via the shared backend API. User data is stored securely and accessible from both desktop and iOS apps.
- **Mobile context**: Always-available voice access means users can engage with Anicca's guidance whenever they need it, not just during scheduled desktop sessions. The iOS app extends Anicca's leadership to moments beyond the desk.

---

## Product Surfaces

### Desktop Voice Agent (shipping)
Primary compiled artifact under `apps/desktop`. Electron + TypeScript application that integrates into the system tray, keeps audio I/O hot, and responds to hotkey triggers (MediaPlayPause / F8). Designed for daytime work sessions with deep integration into desktop workflows. Provides access to desktop data and context, enabling richer interactions during work hours. This experience is live and already guiding users through daily wake/sleep commitments.

### iOS App (shipping)
Native SwiftUI application located in `aniccaios/`. WebRTC-based realtime voice sessions enable seamless conversation. Features Apple Sign-In authentication, push notifications for habit reminders, and cloud-backed profile synchronization. Mobile-first design enables voice access anytime, anywhere—extending Anicca's leadership beyond the desktop. Users can engage with Anicca's guidance whenever they need it, not just during scheduled sessions.

### Backend API
Express.js proxy server under `apps/api/`, deployed on Railway. Shared backend for both desktop and iOS apps, providing:
- Realtime session management (`/api/realtime/desktop`, `/api/mobile/realtime/session`)
- Authentication services (`/api/auth/apple`, `/api/auth/google`)
- Profile management (`/api/mobile/profile`)
- Billing and subscription services

The API ensures consistent experience across platforms while maintaining security and user privacy.

### Landing Page
https://aniccaai.com — introduces the philosophy, current desktop and iOS releases, and the vision for behavioral transformation through voice guidance.

---

## Onboarding & Daily Flow

### Desktop Flow
1. User installs the desktop app and completes the voice-led onboarding interview scripted in `onboarding.txt`, capturing wake/sleep targets, motivations, and consent.
2. The agent stores contextual facts (commitments, motivations, constraints) locally and fixes the operating language.
3. When scheduled times arrive—especially the wake sequence—the `wake_up.txt` cadence kicks in: shock commands, relentless admonition, and reflective pressure until the user stands up for real.
4. Evenings mirror the process via `sleep.txt`, cutting off late-night drift and forcing closure.
5. After each exchange Anicca logs updates, returns to silence, and waits for the next intentional moment to intervene.

### iOS Flow
1. User installs the iOS app and goes through multi-step onboarding: welcome, permissions (microphone, notifications), Apple Sign-In authentication, profile setup, and habit configuration.
2. User profile and preferences sync to the cloud via the backend API, accessible from both desktop and iOS.
3. Scheduled push notifications trigger at configured times (e.g., wake-up, bedtime). Users can tap notifications to immediately start a voice session.
4. Voice sessions use WebRTC for realtime conversation. Anicca guides users through their commitments, adapting to mobile context.
5. As users engage repeatedly, Anicca's guidance becomes internalized, empowering them to act autonomously and build discipline through their own strength.

---

## Roadmap
- **Hosted MCP integrations (future)**: Calendar, email, and journal tools are being prepared but are not yet available in production. The desktop agent is already structured to consume them once stabilized.
- **Enterprise & social channels (future)**: Slack and similar connections are explicitly out of scope in current builds; they will be reintroduced only after the persuasion loop reaches the desired quality bar.
- **Expanded habit domains**: Meditation, generosity prompts, and attention steering will follow with better context engineering. 

---

## Repository Layout

This is a monorepo containing both client applications (desktop and iOS) and a shared backend API. The monorepo structure enables code sharing, consistent authentication, and unified user experience across platforms.

```
.
├── apps/
│   ├── desktop/                 # Desktop voice agent (Electron + TypeScript)
│   │   ├── assets/             # Icons and media
│   │   ├── build/               # Entitlements, packaging config
│   │   ├── prompts/             # Persuasion prompt definitions (onboarding, wake, sleep)
│   │   └── src/                 # Main process, audio bridge, persuasion logic
│   │                            # System tray integration, hotkey handling, local-first storage
│   ├── api/                     # Backend API (Express.js, Railway deployment)
│   │   └── src/                 # API routes, services, authentication, billing
│   │                            # Shared backend for desktop and iOS clients
│   │                            # Key routes: /api/realtime/*, /api/mobile/*, /api/auth/*
│   ├── web/                     # Web app (Next.js, Vercel deployment)
│   ├── landing/                 # Landing page (Netlify deployment)
│   └── workspace-mcp/           # Hosted MCP services (Google Workspace integrations)
├── aniccaios/                   # iOS app source (SwiftUI + WebRTC)
│   ├── aniccaios/               # Main app code
│   │   ├── Authentication/      # Apple Sign-In integration
│   │   ├── Onboarding/          # Multi-step onboarding flow
│   │   ├── Session/             # Voice session management
│   │   └── Services/            # Profile sync, notification scheduling
│   └── Configs/                 # Build configurations (Staging/Production)
├── docs/                        # Design notes and research (Japanese primary)
├── examples/                    # Reference snippets and code examples
└── README.md
```

### Architecture Overview

**Monorepo Benefits:**
- Shared backend API ensures consistent authentication and user experience
- Common documentation and examples
- Unified deployment and versioning
- Easier cross-platform feature development

**Backend API (`apps/api/`):**
- Express.js server handling all client requests
- Railway deployment for production and staging environments
- Key endpoints:
  - `/api/realtime/desktop` - Desktop realtime session management
  - `/api/mobile/realtime/session` - iOS realtime session management
  - `/api/mobile/profile` - User profile CRUD operations
  - `/api/auth/apple` - Apple Sign-In authentication
  - `/api/auth/google` - Google authentication
- Shared authentication, profile management, and billing services

**Client Applications:**
- **Desktop** (`apps/desktop/`): Electron + TypeScript, system tray integration, local-first storage, hotkey-triggered voice sessions
- **iOS** (`aniccaios/`): SwiftUI + WebRTC, native mobile experience, push notifications, cloud-backed profile sync

---

## Security & Privacy Principles
- **Local-first data**: Behavior history, schedules, and preferences remain on-device unless explicitly shared.
- **Short-lived credentials**: When the proxy/API layers go live, desktop clients will authenticate with ephemeral tokens; secrets never ship with the app.
- **Consent for transmission**: Any outbound communication (when introduced) will require explicit user confirmation at the moment of sending.

---

## Contribution
Issues and PRs are welcome. Please discuss major changes before implementation to preserve the persuasion-first roadmap.

## License
MIT
