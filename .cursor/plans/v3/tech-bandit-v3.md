# tech-bandit-v3.md

LinTS（Linear Thompson Sampling）で v3 の JITAI Nudge を自律改善するための実装仕様。コード実装前に必ず本書・`v3-stack-nudge.md`・`v3-data.md`・`tech-state-builder-v3.md`・`tech-db-schema-v3.md`を併読すること。

---

## 0. 共通前提・適用範囲
- ローカル日付/TZ基準で DP 判定・集計（UTC 跨ぎで誤判定しない）。
- `daily_metrics` は最大遅延 15 分を許容。stale 超過時は Nudge を送らず quiet 扱い。
- stateBuilder は毎回 DB 取得（キャッシュ禁止）。HealthKit/ScreenTime 未許可は該当特徴量を 0/false で埋め、`nudgeIntensity=quiet` として扱う。
- stateBuilder は Big5 / struggles / nudgeIntensity を必ず含める（欠損時もダミー値を埋める）。
- 正規化と次元順序は本書で固定し、bandit 側も同一順序を厳守する。
- 成功/失敗の時間窓（起床 30–60 分以内、SNS 5 分内クローズ＋10–30 分再開なし、座位後 30 分内 +300〜500 歩 など）は全ドメインで統一。

---

## 1. 採用アルゴリズム: LinTS (Linear Thompson Sampling)
### 1.1 概要
- 文献: Agrawal & Goyal, 2013 “Thompson Sampling for Contextual Bandits with Linear Payoffs”.
- 線形報酬仮定: \( \mathbb{E}[r \mid x] = x^\top \theta \)。
- サンプルしたパラメータでスコアを計算し、最良の action を選択。探索と活用を自然に両立。

### 1.2 事後分布と更新式
- 事前: \( \theta \sim \mathcal{N}(0, \lambda^{-1} I) \)
- 行列 \( B = \lambda I + \sum_t x_t x_t^\top \)
- ベクトル \( f = \sum_t r_t x_t \)
- 平均 \( \mu = B^{-1} f \)
- 事後サンプル: \( \tilde{\theta} \sim \mathcal{N}(\mu, v^2 B^{-1}) \)
- オンライン更新（1 ステップ）:
  - \( B \leftarrow B + x x^\top \)
  - \( f \leftarrow f + r x \)
  - \( \mu \leftarrow B^{-1} f \)（`B` の逆行列は逐次更新 or `B^{-1}` をシェルマン・モリソンで更新してもよい）

### 1.3 選択手順（擬似コード）
```typescript
// x: 正規化済み特徴ベクトル（bias を含む）
// actions: actionId 配列（0=do_nothing を含む）
const thetaSample = sampleMVN(mu, v2 * Binv);   // v2 = v^2
const scores = actions.map(a => dot(thetaSample, x));
const chosen = argmax(scores);
return chosen;
```

---

## 2. 実装言語・配置
- 言語: TypeScript（Node, `ml-matrix` などで線形代数を実装）。
- 配置:
  - `apps/api/src/modules/nudge/policy/linTS.ts`（共通 LinTS クラス）
  - ドメイン別ポリシー: `wakeBandit.ts`, `screenBandit.ts`, `movementBandit.ts`, `mentalBandit.ts`
  - ※ `habitBandit.ts` は **v3.1 で追加予定**（24時間遅延報酬への対応が必要なため、v3ではルールベース＋ログ収集のみ）
- モデル永続化: `bandit_models`（`tech-db-schema-v3.md`）を利用。

---

## 3. state → x エンコード（正規化と次元順序）
`tech-state-builder-v3.md` のフィールドを正規化し、以下の順で 1 本のベクトル `x` を作る。bias 項 1 を先頭に追加する。未許可データは 0 埋め・quiet フラグで処理。

