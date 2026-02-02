**進め方**  
| ステップ | 内容 |
|---|---|
| 1 | 公式ドキュメント/CI/SwiftUIセレクタ/待機戦略の要点を確認済み ([docs.maestro.dev](https://docs.maestro.dev/getting-started/running-flows-on-ci?utm_source=openai)) |
| 2 | 変更対象ファイルのBefore/After案を提示（この返信） |
| 3 | 承認後にworktree作成→実装→必要なら最小テスト実行→コミット |

**調査ソース（要約）**  
| 目的 | 参照 |
|---|---|
| 待機戦略/アサーション | Maestro waitコマンド/ assertVisible/ assertNotVisible ([docs.maestro.dev](https://docs.maestro.dev/advanced/wait?utm_source=openai)) |
| iOS SwiftUI セレクタ/識別子 | Maestro iOS SwiftUI / UIKitのid・label対応 ([docs.maestro.dev](https://docs.maestro.dev/platform-support/ios-uikit?utm_source=openai)) |
| CI 実行 | Maestro CI実行/CI統合、クラウド/シミュレータ要件 ([docs.maestro.dev](https://docs.maestro.dev/getting-started/running-flows-on-ci?utm_source=openai)) |
| 参考記事 | Zenn（tellernovel） ([zenn.dev](https://zenn.dev/tellernovel_inc/articles/79c261b52daed8)) |

**Before/After（ドキュメント・ルール）**  
| ファイル | Before | After |
|---|---|---|
| `.claude/rules/maestro-best-practices.md` | （新規） | ```md
# Maestro ベストプラクティス

## YAML構文の基本
- 1 Flow = 1目的（小さく分割し、再利用はrunFlowでまとめる）
- name / tags を付けてフィルタ可能にする
- セレクタは id を優先し、text/point は補助として使う
- point（座標指定）は最後の手段
- 重要な分岐や確認にはコメントを入れて意図を残す

## accessibilityIdentifier 命名規則
- 形式: {画面}-{要素}-{識別子}
- 例:
  - onboarding-welcome-cta
  - onboarding-struggles-option-staying_up_late
- リスト項目は必ず一意な識別子を付与する
- SwiftUIでは .accessibilityIdentifier("...") を明示する

## 待機戦略（安定性の要）
- 基本は assertVisible / assertNotVisible を使う
- 長時間の待機が必要な場合のみ extendedWaitUntil を使う
- アニメーション/動画完了待ちは waitForAnimationToEnd を使う
- sleep系の固定待機は原則避ける（不安定化の原因）

## エラーハンドリング
- 「tap → 遷移確認 → assert」の順で必ず確認する
- システムダイアログは optional: true で安全に通過させる
- 重要ポイントでは takeScreenshot を入れてデバッグ容易性を確保する

## CI環境での注意点
- Maestro Cloud か、iOS Simulator + IDB 対応環境で実行
- CI統合ではFlowを1ディレクトリに集約するのが推奨（.maestro/ が標準）
- Cloud利用時はOS/デバイス指定を明示できる

## 参考
- https://maestro.mobile.dev/
- https://docs.maestro.dev/getting-started/running-flows-on-ci
- https://docs.maestro.dev/advanced/wait
- https://docs.maestro.dev/platform-support/ios-swiftui
- https://docs.maestro.dev/cloud/ci-integration/integration-with-any-ci-platform
- https://zenn.dev/tellernovel_inc/articles/79c261b52daed8
```  
([docs.maestro.dev](https://docs.maestro.dev/advanced/wait?utm_source=openai)) |
| `CLAUDE.md` | （E2Eルールなし） | ```md
### E2E テストルール
- UI変更時は必ず maestro/ のテストも更新
- accessibilityIdentifier は {画面}-{要素}-{識別子} 形式
- テストはタップ→遷移→アサーションの流れを必ず含める
``` |

**Before/After（テスト・iOS）**  
| ファイル | Before | After |
|---|---|---|
| `maestro/examples/01-good-onboarding-test.yaml` | （新規） | ```yaml
appId: ai.anicca.app.ios
name: Onboarding - Complete Flow
tags:
  - smokeTest
  - onboarding
---
- clearState
- clearKeychain
- launchApp

# Step 1: Welcome
- assertVisible:
    id: "onboarding-welcome-screen"
- tapOn:
    id: "onboarding-welcome-cta"

# Step 2: Value
- assertVisible:
    id: "onboarding-value-screen"
- assertNotVisible:
    id: "onboarding-welcome-screen"
- tapOn:
    id: "onboarding-value-next"

# Step 3: Struggles
- assertVisible:
    id: "onboarding-struggles-screen"
- assertNotVisible:
    id: "onboarding-value-screen"
- tapOn:
    id: "onboarding-struggles-option-staying_up_late"
- tapOn:
    id: "onboarding-struggles-next"

# Step 4: Notifications
- assertVisible:
    id: "onboarding-notifications-screen"
- assertNotVisible:
    id: "onboarding-struggles-screen"
- tapOn:
    id: "onboarding-notifications-allow"

# System dialog (optional)
- tapOn:
    text: "許可|Allow"
    optional: true

# Final check (may depend on paywall state)
- assertVisible:
    text: "マイパス|My Path"
``` |
| `maestro/01-onboarding.yaml` | ```yaml
- extendedWaitUntil:
    visible: true
    timeout: 15000
``` | ```yaml
# Step 1: Welcome screen
- assertVisible:
    id: "onboarding-welcome-screen"

- tapOn:
    id: "onboarding-welcome-cta"

# Step 2: Value screen
- assertVisible:
    id: "onboarding-value-screen"
- assertNotVisible:
    id: "onboarding-welcome-screen"

- tapOn:
    id: "onboarding-value-next"

# Step 3: Struggles screen
- assertVisible:
    id: "onboarding-struggles-screen"
- assertNotVisible:
    id: "onboarding-value-screen"

- tapOn:
    id: "onboarding-struggles-option-staying_up_late"
- tapOn:
    id: "onboarding-struggles-next"

# Step 4: Notifications screen
- assertVisible:
    id: "onboarding-notifications-screen"
- assertNotVisible:
    id: "onboarding-struggles-screen"

- tapOn:
    id: "onboarding-notifications-allow"
``` |
| `aniccaios/aniccaios/Onboarding/WelcomeStepView.swift` | ```swift
.accessibilityIdentifier("onboarding-welcome-cta")
...
.accessibilityIdentifier("onboarding-restore-button")
``` | ```swift
.accessibilityIdentifier("onboarding-welcome-screen") // root container
.accessibilityIdentifier("onboarding-welcome-title")
.accessibilityIdentifier("onboarding-welcome-subtitle-line1")
.accessibilityIdentifier("onboarding-welcome-subtitle-line2")
.accessibilityIdentifier("onboarding-welcome-cta")
.accessibilityIdentifier("onboarding-welcome-restore-button")
``` |
| `aniccaios/aniccaios/Onboarding/ValueStepView.swift` | ```swift
.accessibilityIdentifier("onboarding-value-next")
``` | ```swift
.accessibilityIdentifier("onboarding-value-screen") // root container
.accessibilityIdentifier("onboarding-value-title")
.accessibilityIdentifier("onboarding-value-next")
``` |
| `aniccaios/aniccaios/Onboarding/StrugglesStepView.swift` | ```swift
.accessibilityIdentifier("onboarding-struggles-next")
.accessibilityIdentifier("onboarding-struggles-skip")
.accessibilityIdentifier("onboarding-struggle-\(key)")
``` | ```swift
.accessibilityIdentifier("onboarding-struggles-screen") // root container
.accessibilityIdentifier("onboarding-struggles-title")
.accessibilityIdentifier("onboarding-struggles-subtitle")
.accessibilityIdentifier("onboarding-struggles-next")
.accessibilityIdentifier("onboarding-struggles-skip")
.accessibilityIdentifier("onboarding-struggles-option-\(key)")
``` |
| `aniccaios/aniccaios/Onboarding/NotificationPermissionStepView.swift` | ```swift
.accessibilityIdentifier("onboarding-notifications-allow")
``` | ```swift
.accessibilityIdentifier("onboarding-notifications-screen") // root container
.accessibilityIdentifier("onboarding-notifications-title")
.accessibilityIdentifier("onboarding-notifications-description")
.accessibilityIdentifier("onboarding-notifications-allow")
``` |

**承認依頼**  
| 依頼 | 内容 |
|---|---|
| 承認 | 上記Before/Afterで実装を進めます。承認ください。 |

