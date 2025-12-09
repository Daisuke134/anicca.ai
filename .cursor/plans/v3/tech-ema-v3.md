# tech-ema-v3.md

Feeling セッション終了時に表示する **「さっきより楽になった？」EMA（Ecological Momentary Assessment）** の UI・データストレージ・未回答処理・bandit 連携に関する仕様書。

---

## 0. 共通前提（全 MD に適用）

- データ鮮度: 日次メトリクスはバッチ＋オンデマンド、遅延最大 15 分。
- stateBuilder は Big5 / struggles / nudgeIntensity を必ず含める。
- 未許可ユーザーは quiet fallback。
- 正規化・特徴量順序は `tech-state-builder-v3.md` で固定。
- 成功/失敗の時間窓はドメインごとに定義（Mental は EMA 即時）。
- stateBuilder は毎回 DB 取得（キャッシュ禁止）。
- Screen Time データは最小限（イベント種別・しきい値時刻・日次合計のみ）。
- 権限 OFF 時はドメインデータの取得・送信・Nudge 利用を停止。

---

## 1. 背景と目的

### 1.1 EMA とは

**Ecological Momentary Assessment (EMA)** は、日常生活の中でリアルタイムに主観的体験を測定する手法である。従来の回顧的自己報告よりも正確で、文脈依存の変動を捉えられるため、mHealth / JITAI 研究で広く採用されている。

> "Ecological momentary assessment (EMA) involves repeatedly sampling participants' current behaviors and experiences in real time, in their natural environments."  
> — Stone & Shiffman (1994), *Annals of Behavioral Medicine*

### 1.2 Mental / Feeling ドメインにおける EMA

Anicca v0.3 の Mental/Feeling ドメインでは、ユーザーが Talk タブの Feeling カード（Self-Loathing / Anxiety / Irritation / Something else）を押して音声セッションを開始する。このセッションは JITAI における **Decision Point (DP)** であり、サーバー側で状態（`MentalState`）を構築し、LinTS bandit が **action（介入テンプレート）** を選択する。

セッション終了時に EMA を 1 問だけ提示し、その回答を **reward** として bandit を更新することで、ユーザーごとに最適な介入を自律的に学習する。

### 1.3 EMA 設計の根拠

| 設計選択 | 根拠 |
|----------|------|
| 1 問のみ | 応答負荷を最小化し、回答率を最大化（先行研究では 2〜3 問が限界とされる） |
| Yes/No 2 択 | 認知負荷を下げ、瞬時の直感的回答を促す |
| 「楽になった」という主観的改善 | 反芻介入 JITAI (Wang & Miller, 2023; JMIR Formative Research) で EMA を成果指標とした RCT で有効性が確認されている |
| セッション終了直後 | 体験の記憶が最も鮮明なタイミングで測定 |

> 反芻中心 CBT の JITAI パイロット RCT では、EMA で反芻エピソード数と持続時間を測定し、介入群で有意な減少を確認している (Wang & Miller, 2023)。Anicca ではこれを応用し、介入の「即時的な主観的改善」を EMA で捕捉する。

---

## 2. 質問文言

### 2.1 英語（デフォルト）

> **Did you feel a bit better?**

### 2.2 日本語

> **さっきより楽になった？**

- `LANGUAGE_LINE`（Profile の Language 設定）に応じて言語を切り替える。
- トーンは **カジュアルかつ中立的**。改善していなくても責めるニュアンスを与えない。

---

## 3. 回答形式

### 3.1 ボタン構成

| 種類 | ラベル (英語) | ラベル (日本語) | 色/スタイル |
|------|---------------|-----------------|-------------|
| Yes ボタン | Yes | はい | プライマリボタン（黒背景 `#222222` / 白テキスト） |
| No ボタン | No | いいえ | セカンダリボタン（薄いベージュ `#E9E6E0` / グレーテキスト） |
| Skip リンク | Skip | スキップ | テキストリンク（caption サイズ、補助グレー `#898783`） |

### 3.2 タップ領域

- Yes/No ボタンは **横幅 40% ずつ**、中央寄せで配置。
- Skip リンクは Yes/No ボタンの **下 24pt** に中央配置。
- いずれかのタップでモーダルを閉じ、結果を API に送信する。

---

## 4. 表示タイミング

### 4.1 トリガー条件

