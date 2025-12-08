了解しました。次のエージェントへの引き継ぎプロンプトを作成します。

---

# Anicca v0.3 ドキュメント作成タスク：引き継ぎ指示書

## 概要

Anicca v0.3 の実装に向けて、**10個の技術仕様書を順番に作成する**タスクです。
すべてのドキュメントは `/Users/cbns03/Downloads/anicca-project/.cursor/plans/v3/` に配置します。

---

## 必ず最初に読むべきファイル（6ファイル）

以下のファイルを**すべて読んでから**作業を開始してください：

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `v3-ux.md` | UX全体像（Talk/Behavior/オンボーディング） | ★★★ |
| `v3-stack.md` | 技術スタック全体（iOS/API/mem0/Nudge） | ★★★ |
| `v3-stack-revision.md` | 追加要素（EMA/Exa/BIG5/3モダリティ） | ★★★ |
| `v3-stack-nudge.md` | Nudge＋記憶レイヤーの詳細（DP/state/action/reward） | ★★★ |
| `v3-data.md` | 6ドメインのstate/action/reward定義 | ★★★ |
| `v3-ui.md` | UI仕様書（完全版）Session画面含む | ★★★ |

さらに、作成すべきドキュメントの一覧は：
| `todolist.md` | 作成すべきドキュメントの完全リスト | ★★★ |



# 付録: Nudge自律改善 (LinTS) 要約

## 概要
v3 では LinTS（Linear Thompson Sampling）を使って、Nudge の選択を自律的に改善する。
最初はランダムに近い選択だが、データが溜まるにつれて「この人にはこのNudgeが効く」を学習する。

## 採用アルゴリズム
- Linear Thompson Sampling (Agrawal & Goyal 2013)
- 報酬の線形仮定: E[r] = x^T θ
- Thompson Sampling で探索と活用を両立

## v3 で LinTS 学習 ON のドメイン

| ドメイン | 成功判定時間 | v3 学習 | 備考 |
| --- | --- | --- | --- |
| Wake | 30–60分 | ✅ ON | HealthKit起床 + DeviceActivity使用継続 |
| Bedtime | 90分 | ✅ ON | HealthKit sleep start + SNS<15分 |
| Morning Phone | 5–30分 | ✅ ON | SNS/Videoクローズ + 再開なし |
| Screen | 5–30分 | ✅ ON | 対象アプリクローズ + 再開なし |
| Movement | 30分 | ✅ ON | 歩数+300〜500 or 歩行イベント検出 |
| Mental | 即時（EMA） | ✅ ON | 「楽になった？」Yes/No |
| **Habit** | **24時間** | ❌ OFF | v3.1で対応（ルールベース＋ログ収集のみ） |

## 自律改善サイクル

```
① Cold Start（mu=0）
     ↓
② データ収集（nudge_events, nudge_outcomes）
     ↓
③ 成功/失敗判定（5分〜90分後）
     ↓
④ LinTS.update() でモデル更新
     ↓
⑤ 次のNudgeが賢くなる（自律改善）
     ↓
  ①に戻る（改善されたモデルで選択）
```

## 主要パラメータ

| パラメータ | 値 | 根拠 |
| --- | --- | --- |
| λ (regularization) | 1.0 | 標準的なL2事前。HeartSteps V2でも同様。 |
| v (variance scale) | 0.5 | 報酬が0/1のベルヌーイのため過度に広げない。 |
| ε₀ (do_nothing下限) | 0.2 | オフポリシー分析の安定性確保。 |
| ε₁ (送信下限) | 0.1 | 十分な探索を確保。 |

## モデル保存
- テーブル: `bandit_models`
- 保存内容: weights (μ), covariance (B^{-1}), meta (featureDim, actionCount, featureOrderHash)
- ドメインごとに1行

## 安全ガード
1. **featureOrderHash**: stateBuilder と bandit の特徴量順序を検証
2. **stale データ**: 15分超は Nudge 送信なし
3. **権限未許可**: nudgeIntensity=quiet に強制
4. **数値安定性**: λ≥1.0、Sherman-Morrison 分母チェック