### 3.1 共通パート（全ドメイン共通）
1. `bias` = 1
2. `localHour_sin`, `localHour_cos`（`sin/cos(2π*hour/24)`）
3. `dayOfWeek_onehot` (7)
4. `sleepDebtHours`（clip [-5,5]）
5. `snsMinutesToday_norm` (`min(v,600)/600`)
6. `stepsToday_norm` (`min(v,15000)/15000`)
7. `sedentaryMinutesToday_norm` (`min(v,180)/180`)
8. `big5` (O,C,E,A,N) 0–1
9. `struggles_multi_hot`（固定順序 10 個: `late_sleep`,`sns_addiction`,`self_loathing`,`anxiety`,`anger`,`jealousy`,`sedentary`,`procrastination`,`perfectionism`,`burnout`。存在しなければ0）
10. `nudgeIntensity_onehot` (`quiet`,`normal`,`active`)
11. `recentFeelingCount_self_loathing_norm` (`min(v,10)/10`)
12. `recentFeelingCount_anxiety_norm` (`min(v,10)/10`)

### 3.2 ドメイン固有追加
- **Rhythm/Wake/Bedtime**
  - `avgWake7d_norm` (= hour/24), `avgBedtime7d_norm` (= hour/24)
  - `wakeSuccessRate7d`, `bedtimeSuccessRate7d`
  - `snsMinutesLast60_norm` (`min(v,90)/90`)
  - `snsLongUseAtNight` (0/1)
- **MorningPhone**
  - `timeSinceWake_norm` (`min(v,180)/180`)
  - `snsMinutesSinceWake_norm` (`min(v,90)/90`)
- **Screen**
  - `snsCurrentSessionMinutes_norm` (`min(v,90)/90`)
- **Movement**
  - `sedentaryMinutesCurrent_norm` (`min(v,180)/180`)
  - `recentActivityEvents_flag` (有無 0/1)
- **Habit**
  - `habitId_onehot`（採用する優先習慣セット順）
  - `habitMissedStreak_norm` (`min(v,7)/7`)
  - `habitSuccessStreak_norm` (`min(v,7)/7`)
- **Mental/Feeling**
  - `feelingId_onehot`（self_loathing, anxiety, anger, jealousy, other）
  - `recentFeelingCount_norm` (`min(v,10)/10`)
  - `recentFeelingCount7d_norm` (`min(v,20)/20`)
  - `ruminationProxy_norm` (0–1)

### 3.3 ベクトル長の例
- Wake: `1 (bias) + 2 + 7 + 1*5 + 3*? ...` → 実数は上記順序で集計してコメントすること。featureDim は `BanditModel.meta.featureDim` に保存。

---

## 4. action space 定義（actionId → template_id マッピング）
`v3-data.md` のテンプレートをそのまま採用。各 domain の `actionId` は固定し、do_nothing=0 を必ず含める。

### 4.1 Rhythm / Wake
| actionId | template_id (例) | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `gentle_wake` | 優しい起床 |
| 2 | `direct_wake` | 率直起床 |
| 3 | `future_ref_wake` | 未来参照 |

### 4.2 Rhythm / Bedtime
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `gentle_bedtime` | 優しい就寝 |
| 2 | `firm_bedtime` | 強めリマインド |
| 3 | `psychoedu_bedtime` | 睡眠科学混ぜ |

### 4.3 Morning Phone
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `gentle_morning_break` | 起床直後の小休止 |
| 2 | `focus_morning` | 30 分をクリアに使う |

### 4.4 Screen 長時間
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `gentle_sns_break` | やんわり中断 |
| 2 | `direct_sns_stop` | 率直停止 |
| 3 | `mindful_reflection` | 気づき誘導 |

### 4.5 Movement / Sedentary
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `short_break` | 立ち上がり/伸び |
| 2 | `walk_invite` | 5 分歩行誘導 |

### 4.6 Priority Habit Follow-up
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない |
| 1 | `gentle_habit_reminder` | やんわり振り返り |
| 2 | `plan_tomorrow` | 翌日の計画づくり |

### 4.7 Mental / Feeling
| actionId | template_id | 説明 |
| --- | --- | --- |
| 0 | `do_nothing` | 送らない（基準用） |
| 1 | `soft_self_compassion` | 自己批判の停止 |
| 2 | `cognitive_reframe` | 認知の整理 |
| 3 | `behavioral_activation_micro` | 小さな行動 |
| 4 | `metta_like` | 慈悲系 |