1. ユーザーが Session 画面で **「End」ボタン**をタップした時点。
2. **セッション継続時間が 5 秒以上**の場合のみ表示。
   - 5 秒未満（誤タップ等）は EMA をスキップし、`emaBetter = null` として保存。
3. **Back ナビゲーション**でも End 同様の処理を行う。

- セッション継続 <5秒ならモーダル非表示とし、emaBetter=null を送信する。

### 4.2 非表示条件

- セッション継続時間 < 5 秒
- Realtime 接続が確立されなかった場合（エラー終了）
- ユーザーがアプリを強制終了した場合（`emaBetter = null` として保存）

---

## 5. UI 設計

### 5.1 モーダル形式

- **SwiftUI の `.sheet(isPresented:)` を使用**。
- 背景: セミ透明ブラー（`material: .ultraThinMaterial`）。
- サイズ: **medium detent**（画面下半分程度）。
- 閉じるジェスチャ: **下スワイプで dismiss 可**（dismiss = Skip 扱い）。

### 5.2 レイアウト

```text
┌─────────────────────────────────────┐
│                                       │
│    Did you feel a bit better?         │  ← 質問テキスト（20pt Semibold、中央）
│                                       │
│       [ Yes ]       [ No ]            │  ← 横並び 2 ボタン
│                                       │
│              Skip                     │  ← テキストリンク
│                                       │
└─────────────────────────────────────┘
```

### 5.3 アニメーション

- モーダル表示: `.spring(response: 0.35, dampingFraction: 0.85)` で滑らかに登場。
- ボタンタップ: 軽い haptic フィードバック（`.impactOccurred(style: .light)`）。

### 5.4 ファイル配置

`aniccaios/aniccaios/Views/Session/EMAModal.swift`

---

## 6. データストレージ

API例:

- POST /api/mobile/feeling/start -> { "sessionId": "...", "actionTemplate": "...", "context_snapshot": { ... } }

- POST /api/mobile/feeling/end   -> { "sessionId": "...", "emaBetter": true|false|null, "summary": "..." }

### 6.1 テーブル: `feeling_sessions`

```prisma
model FeelingSession {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @db.Uuid
  feelingId      String   // self_loathing / anxiety / irritation / free_conversation
  topic          String?
  actionTemplate String?  // bandit が選択したテンプレートID
  startedAt      DateTime @default(now()) @db.Timestamptz
  endedAt        DateTime?
  emaBetter      Boolean?  // ← EMA 回答を保存
  summary        String?  @db.Text
  transcript     Json?    @db.JsonB
  context        Json     @db.JsonB @default("{}") // state snapshot (MentalState)

  @@index([userId, startedAt])
  @@index([feelingId, startedAt])
}
```

### 6.2 `emaBetter` カラムの値

| 回答 | `emaBetter` 値 |
|------|----------------|
| Yes | `true` |
| No | `false` |
| Skip | `null` |
| モーダル dismiss（下スワイプ） | `null` |
| アプリ強制終了 | `null` |
| セッション < 5 秒 | `null`（EMA 表示なし） |

---

## 7. API エンドポイント

### 7.1 `POST /api/mobile/feeling/end`

セッション終了時に iOS アプリから呼び出す。

**リクエストボディ:**

```json
{
  "session_id": "uuid",
  "emaBetter": true | false | null,
  "summary": "セッションの要約（LLM 生成、オプショナル）"
}
```

**処理フロー:**

1. `feeling_sessions` テーブルを更新（`endedAt`, `emaBetter`, `summary`）。
2. `emaBetter` が `null` でない場合のみ bandit 更新。
3. 最新の `entitlement` 状態を返却。

**レスポンス:**

```json
{
  "success": true,
  "entitlement": {
    "plan": "pro",
    "monthly_usage_remaining": 250
  }
}
```

---

## 8. 未回答時の処理

### 8.1 回答パターンと bandit 更新

- 強制終了/スワイプdismiss/Skip/5秒未満はすべて emaBetter=null とし、bandit学習は行わない。

| ユーザー行動 | `emaBetter` | `reward` | bandit 更新 |
|--------------|-------------|----------|-------------|
| Yes タップ | `true` | `1` | ✅ 実行 |
| No タップ | `false` | `0` | ✅ 実行 |
| Skip タップ | `null` | — | ❌ スキップ |
| モーダル dismiss | `null` | — | ❌ スキップ |
| アプリ強制終了 | `null` | — | ❌ スキップ |
| セッション < 5 秒 | `null` | — | ❌ スキップ |

