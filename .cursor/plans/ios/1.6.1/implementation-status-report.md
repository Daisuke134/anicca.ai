# 1.6.1 Spec Implementation Audit (2026-02-04)

Scope: `.cursor/plans/ios/1.6.1/*.md`

## Summary

| Spec | Status | Evidence / Notes |
|---|---|---|
| `1.6.1-fix-before-merge.md` | ✅ Done | Backend patches are present in `apps/api/src/agents/commander.js`, `apps/api/src/agents/groundingCollectors.js`, `apps/api/src/agents/reasoningLogger.js`, `apps/api/src/jobs/generateNudges.js`, and tests in `apps/api/src/agents/__tests__/*` and `apps/api/src/jobs/__tests__/*`. |
| `spec-1.6.1-quality-fix.md` | ✅ Done | Same patch set as above is implemented. Prompt updates, duplicate validation, content grounding, and logging updates are present. |
| `spec-att-implementation.md` | ❌ Not implemented (conflicts) | Repo has *removal* of ATT/Singular per `spec-remove-att-frontend.md` (see `AppDelegate.swift`, `OnboardingStep.swift`, absence of ATT APIs). |
| `spec-remove-att-frontend.md` | ✅ Done | ATT/Singular removed, no ATT frameworks or NSUserTrackingUsageDescription; see `AppDelegate.swift`, `OnboardingStep.swift`, `aniccaios-Bridging-Header.h`, configs, no `SingularManager.swift`. |
| `spec-auto-article-poster.md` | ✅ Done | Skill exists at `.claude/skills/auto-article-poster/` with `SKILL.md`, `seo-guideline.md`, `article-template.md`, `tone-and-voice.md`. |
| `spec-day-cycling-fallback.md` | ✅ Done | Day-cycling logic in `aniccaios/aniccaios/Services/NudgeContentSelector.swift` and `NudgeStatsManager.swift`; tests in `aniccaios/aniccaiosTests/DayCyclingTests.swift`. |
| `spec-maestro-cleanup-and-best-practices.md` | ❌ Not done | `/aniccaios/maestro/` still exists; root `/maestro/` does **not** exist; cleanup/move not applied. Skill exists at `.claude/skills/maestro-ui-testing/SKILL.md` (done). |
| `spec-mixpanel-openclaw-onboarding-paywall.md` | ⚠️ Partial | Patch A/B/C/D are manual/infra (not verifiable in repo). Patch E (Welcome social proof + EN/JA strings) is **not** implemented. |
| `spec-openclaw-implementation.md` | ❌ Not implemented | Requires `~/.openclaw/*` config + skills on local/VPS; not present in repo. |
| `TODO-cross-user-learning-aggregation.md` | ✅ Done (spec is stale) | `apps/api/src/jobs/aggregateTypeStats.js` exists and is invoked from `generateNudges.js`; tests present in `apps/api/src/jobs/__tests__/aggregateTypeStats.test.js`. |
| `SOUL.md` | N/A | Narrative content only; no implementation requirements. |
| `prompt.md` | N/A | Narrative/marketing prompt draft; no implementation requirements. |

## Missing Items + Required Patches

### 1) `spec-att-implementation.md` (ATT re-add) — **Conflict with `spec-remove-att-frontend.md`**
Current repo implements removal of ATT/Singular. To satisfy **both** specs is impossible; choose one. If you want ATT **implemented**, apply all of the following changes (this will undo the removal spec):

Patch outline (not applied):
- Add `ATTPermissionStepView.swift` and integrate into onboarding flow.
- Re-add `NSUserTrackingUsageDescription` to `Info.plist` + localized `InfoPlist.strings` (6 languages).
- Reintroduce ATT frameworks and related code paths in `AppDelegate.swift`.
- Re-add Singular SDK package and `SingularManager` calls (if required).

Key files:
- `aniccaios/aniccaios/Onboarding/OnboardingStep.swift`
- `aniccaios/aniccaios/Onboarding/OnboardingFlowView.swift`
- `aniccaios/aniccaios/AppDelegate.swift`
- `aniccaios/aniccaios/Info.plist`
- `aniccaios/aniccaios/Resources/*/InfoPlist.strings`
- `aniccaios/aniccaios/Services/AnalyticsManager.swift`
- `aniccaios/Configs/*.xcconfig`
- `aniccaios/aniccaios.xcodeproj/project.pbxproj`

### 2) `spec-maestro-cleanup-and-best-practices.md` — **Not implemented**
Required to satisfy spec:
- Remove legacy folder `aniccaios/maestro/`.
- Ensure single root `maestro/` directory exists with `01-onboarding.yaml` (and old `01-onboarding-fixed.yaml` removed).
- Confirm timeout is 15000ms in `maestro/01-onboarding.yaml`.

Patch outline (not applied):
- Move or recreate current flows from `aniccaios/maestro/` into root `maestro/`.
- Delete `/aniccaios/maestro/` after move.

### 3) `spec-mixpanel-openclaw-onboarding-paywall.md` — **Patch E (Welcome social proof) missing**
Spec says only **Welcome** changes are required in 1.6.1 (Value/Notifications are explicitly 1.6.2).

Required patch (not applied):
1) Add EN/JA strings:
- `aniccaios/aniccaios/Resources/en.lproj/Localizable.strings`
- `aniccaios/aniccaios/Resources/ja.lproj/Localizable.strings`

Add key:
- `"onboarding_welcome_social_proof" = "Join thousands finding peace";`
- `"onboarding_welcome_social_proof" = "多くの人が安らぎを見つけています";`

2) Update `aniccaios/aniccaios/Onboarding/WelcomeStepView.swift`:
- Insert social proof text above title.
- Reduce title font size and allow 3 lines per spec.

### 4) `spec-openclaw-implementation.md` — **External/infra not implemented**
This spec requires OpenClaw setup in `~/.openclaw/` and skills in `~/.openclaw/skills/*` on local/VPS. Not present in repo. To satisfy:
- Create `~/.openclaw/openclaw.json` with described config.
- Install skills: `daily-metrics-reporter`, `slack-mention-handler`.
- Add cron jobs via `openclaw cron add ...`.
- Verify with `openclaw gateway status` and `openclaw channels test slack`.

### 5) `spec-mixpanel-openclaw-onboarding-paywall.md` — **Patch A/B/C/D (manual)**
These are dashboard/infra tasks and cannot be verified from repo:
- Mixpanel funnel definitions and token settings.
- RevenueCat Experiments and paywall design.
- OpenClaw cron + slack mention handler.

## Notes on Items That Are Implemented

- **Day-Cycling**: Fully implemented, including tests. `NudgeContentSelector.swift` uses day-cycling in fallback and debug; `NudgeStatsManager.swift` tracks onboarding dates.
- **Quality Fix / Commander**: All prompt changes, JSON format, duplicate checks, guardrail behavior, grounding collectors, and logging updates are present. Tests updated to include root cause logging and duplicate validation.
- **Cross-User Learning Aggregation**: `aggregateTypeStats.js` exists and is invoked; TODO spec is stale.

## Tests

No automated tests were run as part of this audit.
