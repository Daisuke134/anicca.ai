# Testing Strategy & Requirements

## Minimum Test Coverage: 80%

## Test Pyramid

```
        /\
       /  \      E2E Tests (10%) <- Maestro
      /____\
     /      \    Integration Tests (20%) <- XCTest
    /________\
   /          \  Unit Tests (70%) <- Swift Testing / XCTest
  /______________\
```

| Layer | Ratio | Speed | Tool | What to Test |
|-------|-------|-------|------|-------------|
| Unit Tests | 70% | ms | Swift Testing / XCTest | Single function/method |
| Integration Tests | 20% | sec | XCTest + Mock | Multi-service coordination |
| E2E Tests | 10% | min | Maestro | Full user flows |

## TDD Cycle (Mandatory)

```
1. RED    -> Write a failing test (define the feature)
2. GREEN  -> Write minimal code to pass the test
3. REFACTOR -> Clean up the code (tests stay green)
4. REPEAT -> Next feature
```

**Why TDD?**
- Catch bugs at **commit time** (not after deploy)
- Forces better design (testable = good design)
- Makes refactoring safe

## Test Code Best Practices

### AAA Pattern (Required)

All tests must follow **Arrange-Act-Assert**:

```swift
func testUserLogin() {
    // Arrange: prepare test data and dependencies
    let mockAuth = MockAuthService()
    let viewModel = LoginViewModel(auth: mockAuth)

    // Act: execute the action under test
    viewModel.login(email: "test@example.com", password: "pass123")

    // Assert: verify expected results
    #expect(viewModel.isLoggedIn == true)
}
```

### Swift Testing (Xcode 16+, Recommended)

Use the Swift Testing framework for new tests:

```swift
// XCTest (legacy)
XCTAssertEqual(result, expected)
XCTAssertTrue(condition)

// Swift Testing (recommended)
#expect(result == expected)
#expect(condition)

// Parameterized tests (Swift Testing strength)
@Test(arguments: ["staying_up_late", "cant_wake_up", "anxiety"])
func testProblemTypeContent(type: String) {
    let content = NudgeContent.forProblemType(type)
    #expect(content != nil)
}
```

### FIRST Principles