### 8.2 Skip 増加時の対策

- `emaBetter = null` 率を日次モニタリング。
- **目標: Skip 率 < 20%**。
- 20% 超過が続く場合の対策候補:
  1. 質問文言の見直し（より親しみやすく）
  2. ボタン配置の調整（Yes をより目立たせる）
  3. Skip リンクの位置をさらに目立たなくする
  4. 「答えてくれると Anicca がもっと上手に寄り添えるようになるよ」の一言を追加

---

## 9. Bandit 更新ロジック

### 9.1 TypeScript 擬似コード

```typescript
async function handleFeelingEnd(
  sessionId: string,
  emaBetter: boolean | null,
  summary?: string
): Promise<void> {
  // 1. セッション取得
  const session = await prisma.feelingSession.findUnique({
    where: { id: sessionId }
  });

  if (!session) {
    throw new Error('Session not found');
  }

  // 2. セッション更新
  await prisma.feelingSession.update({
    where: { id: sessionId },
    data: {
      endedAt: new Date(),
      emaBetter,
      summary: summary ?? null
    }
  });

  // 3. emaBetter が null の場合は bandit 更新をスキップ
  if (emaBetter === null) {
    logger.info(`Session ${sessionId}: EMA skipped, bandit update skipped`);
    return;
  }

  // 4. reward 計算
  const reward = emaBetter ? 1 : 0;

  // 5. state と action を取得（context に保存されている）
  const state = session.context as MentalState;
  const actionTemplate = session.actionTemplate;

  if (!state || !actionTemplate) {
    logger.warn(`Session ${sessionId}: Missing state or action, skipping bandit update`);
    return;
  }

  // 6. bandit 更新
  const mentalBandit = await MentalBandit.load();
  const featureVector = encodeState(state); // 正規化済みベクトル
  const actionId = templateToActionId(actionTemplate);

  mentalBandit.update(featureVector, actionId, reward);

  await mentalBandit.save();

  // 注意: FeelingSession は NudgeEvent とは独立して管理する
  // nudge_outcomes への記録は行わない（feeling_sessions.emaBetter で十分）

  logger.info(`Session ${sessionId}: Bandit updated with reward=${reward}`);
}
```

### 9.2 MentalBandit の構造

`tech-bandit-v3.md` で定義された LinTS を使用。

- mentalBandit パラメータ: v=0.7, λ=1.0。actionId表（do_nothingを含む）を明記する。

| パラメータ | 値 | 備考 |
|------------|-----|------|
| λ (regularization) | 1.0 | 標準的な L2 事前 |
| v (variance scale) | 0.7 | Mental ドメインはやや広めに探索 |
| action space | 5 | do_nothing, soft_self_compassion, cognitive_reframe, behavioral_activation_micro, metta_like |

---

## 10. mem0 への保存

EMA 回答は mem0 にも保存し、将来のパーソナライゼーションに活用する。

### 10.1 保存形式

```json
{
  "category": "interaction",
  "content": "Feeling session: self_loathing. Template: soft_self_compassion. EMA: felt better.",
  "metadata": {
    "sessionId": "uuid",
    "feelingId": "self_loathing",
    "actionTemplate": "soft_self_compassion",
    "emaBetter": true,
    "timestamp": "2025-01-15T10:30:00Z"
  }
}
```

### 10.2 保存タイミング

- `/feeling/end` API 内で、bandit 更新後に非同期で mem0 に追加。
- 失敗時はリトライキューに入れ、後でバッチ処理。

---

## 11. 分析・モニタリング項目

### 11.1 日次集計

| 指標 | 計算方法 | 目標値 |
|------|----------|--------|
| EMA 回答率 | `(Yes + No) / 全セッション * 100` | > 80% |
| Yes 率 | `Yes / (Yes + No) * 100` | モニタリングのみ（目標なし） |
| Skip 率 | `Skip / 全セッション * 100` | < 20% |
| 平均セッション時間 | `AVG(endedAt - startedAt)` | モニタリングのみ |

### 11.2 bandit 学習の評価

- **cumulative reward** の推移をグラフ化。
- **action 選択分布** の変化を週次で確認。
- **特定 action の偏り** が発生していないか監視（do_nothing が過剰選択されていないか等）。

