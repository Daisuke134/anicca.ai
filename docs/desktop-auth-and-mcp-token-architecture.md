# Anicca Desktop Auth + MCP Token Architecture (Requirements)

## 1. Purpose & Non‑Goals
- Purpose:
  - Safe desktop (Electron) authentication for Anicca users.
  - External OAuth (Google Workspace, etc.) requires one‑time consent; continues to work across redeploys.
  - Scalable pattern for multiple MCPs (Gmail/Calendar/Drive/…).
- Non‑Goals:
  - Store external refresh/access tokens on the desktop.
  - Use embedded webviews for OAuth (external system browser only).

## 2. Identity / App Authentication (Supabase)
- IdP: Supabase Auth with PKCE.
- Browser: External system browser (RFC 8252 Native Apps).
- Redirect: Loopback 127.0.0.1 (dynamic port) with state/nonce.
- Desktop storage: Persist only Supabase session (OS secure store or encrypted local file). No external provider tokens here.

## 3. External OAuth (Google Workspace, etc.)
- Flow: Authorization Code + PKCE in external browser.
- Callback:
  - Recommended: Proxy callback (https://<proxy>/api/mcp/<provider>/callback) → exchange code → persist tokens → redirect success.
  - Alternative: MCP direct callback (https://<mcp>/oauth2callback).
- Scopes: Minimal per MCP TOOLS (e.g., Gmail: gmail.readonly, gmail.compose, gmail.send).
- Desktop responsibility: Only pass userId to Proxy /status; register hosted MCP with authorization received from /status.

## 4. Token Storage, Encryption, Refresh (Server)
- Store: Postgres (Railway Managed Postgres).
- Schema (logical):
  - tokens(user_id PK, provider, provider_sub, email, access_token_enc, refresh_token_enc, scope, expiry, created_at, updated_at, rotation_family_id, revoked_at, metadata).
- Encryption: Envelope (DEK + KMS). Encrypt access/refresh with AES‑GCM; wrap DEK in Cloud KMS; rotate KMS key semi‑annually, DEK on refresh.
- Refresh:
  - Before /status returns, check expiry; refresh if needed.
  - Use refresh token rotation; revoke on reuse detection.
- Secrets: Never commit plaintext; provision via environment/secret manager.

## 5. ID Strategy (Join Key)
- Primary key: Supabase userId (Anicca user).
- Aux: provider_sub, email for diagnostics; do not use as join key.

## 6. Minimal API Contract (Server)
- POST /api/mcp/<provider>/status — in: { userId }; out (connected): { connected:true, server_url, authorization }; else { connected:false, server_url }.
- GET  /api/mcp/<provider>/oauth-url?userId=... — out: { url }.
- GET  /api/mcp/<provider>/callback?code=...&state=userId — exchange, persist, success HTML.
- POST /api/mcp/<provider>/revoke (future) — revoke refresh, scrub DB.

## 7. Desktop (Anicca) Requirements
- Supabase login with PKCE (external browser + loopback).
- On connect: call /status → if not connected open /oauth-url → after consent /status returns authorization for hosted MCP registration.
- Logging: tool start/done; optional server tool‑logs echo only in dev builds.

## 8. Security & Compliance
- RFC 8252 (native apps with external browser + loopback).
- OAuth 2.1 patterns (PKCE mandatory; no implicit; short‑lived access; refresh protection & rotation).
- TLS 1.2+ (prefer 1.3). Loopback HTTP allowed by RFC 8252 only.
- Audit logging for token issue/refresh/revoke; redact secrets.

## 9. Ops & Config
- Env (examples): DB_URL, KMS config, MCP_ENABLE_OAUTH21=true, TOOLS=calendar,gmail, WORKSPACE_MCP_ECHO_TOOL_TRACES=false (true only in dev).
- Rotation: KMS key 6‑monthly; app secrets 3‑monthly; refresh token per rotation policy.
- Redeploy resilience: Tokens in DB → /status always returns fresh authorization → no re‑consent.

## 10. Acceptance (DoD)
- After redeploy: previously consented user receives connected:true + authorization from /status and can run hosted MCP immediately.
- Desktop shows tool start/done; server tool‑logs (dev only) are visible in terminal.
- DB stores encrypted tokens; audit logs exist for issue/refresh/revoke.

---

### References (industry guidance)
- RFC 8252: OAuth 2.0 for Native Apps — external browser + loopback
- OAuth 2.1 / Security BCP — PKCE, token rotation, sender constraints
- Auth0 & vendor guides — refresh token rotation best practices
- Supabase PKCE flow — official docs for session handling