| Principle | Description |
|-----------|-------------|
| **F**ast | Complete in milliseconds (slow tests don't get run) |
| **I**solated | No dependency on other tests |
| **R**epeatable | Same result every time |
| **S**elf-validating | Pass/Fail determined automatically |
| **T**horough | Cover edge cases |

### Test Length

**Target: 10 lines or less.** Long tests are a sign of excessive complexity.

## Test File Locations

| Type | Path | Naming Convention |
|------|------|-------------------|
| Unit Tests | `aniccaios/aniccaiosTests/` | `*Tests.swift` |
| Integration Tests | `aniccaios/aniccaiosTests/Integration/` | `*IntegrationTests.swift` |
| E2E Tests | `maestro/` | `NN-description.yaml` |

## New Feature Implementation Flow (3 Gates)

Follow the "3-Gate Development Workflow" in CLAUDE.md:

```
GATE 1: Spec creation (core 6 sections) -> codex-review -> ok: true
    |
GATE 2: TDD implementation (RED -> GREEN -> REFACTOR)
    |
GATE 3: codex-review -> ok: true -> Maestro E2E if UI changed
    |
User device confirmation -> "OK" -> merge to dev
```

## Test Execution Commands

**xcodebuild direct execution is strictly forbidden. Always use Fastlane.**

```bash
# Unit Tests + Integration Tests (mandatory: via Fastlane)
cd aniccaios && fastlane test

# E2E Tests (Maestro)
maestro test maestro/

# Individual E2E
maestro test maestro/01-onboarding.yaml
```

**Forbidden:**
- `xcodebuild test` direct execution
- `xcodebuild build` direct execution
- Any Xcode CLI without Fastlane

## GitHub Actions CI/CD

PR push triggers automatic execution:

```
1. Unit Tests -> blocks PR on failure
2. Integration Tests -> blocks PR on failure
3. E2E Tests (Maestro) -> blocks PR on failure
4. Build -> TestFlight upload available on success
```

## TDD vs Maestro E2E (When to Use Which)

**Completely different purposes. Maestro only for UI changes.**

| Aspect | TDD (Unit/Integration) | Maestro E2E |
|--------|------------------------|-------------|
| **What** | Logic, calculations, data transforms | UI interactions, navigation |
| **Speed** | ms to sec | minutes |
| **Ratio** | 70-90% | 10% |
| **When** | Always (TDD cycle) | UI changes only |

### TDD Scope (Unit/Integration)

```
Algorithms (NudgeContentSelector, Thompson Sampling, etc.)
Data transforms / parsing
UserDefaults save/load
API response handling
Date calculations, validation
Service-to-service coordination
```

### Maestro Scope (E2E)

```
Screen navigation (onboarding, tab switching)
Button tap -> next screen
UI element visibility
Full user flows
```

### When to Skip Maestro

| Change | Maestro | Reason |
|--------|---------|--------|
| Notification logic fix | Skip | Unit Test sufficient |
| API add/modify | Skip | Integration Test sufficient |
| Data model change | Skip | Unit Test sufficient |
| Internal refactoring | Skip | Existing tests passing = OK |
| **New button added** | Required | Verify tap behavior |
| **New screen added** | Required | Verify navigation |
| **Onboarding change** | Required | Verify full flow |

### Decision Flow

```
UI changes?
    |
    +-> Yes -> Create Maestro E2E
    |          (new screens, buttons, navigation)
    |
    +-> No  -> Skip Maestro
               TDD + user device confirmation is sufficient
```

## Maestro E2E Best Practices

### Core Rules

| Rule | Description |
|------|-------------|
| **Agents use MCP** | MCP tools over CLI |
| **1 Flow = 1 Scenario** | Don't cram everything into one YAML |
| **Organize by directory** | Subdirectories per feature |
| **Tag-based execution** | smokeTest, regression, nightly |
| **Accessibility ID required** | Use `.accessibilityIdentifier()`, not Debug buttons |

### Directory Structure (Recommended)

```
maestro/
+-- auth/
|   +-- 01-login.yaml
|   +-- 02-logout.yaml
+-- onboarding/
|   +-- 01-full-flow.yaml
+-- nudge/
|   +-- 01-nudge-display.yaml
|   +-- 02-nudge-feedback.yaml
+-- config.yaml  <- shared config
```

### Tag Usage

```yaml
# maestro/nudge/01-nudge-display.yaml
appId: com.anicca.ios
tags:
  - smokeTest
  - nudge
---
- launchApp
```

```bash
# CI/CD execution (GitHub Actions, fastlane, etc.)
maestro test maestro/ --include-tags=smokeTest  # Smoke tests only
maestro test maestro/                            # All tests

# Agent work uses MCP (see above)
```

### Accessibility Identifier (Debug Buttons Forbidden)

| NG | OK |
|----|-----|
| `#if DEBUG` to add buttons | Set `accessibilityIdentifier` |
| Buttons clutter the UI | No impact on production UI |
| Complex to manage | Simple and stable |

**Implementation example:**
```swift
// NG: Add Debug button
#if DEBUG
Button("Test LLM Generated") { ... }
#endif

// OK: Set Accessibility Identifier
Text(nudge.content)
    .accessibilityIdentifier("nudge_content_\(nudge.isAIGenerated ? "llm" : "rule")")
```

**Maestro YAML example:**
```yaml
- assertVisible:
    id: "nudge_content_llm"
```

### Japanese Text Considerations

**Verify actual text via View Hierarchy. It often differs from expectations.**

| Expected | Actual (View Hierarchy) |
|----------|------------------------|
| `利用規約` | `利用規約 (EULA)` |
| `プライバシーポリシー` | `プライバシーポリシー` |
| `はじめる` | `はじめる` or `Get Started` |

**Required flow:**
1. `mcp__maestro__inspect_view_hierarchy` to confirm actual text
2. Use confirmed text as-is in YAML
3. Pipe `|` for bilingual support: `text: "利用規約 (EULA)|Terms of Use"`

### Limitations

| Item | Status |
|------|--------|
| iOS Simulator | Fully supported |
| iOS Device | No direct support (via BrowserStack or Maestro Cloud) |

**Maestro = simulator testing. Device testing uses `fastlane build_for_device` separately.**

## Device Testing (No TestFlight Needed)

**Workflow:**
1. After Unit Tests + E2E (Maestro) pass, run `fastlane build_for_device`
2. If device not connected -> launch on simulator and ask user to confirm
3. Only ask permission to install on device for device-only features (notification tap, sensors, etc.)

```bash
# Install on device with staging scheme
cd aniccaios && fastlane build_for_device

# Device not connected -> confirm on simulator
cd aniccaios && fastlane build_for_simulator
# After simulator launch, ask user to confirm
```

**Important:**
- Agent executes commands (don't ask user to run them)
- Device not connected -> fallback to simulator -> ask user to confirm
- Only request device install for device-only features
- TestFlight is for final confirmation/distribution. Use `build_for_device` or `build_for_simulator` during development
- Accessibility Identifiers work in release builds

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first
- **test-automation-engineer** - For comprehensive test suite design
