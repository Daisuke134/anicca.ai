分からない部分は徹底的に調べた上でお願いします。徹底的にドキュメントなど、最初のドキュメントなどをきちんと調べて、正確な実装をしていきたいので、お願いします。きちんと調べてください。妄想で書いたりしないこと。 何をやってほしいかっていうと /Users/cbns03/Downloads/anicca-project/.cursor/plans/v3  これを完全に実装していきたいので、まずは完全な疑似パッチを作ってほしいんですね。 つまりそのままもうその差分を実装すれば完全に今回のプランが完全に提供できるっていう風にしたいので完全なパッチを示してほしいんですよ。 ここフォルダの中に patch.md というものを作ってそこに書いていてほしいんですね。 すごい長くなってしまう可能性があるんで、フェーズごとに分けていいと思います。フェーズ1のpatch.md、フェーズ2のpatch.mdみたいな感じで分けることで、一つ一つが長くなりすぎないようにしましょう。 

/Users/cbns03/Downloads/anicca-project/.cursor/plans/v3/todolist.md これでここに一応Todoリストを作ってありますので

---
<answer_operator>他エージェント（コンポーザ）にそのまま渡せる、「フェーズごとに完全な疑似パッチMDを作らせるためのマスタープロンプト」を書きます。フェーズ番号と出力先MDだけ差し替えて使える形にします。</answer_operator>



> ※ `<PHASE_NUMBER>` と `<OUTPUT_MD_PATH>` だけ差し替えてください。  
> 出力先は「フェーズごとに patch.md」を固定する。  
> 例: フェーズ1なら `<PHASE_NUMBER>=1`、`<OUTPUT_MD_PATH>=.cursor/plans/v3/patches/phase-1/patch.md`

```text
あなたは Cursor 上で動作する実装エージェントです。  
目的は、「Anicca v0.3 のフェーズ<PHASE_NUMBER> に対応する **完全な擬似パッチ MD** を 1 ファイルにまとめること」です。

この MD は、人間開発者や別エージェントが **そのまま apply_patch にコピペすれば実装が完了するレベル** の内容にします。  
コードを直接いじるのではなく、まずこの MD に「決定版パッチ案」をすべて書き出してください。

---

## 0. 前提と制約

### 0-1. リポジトリ前提

- ルート: `/Users/cbns03/Downloads/anicca-project/`
- v0.3 仕様は `.cursor/plans/v3/` 配下の MD 群に集約されています。
- 実装TODOは `.cursor/plans/v3/todolist.md` にまとまっています。

### 0-2. 絶対に守るべき制約

- **技術スタック・バージョンを勝手に変えない**
  - iOS: SwiftUI / 既存の WebRTC / RevenueCat 実装を前提
  - API: Node.js + Express（`apps/api`）、Prisma は `tech-db-schema-v3.md` の案に従う
  - Moss/Exa は v0.3 では**絶対に使わない**（mem0 のみ）
- **UI/UX は `v3-ui.md` / `v3-ux.md` / 既存実装に合わせる**
  - 配色・レイアウト・トーンを勝手に変えない
- **RevenueCat 実装は「既存継続 + entitlement拡張」のみにとどめる**
- できる限り **既存パターンを踏襲し、重複実装を作らない**  
  （既存の `NetworkSessionManager`, `VoiceSessionController`, `ProfileSyncService` 等の設計を尊重）

### 0-3. 外部ドキュメントの利用

コードや擬似パッチを書く前に、**必ず最新の公式ドキュメントを確認**してから設計してください：

- OpenAI Realtime / Function Calling:
  - Realtime ガイド・ツール定義のベストプラクティス
- Apple:
  - DeviceActivity / FamilyControls / App Group / Darwin通知
  - HealthKit (`HKObserverQuery`, `enableBackgroundDelivery`)
  - CoreMotion (`CMMotionActivityManager`)
- mem0:
  - Node SDK Quickstart / API 仕様

Cursor では `web_search` などのツールが使えるので、該当部分の実装前に**一度は公式ドキュメントを開き、仕様と食い違っていないか確認**してください。

**仕様決定に関わる箇所は、patch.md 内に「参照した公式URL一覧」を必ず残す。**
- Apple系（DeviceActivity/FamilyControls/HealthKit/CoreMotion）: 最低 3 URL
- OpenAI Realtime/tool: 最低 1 URL
- mem0 Node SDK/API: 最低 1 URL

参照URLが書けない場合は、そのタスクのパッチ作成を止めて不足情報を報告する（妄想禁止）。

### 0-4. 通知チャネル

v0.3 の通知配信は **ローカル通知（UNUserNotificationCenter）を基本** とし、APNs/VoIPは導入しない（追加の鍵/証明書/審査ノートが必要で迷いが増えるため）。  
※もしv3仕様MDにAPNs必須が明記されている場合のみ、その根拠URLを示して導入する。

---

## 1. フェーズ <PHASE_NUMBER> のスコープ決定

1. `.cursor/plans/v3/todolist.md` を開き、  
   見出し `## フェーズ <PHASE_NUMBER>:` で始まる行（例: `## フェーズ 1: 基盤（...）`）を起点に、  
   次の `## フェーズ` 見出し直前までを対象スコープとする。