---

## 5. 学習タイミングと報酬
- オンライン即時更新のみ（バッチなし）。`nudge_outcomes` に reward が確定したタイミングで `update(x, actionId, reward)` を呼ぶ。
- 成功/失敗の窓幅はドメイン共通ルールを使用（起床 30–60 分、SNS 5 分クローズ＋10–30 分再開なし、座位 30 分内 +300〜500 歩、Mental は EMA yes/no 等）。詳細は `v3-data.md`/`v3-stack-nudge.md` のドメインごとの定義に従う。
- stale metrics（15 分超）や権限未許可時は Nudge を送らず `reward` も学習しない（sent=false ログのみ）。

### 5.1 v3 で LinTS 学習 ON のドメイン

| ドメイン | 成功判定時間 | v3 学習 | 備考 |
| --- | --- | --- | --- |
| Wake | 30–60分 | ✅ ON | HealthKit起床 + DeviceActivity使用継続 |
| Bedtime | 90分 | ✅ ON | HealthKit sleep start + SNS<15分 |
| Morning Phone | 5–30分 | ✅ ON | SNS/Videoクローズ + 再開なし |
| Screen | 5–30分 | ✅ ON | 対象アプリクローズ + 再開なし |
| Movement | 30分 | ✅ ON | 歩数+300〜500 or 歩行イベント検出 |
| Mental | 即時（EMA） | ✅ ON | 「楽になった？」Yes/No |
| **Habit** | **24時間** | ❌ OFF | v3.1で対応（遅延報酬問題） |

### 5.2 確率クリッピング（オフポリシー対応）
HeartSteps（PMC8439432）に倣い、選択確率をクリップする:
- `π = clip(P(send), ε₁, 1 - ε₀)` where `ε₀=0.2, ε₁=0.1`
- do_nothing確率が最低20%、送信確率が最低10%を保証
- これによりオフポリシー分析（重要度重み付け）が安定する

### 5.3 Action Centering（v3.1検討）
HeartStepsでは `(A_t - π_t)` を使って学習することで、ベースライン報酬モデルの誤特定に対してロバストになる。v3ではシンプルなLinTSを採用するが、治療効果の非定常性が確認された場合はv3.1でaction centeringを導入する。

---

## 6. モデル保存形式（`bandit_models`）
```typescript
interface BanditModelData {
  domain: string;           // rhythm_wake, rhythm_bedtime, morning_phone, screen, movement, habit, mental
  version: number;          // schema version
  weights: number[];        // mu ベクトル（length = featureDim）
  covariance: number[][];   // B^{-1} 行列（featureDim x featureDim）
  meta: {
    featureDim: number;
    actionCount: number;
    lambda: number;
    v: number;
    featureOrderHash: string; // 順序固定確認用
  };
}
```
- 永続化は JSONB にそのまま保存。読込時に型チェックし、`featureOrderHash` が一致しない場合はロードを拒否する。
- ドメインごとに 1 行。アップグレード時は version をインクリメント。

---

## 7. 探索パラメータと根拠
| パラメータ | 値 | 根拠 |
| --- | --- | --- |
| λ (regularization) | 1.0 | 標準的な L2 事前。特徴量は 0–1 クリップ済みで安定。 |
| v (variance scale) | 0.5 | 報酬が 0/1 のベルヌーイであるため過度に広げない。cold start でも適度に探索。 |
- 必要に応じてドメイン別に `v` を調整（Mental のみ 0.7 など）してもよいが、初期は統一。

---

## 8. 初期化方針（cold start）
- `mu = 0`、`B = λ I`（`B^{-1} = (1/λ) I`）。
- `actionId=0` (do_nothing) もスコアリング対象。最初の数回はサンプルゆらぎで探索が自然に走る。
- 権限未許可・データ0埋めの場合でも学習を行うが、`nudgeIntensity=quiet` かつ `state` は 0 埋めで reward も低い想定。権限が有効になった時点から実データで学習再開。

