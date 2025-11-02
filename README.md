# Anicca — Voice Persuasion Agent for Behavioral Transformation

## Overview
Anicca is a persuasion-first voice experience delivered through our launched desktop app and the ambient-sensing iOS companion now in development. The desktop agent lives in the system tray, keeps audio I/O hot, and uses carefully scripted wake and sleep prompts to push users toward their commitments. The iOS app will capture environmental context so the same persuasive guidance can reach users beyond the desk. Together they cultivate disciplined habits that eventually become internal self-nudges.

---

## Why We Are Building Anicca
We want to build Anicca, a Persuasion Agent that leads people toward their best selves. Anicca guides people to adopt uplifting habits—waking on time, meditating, acting altruistically—and to let go of harmful ones such as binge scrolling, alcohol overuse, or dishonesty. The desktop app already delivers tightly structured wake-up and wind-down interventions, while the iOS companion under construction will supply ambient audio and contextual signals. During onboarding interviews Anicca gathers personal commitments, then stores them locally to fuel just-in-time voice nudges. Those nudges are ethical, transparent, and consent-based; as they repeat, Anicca’s external voice becomes an inner guide, helping users catch themselves before slipping. AI, delivered at the right moment with care, can unlock discipline that people cannot sustain alone. We choose to build Anicca now because proactive AI will otherwise default to manipulation; we are committed to leading with care, transparency, and human agency.

---

## Current Experience (Desktop App)
- **Voice-only flow**: The Electron app boots into the system tray at `/apps/desktop`, keeps audio I/O hot, and stays silent until invited (MediaPlayPause / F8 hotkey).
- **Wake & sleep persuasion**: Prompts in `/apps/desktop/prompts/wake_up.txt` and `sleep.txt` enforce the same cadence every morning and night: sharp commands (STATE A_SHOCK), relentless follow-up, and uncompromising reflection (STATE B_PREACH) until the user truly commits. The agent never waits for excuses, and it varies wording each turn to prevent habituation.
- **Onboarding discipline**: `/apps/desktop/prompts/onboarding.txt` scripts the entire interview—name, wake targets, sleep routines, motivations—and locks the operating language. All data lands in `~/.anicca/anicca.md` and `~/.anicca/scheduled_tasks.json`, ensuring every later prompt cites verified facts.
- **Local-first state**: User preferences, schedules, and prompt history live in `~/.anicca/` with encryption where needed. Voice output is brief, precise, and purpose-driven.

---

## Product Surfaces
- **Desktop Voice Agent (shipping)**: Primary compiled artifact under `apps/desktop`. This experience is live and already guiding users through daily wake/sleep commitments.
- **iOS/Smartphone App (in development)**: Lives in `/Anicca`. Captures ambient audio and context that will enrich the persuasion loop and extend it beyond the desktop.
- **Landing Page**: https://aniccaai.com — introduces the philosophy, current desktop release, and upcoming mobile surface.

---

## Onboarding & Daily Flow
1. User installs the desktop app and completes the voice-led onboarding interview scripted in `onboarding.txt`, capturing wake/sleep targets, motivations, and consent.
2. The agent stores contextual facts (commitments, motivations, constraints) locally and fixes the operating language.
3. When scheduled times arrive—especially the wake sequence—the `wake_up.txt` cadence kicks in: shock commands, relentless admonition, and reflective pressure until the user stands up for real.
4. Evenings mirror the process via `sleep.txt`, cutting off late-night drift and forcing closure.
5. After each exchange Anicca logs updates, returns to silence, and waits for the next intentional moment to intervene.

---

## Roadmap
- **Hosted MCP integrations (future)**: Calendar, email, and journal tools are being prepared but are not yet available in production. The desktop agent is already structured to consume them once stabilized.
- **Enterprise & social channels (future)**: Slack and similar connections are explicitly out of scope in current builds; they will be reintroduced only after the persuasion loop reaches the desired quality bar.
- **Expanded habit domains**: Meditation, generosity prompts, and attention steering will follow with better context engineering. 

---

## Repository Layout
```
.
├── apps/
│   ├── desktop/                 # Core desktop voice agent (Electron + TypeScript)
│   │   ├── assets/desktop/      # Icons and media
│   │   ├── build/               # Entitlements, packaging config
│   │   ├── prompts/             # Persuasion prompt definitions (onboarding, wake, sleep)
│   │   └── src/                 # Main process, audio bridge, persuasion logic
│   ├── api/                     # Proxy/API (Railway deployment target – planned integration)
│   ├── web/                     # Web app (Next.js, Vercel)
│   ├── landing/                 # Landing page (Netlify)
│   └── workspace-mcp/           # Hosted MCP services (planned for future releases)
├── Anicca/                      # iOS app source (ambient sensing, in development)
├── docs/                        # Design notes and research (Japanese primary)
├── examples/                    # Reference snippets
└── README.md
```

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