2. 対象タスクは `### <PHASE_NUMBER>.<x>` 見出し（例: `### 2.6 ...`）の全て。
3. 各タスクの行に書かれている:
   - `対象ファイル`
   - `依存`
   - `詳細仕様`
   をすべて拾ってください。
4. `詳細仕様` に書かれている MD（例: `tech-db-schema-v3.md` セクション4, `migration-patch-v3.md` セクション2.1 など）をすべて開き、その内容を**ソース・オブ・トゥルース**として参照します。

---

## 2. 参照すべき v3 仕様 MD 一覧

フェーズに応じて、以下の MD を優先的に参照してください。  
（タスクの `詳細仕様` で指定されているものが最優先です）

- **全フェーズ共通**
  - `.cursor/plans/v3/todolist.md`
  - `.cursor/plans/v3/v3-stack.md`（特にセクション10〜14）
  - `.cursor/plans/v3/v3-data.md`

- **DB / Prisma / マイグレーション（主にフェーズ1,2）**
  - `.cursor/plans/v3/tech-db-schema-v3.md`
  - `.cursor/plans/v3/migration-patch-v3.md`

- **API / bandit / stateBuilder / Nudge（主にフェーズ2,8）**
  - `.cursor/plans/v3/tech-state-builder-v3.md`
  - `.cursor/plans/v3/tech-bandit-v3.md`
  - `.cursor/plans/v3/tech-nudge-scheduling-v3.md`
  - `.cursor/plans/v3/tech-ema-v3.md`
  - `.cursor/plans/v3/prompts-v3.md`
  - `.cursor/plans/v3/file-structure-v3.md`

- **iOS 基盤 / UI（フェーズ3〜6,9）**
  - `.cursor/plans/v3/migration-patch-v3.md` セクション1.x
  - `.cursor/plans/v3/file-structure-v3.md`
  - `.cursor/plans/v3/v3-ui.md`
  - `.cursor/plans/v3/v3-ux.md`
  - `.cursor/plans/v3/quotes-v3.md`
  - `.cursor/plans/v3/ios-sensors-spec-v3.md`
  - `.cursor/plans/v3/tech-ema-v3.md`

- **センサー / Nudge / bandit（フェーズ7,8）**
  - `.cursor/plans/v3/ios-sensors-spec-v3.md`
  - `.cursor/plans/v3/tech-state-builder-v3.md`
  - `.cursor/plans/v3/tech-bandit-v3.md`
  - `.cursor/plans/v3/tech-nudge-scheduling-v3.md`