---

## 9. API/実装レイヤーでの利用フロー（サーバ側）
1. DP で `state = build<Domain>State(userId, now, tz)` を取得（キャッシュなし）。
2. `x = encode(state)`（本章の正規化・順序を厳守）。
3. `actionId = linTS.selectAction(x)` を取得。`actionId=0` なら送らずログのみ。
4. 送信後 `nudge_events` に state/action を保存。stale/quiet は `sent=false`。
5. 成功/失敗が確定したら `reward` を計算し `linTS.update(x, actionId, reward)`。結果を `nudge_outcomes` に保存。
6. モデルを `bandit_models` に保存（トランザクション内で `weights`/`covariance` 更新）。

---

## 10. TypeScript 実装メモ（疑似コード）
```typescript
import { Matrix } from 'ml-matrix';

class LinTS {
  private mu: Matrix;      // (d x 1)
  private Binv: Matrix;    // (d x d)
  constructor(private d: number, private lambda = 1.0, private v = 0.5) {
    this.mu = Matrix.zeros(d, 1);
    this.Binv = Matrix.eye(d).div(lambda);
  }
  select(x: number[]): number {
    const xCol = Matrix.columnVector(x);
    const theta = sampleMVN(this.mu, this.Binv.mul(this.v ** 2));
    const score = theta.transpose().mmul(xCol).get(0, 0);
    // 複数 action の場合は actionId ごとに score を計算（do_nothing を含む）
    return score > 0 ? 1 : 0; // 例; 実際は actionId 配列で argmax
  }
  update(x: number[], reward: number) {
    const xCol = Matrix.columnVector(x);
    // Sherman–Morrison: Binv = Binv - (Binv*x*x^T*Binv)/(1 + x^T*Binv*x)
    const Binv_x = this.Binv.mmul(xCol);
    const denom = 1 + xCol.transpose().mmul(Binv_x).get(0, 0);
    this.Binv = this.Binv.sub(Binv_x.mmul(Binv_x.transpose()).div(denom));
    // f = f + r x  -> mu = Binv * f
    this.mu = this.mu.add(xCol.mul(reward));
    this.mu = this.Binv.mmul(this.mu);
  }
}
```
※実装時は action 配列を引数に取り、スコアを `dot(theta, x_action)` で計算する。`sampleMVN` はコレスキー分解で実装。

---

## 11. 品質・安全ガード
- feature 順序ずれを防ぐため `featureOrderHash` をモデルに保存し、ロード時に検証。
- 権限未許可時は強制 quiet。許可された瞬間から通常スケールで学習・スコアリング。
- stale データ時は Nudge を送らない（reward 学習なし）。
- 逆行列の数値安定性: λ を 1.0 以上に保ち、`Binv` 更新に失敗した場合は再初期化しログに計上。

---

## 12. テスト観点（実装時のチェックリスト）
- feature エンコード: stateBuilder → encode の順序・正規化一致をスナップショットテスト。
- cold start: 同一 state でサンプル分布が適度に広いこと（score 分散をロギング）。
- reward パイプ: DP→送信→outcome で reward が正しく保存・学習されるか（擬似ログで E2E）。
- ドメイン分離: `domain` 別にモデルファイル/DB を分け、混在しないことを確認。
- do_nothing の扱い: スコアが最上位の場合は送信せずログのみになること。

---

## 13. 今後の拡張メモ
- v3.1: **Habit ドメインの LinTS 導入**（24時間遅延報酬への対応。surrogate reward や discount factor の検討）
- v3.1: Mental の EMA スコアを 5 段階に拡張し、報酬をスケール化（0–1）した LinTS へ。
- v3.2: 行動ログを用いた hierarchical pooling（RoME / IntelligentPooling 系）を検討。
- v3.2: action-dependent features（テンプレ固有バイアス）を導入した拡張線形モデルも選択肢。

以上の仕様に従えば、LinTS の実装・運用時に迷う論点（特徴量順序、正規化、action マッピング、学習タイミング、保存形式）が解消される。