---

## 12. iOS 実装メモ

### 12.1 SwiftUI 実装例

```swift
import SwiftUI

struct EMAModal: View {
    @Binding var isPresented: Bool
    let onResponse: (Bool?) -> Void
    
    @AppStorage("language") private var language = "en"
    
    private var questionText: String {
        language == "ja" ? "さっきより楽になった？" : "Did you feel a bit better?"
    }
    
    private var yesText: String { language == "ja" ? "はい" : "Yes" }
    private var noText: String { language == "ja" ? "いいえ" : "No" }
    private var skipText: String { language == "ja" ? "スキップ" : "Skip" }
    
    var body: some View {
        VStack(spacing: 24) {
            Text(questionText)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Color("primaryText"))
                .multilineTextAlignment(.center)
                .padding(.top, 32)
            
            HStack(spacing: 16) {
                Button(action: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onResponse(true)
                    isPresented = false
                }) {
                    Text(yesText)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color("buttonTextPrimary"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color("buttonPrimary"))
                        .cornerRadius(26)
                }
                
                Button(action: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    onResponse(false)
                    isPresented = false
                }) {
                    Text(noText)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Color("secondaryText"))
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color("buttonSecondary"))
                        .cornerRadius(26)
                }
            }
            .padding(.horizontal, 24)
            
            Button(action: {
                onResponse(nil)
                isPresented = false
            }) {
                Text(skipText)
                    .font(.system(size: 13))
                    .foregroundColor(Color("captionText"))
            }
            
            Spacer()
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}
```

### 12.2 SessionView での呼び出し

```swift
struct SessionView: View {
    @StateObject private var viewModel = SessionViewModel()
    @State private var showEMAModal = false
    
    var body: some View {
        ZStack {
            // ... セッション UI ...
            
            Button("End") {
                endSession()
            }
        }
        .sheet(isPresented: $showEMAModal, onDismiss: handleEMADismiss) {
            EMAModal(isPresented: $showEMAModal) { response in
                viewModel.emaBetter = response
            }
        }
    }
    
    private func endSession() {
        let duration = viewModel.sessionDuration
        
        // 5秒未満はEMA表示しない
        if duration >= 5 {
            showEMAModal = true
        } else {
            viewModel.emaBetter = nil
            submitSessionEnd()
        }
    }
    
    private func handleEMADismiss() {
        // モーダルがdismissされた時点でemaBetterがnilならSkip扱い
        if viewModel.emaBetter == nil {
            viewModel.emaBetter = nil
        }
        submitSessionEnd()
    }
    
    private func submitSessionEnd() {
        Task {
            await viewModel.submitFeelingEnd()
            // Talk タブに戻る
        }
    }
}
```

---

## 13. 参考文献

1. **Stone, A. A., & Shiffman, S. (1994).** Ecological momentary assessment (EMA) in behavioral medicine. *Annals of Behavioral Medicine*, 16(3), 199-202.

2. **Wang, L., & Miller, L. C. (2023).** Assessment and Disruption of Ruminative Episodes to Enhance Mobile Cognitive Behavioral Therapy Just-in-Time Adaptive Interventions in Clinical Depression: Pilot Randomized Controlled Trial. *JMIR Formative Research*, 7, e37270. https://doi.org/10.2196/37270

3. **Nahum-Shani, I., et al. (2018).** Just-in-Time Adaptive Interventions (JITAIs) in Mobile Health: Key Components and Design Principles for Ongoing Health Behavior Support. *Annals of Behavioral Medicine*, 52(6), 446-462.

4. **Agrawal, S., & Goyal, N. (2013).** Thompson Sampling for Contextual Bandits with Linear Payoffs. *Proceedings of the 30th International Conference on Machine Learning (ICML)*.

5. **Heron, K. E., & Smyth, J. M. (2010).** Ecological momentary interventions: Incorporating mobile technology into psychosocial and health behaviour treatments. *British Journal of Health Psychology*, 15(1), 1-39.

---

## 14. 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2025-01-15 | 初版作成 |

---

以上の仕様に従えば、EMA の UI 表示からデータ保存、bandit 更新、分析指標まで一貫した実装が可能になる。特に **Skip / null 処理** を明確に定義することで、不完全なデータが bandit の学習を汚染するリスクを防いでいる。