各タスクのパッチを書く前に、必ず該当 MD のセクションを読んで仕様を反映してください。

---

## 3. 出力フォーマット（MD の構造）

あなたの出力は **1つの MD ファイル** `<OUTPUT_MD_PATH>` に対応します。構造は次のようにしてください。

```markdown
# Anicca v0.3 フェーズ<PHASE_NUMBER> 擬似パッチ

## 概要
- 対象フェーズ: <PHASE_NUMBER>
- 対象タスク: `<PHASE_NUMBER>.x` の全タスク
- 参照仕様:
  - `todolist.md` フェーズ<PHASE_NUMBER>
  - （ここに読んだ v3 MD ファイルを列挙）

## ファイル別の変更概要
### 1. apps/api/... の変更
- `apps/api/...` にこういう機能を追加
- ...

### 2. aniccaios/... の変更
- ...

## 完全パッチ（apply_patch 互換）

```text
*** Begin Patch
*** Update File: path/to/file1.ext
@@ context @@
- old code
+ new code
@@ other context @@
*** Add File: new/path/to/file2.ext
+ ...new code...
*** End Patch
```
```

- 「ファイル別の変更概要」では、**人間がざっと読んで何をするか分かるレベル**で説明してください。
- 「完全パッチ」セクションは、Cursor の `functions.apply_patch` が受理する **V4A形式のみ**で書くこと。
  - 禁止: `diff --git` 形式、git patch形式、ファイル全量貼り付けのみ、行番号（L123:）混入
  - 必須: `*** Begin Patch` / `*** Update File:` / `*** Add File:` / `@@` コンテキスト / `*** End Patch`

---

## 4. パッチの中身のルール

### 4-1. 共通

- **必ず既存コードを読んでからパッチを書く**こと：
  - 例: `aniccaios/aniccaios/AppState.swift` を読む → 既存の保存/同期パターンに合わせて変更。
- 既存の命名規則・フォルダ構成に合わせる（`file-structure-v3.md` を参照）。
- **重複機能を作らない**:
  - 既に似た関数/サービスがある場合は、それを拡張・再利用するパッチにする。

### 4-2. フェーズ別のポイント（ざっくり）

- **フェーズ1（DB / 環境変数 / UUID計画）**
  - `apps/api/prisma/schema.prisma` への新モデル定義（`tech-db-schema-v3.md`）
  - Prisma migration は apply_patch だけで完結しない場合があるため、必ず二段構えにする:
    - (A) `schema.prisma` のパッチ（必須）
    - (B) `prisma migrate` 実行後に生成された `apps/api/prisma/migrations/<GENERATED_DIR>/migration.sql` に対する追記パッチ
      ※ `<GENERATED_DIR>` は実行時に確定するので、patch.md では「ユーザーが手元で置換」する前提で書く
  - さらに、patch.md の最後に「ユーザーが実行するコマンド」を明記する（実行はしない、手順として書く）。
  - `apps/api/src/config/environment.js` に `MEM0_API_KEY` 等を追加（`v3-stack.md` 12.x）

- **フェーズ2（API / bandit / stateBuilder / mem0）**
  - `apps/api/src/routes/mobile/*.js`
  - `apps/api/src/modules/{memory,nudge,metrics,simulation}/...`
  - `apps/api/src/services/{mobile/profileService.js, openaiRealtimeService.js, subscriptionStore.js}`

- **フェーズ3（AppState / Models / MainTabView / Network）**
  - `AppState.swift`, `UserProfile.swift`, `OnboardingStep.swift`
  - `NetworkSessionManager.swift`, `QuoteProvider.swift`
  - `MainTabView.swift`, `SubscriptionInfo.swift`

- **フェーズ4〜6（Onboarding / Talk / Session / Behavior / Profile UI）**
  - `Views/Onboarding/*`, `Views/Talk/*`, `Views/Session/*`
  - `Views/Behavior/*`, `Views/Profile/*`, `SettingsView.swift`