## 詳細参照
- `tech-bandit-v3.md`: LinTS の数式・コード・action space
- `tech-state-builder-v3.md`: 特徴量の正規化・順序
- `v3-stack-nudge.md`: DP定義・成功条件・フロー

## 各ドキュメントの作成指示

### 1. `tech-db-schema-v3.md` - DBスキーマ定義

**目的**: 全テーブルの定義をPrisma schema形式で明記

**参照すべきファイル**:
- `v3-data.md` → 各ドメインのstateフィールド一覧（テーブルカラムに反映）
- `v3-stack-nudge.md` → nudge_events, nudge_outcomes の構造
- `v3-ui.md` → Profile画面のuser_traits（ideals, struggles, big5, nudge_intensity）

**外部調査が必要な項目**:
| 調査対象 | 調べること | 参考リンク |
|---------|-----------|-----------|
| Prisma | 最新のschema構文、JSON型の扱い | https://www.prisma.io/docs/concepts/components/prisma-schema |
| PostgreSQL | JSONB型のベストプラクティス | PostgreSQL公式ドキュメント |

**既存コードの確認**:
- `/Users/cbns03/Downloads/anicca-project/apps/api/prisma/schema.prisma` があれば読んで既存テーブルを把握

**書くべき内容**:
```markdown
# tech-db-schema-v3.md

## 1. ER図（概要）
（テーブル間のリレーション図）

## 2. Prisma Schema

### users
### user_traits
### daily_metrics
### nudge_events
### nudge_outcomes
### feeling_sessions
### habit_logs
### bandit_models

## 3. インデックス設計

## 4. API ↔ テーブル対応表
```

---

### 2. `file-structure-v3.md` - ファイル構造ツリー

**目的**: iOS側とAPI側の全ファイル配置を明確化

**参照すべきファイル**:
- `v3-ui.md` → 画面構成（Talk/Behavior/Profile/Session/Onboarding）
- `v3-stack.md` → API構成（modules/nudge, modules/memory等）

**既存コードの確認**:
- `/Users/cbns03/Downloads/anicca-project/aniccaios/` のディレクトリ構造
- `/Users/cbns03/Downloads/anicca-project/apps/api/src/` のディレクトリ構造

**書くべき内容**:
- 完全なディレクトリツリー
- 各ファイルの役割（1行コメント）
- 新規作成 / 修正 / 削除の区分

---

### 3. `migration-patch-v3.md` - 修正パッチ一覧

**目的**: 既存コードのどこをどう変えるかを明確化

**参照すべきファイル**:
- `file-structure-v3.md`（先に作成したもの）
- 既存のiOSコード全体

**既存コードの確認**:
- `AppState.swift` → 現在のプロパティ確認
- `VoiceSessionController.swift` → 現在の実装確認
- `apps/api/src/routes/mobile/` → 既存エンドポイント確認

**書くべき内容**:
- ファイルごとの変更種別（新規/修正/削除）
- 修正ファイルは具体的な変更箇所を明記

---

### 4. `tech-state-builder-v3.md` - State構築仕様

**目的**: 各ドメインのstateをどう構築するか明確化

**参照すべきファイル**:
- `v3-data.md` → 各ドメインのstateフィールド定義
- `tech-db-schema-v3.md`（先に作成したもの）→ データソースのテーブル

**書くべき内容**:
- 各buildXxxState関数の入力/出力/データソース
- 正規化ルール（例: sleepDebtHours = avg7d - lastNight）
- SQLクエリ or Prisma呼び出しの具体例

---

### 5. `tech-bandit-v3.md` - Bandit実装仕様

**目的**: LinTS (Linear Thompson Sampling) の実装詳細

**参照すべきファイル**:
- `v3-stack-nudge.md` → banditの概念設計
- `v3-data.md` → action候補（テンプレート）一覧
- `tech-state-builder-v3.md`（先に作成したもの）

**外部調査が必要な項目**:
| 調査対象 | 調べること | 参考リンク |
|---------|-----------|-----------|
| LinTS | Linear Thompson Samplingのアルゴリズム | 論文: "Thompson Sampling for Contextual Bandits with Linear Payoffs" |
| TypeScript実装 | 行列演算ライブラリ | ml-matrix, mathjs |