- **フェーズ7（Sensors / MetricsUploader / Sensor flags in AppState）**
  - `Sensors/DeviceActivityMonitor.swift`, `HealthKitManager.swift`, `MotionManager.swift`
  - `Services/MetricsUploader.swift`
  - `AppState.swift` にセンサー許可フラグ追加

- **フェーズ8（NudgeTriggerService / Notifications / bandit連携）**
  - `Services/NudgeTriggerService.swift`
  - `Notifications/NotificationScheduler.swift`, `AlarmKitHabitCoordinator.swift`
  - `VoiceSessionController` と Feeling EMI / bandit の接続

- **フェーズ9（Info.plist / 手動チェックリスト / Fallback文言）**
  - `Info.plist` の UsageDescription 系の更新
  - `docs/checklists/v0.3-manual-test.md`
  - Settings の「未許可時UXコピー」

---

## 5. GUI / ユーザー操作が必要な箇所の明示

**とても重要です。**

コードのパッチだけでは完結しない箇所（GUI設定やAPIキー取得など）がある場合は、MD の最後に必ずこのセクションを作ってください。

```markdown
## ユーザーが GUI で行う必要がある設定

1. Railway 環境変数の設定
   - 対象: `apps/api` がデプロイされている Railway プロジェクト
   - 追加/確認する変数:
     - `MEM0_API_KEY`: mem0 ダッシュボードから取得した API キー
     - （他に追加したものがあれば列挙）
   - 手順（簡潔でよい）:
     - Railway の Dashboard を開く
     - 対象プロジェクト > Variables で上記を追加
2. Xcode Capabilities / Entitlements
   - FamilyControls / App Group / HealthKit / Motion など
   - どの Target に何を ON にするかを箇条書き
3. その他
   - RevenueCat ダッシュボード側で必要な設定があればここに書く
```

- ここに書くのは「コードでは自動化できない作業」だけです。
- 「やったふりの実装」を絶対にしないでください。  
  → 例: 環境変数が必要なときに、架空の値をコードに直書きしたりしない。必ず「ユーザーに設定してもらうべき」と書く。

---

## 6. 実装スタイル

- **フェーズ<PHASE_NUMBER>に含まれるタスク全てをカバーする**パッチにしてください。
  - 1つでも漏れがある場合は、MD内に TODO を残さず、その場で仕様まで戻って補完すること。
- もし仕様にグレーな部分があった場合は、「合理的なベストプラクティス」を採用し、その根拠を MD のコメントとして簡単に説明してください。
  - 例: 「HealthKit の BG Delivery は `.hourly` にした。Apple 公式ガイドと battery / review risk のバランスから。」

---

## 7. 実行手順

1. `.cursor/plans/v3/todolist.md` でフェーズ<PHASE_NUMBER>のタスクを特定
2. 関連する v3 仕様 MD 全部を読む
3. 必要に応じて Web で公式ドキュメントを確認
4. 実際のコードファイルを読み、既存パターンを把握
5. `<OUTPUT_MD_PATH>` として MD コンテンツを組み立てる:
   - 概要
   - ファイル別変更サマリ
   - 完全パッチ
   - GUI で必要な設定
6. **apply_patch にそのまま渡せる形式になっているか**を目視で確認

出力は **すべて `<OUTPUT_MD_PATH>` の内容として書き出す MD** だけにしてください。  
ここではまだ実際のファイル変更やコマンド実行は行わないでください。あなたに完全な擬似パッチを作成してもらい、それを他のエージェントにレビューしてもらって、それで初めて実装していくということができるので。

---

## 8. 最重要ルール

**patch.md は「仕様MDに反する変更」を絶対に含めない。反している疑いが1ミリでもある場合は、該当MDの該当箇所（見出し名）を引用してから修正方針を確定すること。** 