**書くべき内容**:
- アルゴリズム概要（数式含む）
- TypeScript実装の疑似コード
- 探索パラメータの設定
- モデル保存形式

---

### 6. `prompts-v3.md` - LLMプロンプト集

**目的**: 全LLM呼び出しのプロンプトテンプレート

**参照すべきファイル**:
- `v3-ux.md` → Aniccaの人格・トーン
- `v3-data.md` → 各ドメインのactionテンプレート説明
- `v3-ui.md` → Today's Insights, 10 Years From Nowの生成要件

**外部調査が必要な項目**:
| 調査対象 | 調べること |
|---------|-----------|
| OpenAI Realtime API | tool定義の形式、system promptのベストプラクティス |
| 行動変容 | CBT/ACT系のフレーミング（self-compassion, cognitive reframe等）|

**書くべき内容**:
- Talk セッション system prompt
- Feeling 導入スクリプト生成プロンプト（feelingId別）
- Nudge 文言生成プロンプト（domain × template別）
- Today's Insights 生成プロンプト
- 10年後シナリオ生成プロンプト
- BIG5 推定プロンプト
- 核フレーズ一覧

---

### 7. `quotes-v3.md` - Quote固定メッセージ30個

**目的**: Talk画面の「今日の一言」に表示する30個のメッセージ

**参照すべきファイル**:
- `v3-ui.md` → Quoteカードの仕様
- `v3-ux.md` → Aniccaの世界観・トーン

**書くべき内容**:
- 30個の英語メッセージ
- テーマ: 自己慈悲、行動変容、マインドフルネス、苦しみへの寄り添い

---

### 8. `ios-sensors-spec-v3.md` - iOSセンサー仕様

**目的**: DeviceActivity / HealthKit / CoreMotion の実装詳細

**参照すべきファイル**:
- `v3-stack.md` → センサー連携の概要
- `v3-data.md` → 各ドメインで必要なデータ

**外部調査が必要な項目**:
| 調査対象 | 調べること | 参考リンク |
|---------|-----------|-----------|
| DeviceActivity | iOS 15+ のFamilyControls連携 | Apple Developer Documentation |
| FamilyControls | entitlement申請手順、FamilyActivityPicker | WWDC 2021/2022セッション |
| HealthKit | HKSampleType一覧、バックグラウンド読み取り | Apple Developer Documentation |
| CoreMotion | CMMotionActivityManager、stationary判定 | Apple Developer Documentation |

**書くべき内容**:
- 各フレームワークの実装手順
- entitlement/Info.plist設定
- コード例（Swift）

---

### 9. `tech-nudge-scheduling-v3.md` - Nudgeスケジューリング

**目的**: 複数ドメインのNudge発火制御

**参照すべきファイル**:
- `v3-stack-nudge.md` → DP（Decision Point）定義
- `v3-data.md` → 各ドメインのDP条件

**書くべき内容**:
- ドメイン優先順位
- 時間窓制御（30分窓）
- クールダウン（ドメイン別）
- 1日上限
- Quiet Mode挙動

---

### 10. `tech-ema-v3.md` - EMA仕様

**目的**: Feelingセッション終了時の「楽になった？」質問

**参照すべきファイル**:
- `v3-ui.md` → Session画面の仕様
- `v3-data.md` → Mental/Feelingドメインのreward定義

**書くべき内容**:
- 質問文（英語/日本語）
- 回答形式（Yes/No）
- 表示タイミング
- 未回答時の処理
- データ保存先

---

## 重要な注意事項

1. **UIは変更しない**: UI仕様（v3-ui.md、HTMLファイル）は確定済み。仕様書側をUIに合わせる。

2. **v3/v4の区別をしない**: 「これはv4で」という発言は禁止。すべて完全に実装する前提で書く。

3. **最新ドキュメントを調べる**: 特にiOSセンサー系は頻繁にAPIが変わるため、Apple Developer Documentationの最新版を確認する。

4. **1つずつ確認を取る**: 各ドキュメント完成後、ユーザーに確認を取ってから次へ進む。

---