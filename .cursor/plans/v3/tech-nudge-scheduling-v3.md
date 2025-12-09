# tech-nudge-scheduling-v3.md

> 前提: local date/TZで日次丸め。stateBuilderは毎回DB生データを取り直し、Big5/struggles/nudgeIntensityを必須で含める。HealthKit/ScreenTime未許可は0/falseで埋め、bandit入力も0で処理。daily_metricsが15分超陳腐(stale)ならNudgeは送らずquiet扱い。特定ドメインの成功/失敗窓幅は全MD共通: 起床30–60分以内、Screen 5分以内に閉じ+10–30分再開なし、Movement 30分以内に歩数+300〜500、座位解除、SNS/MorningPhone同様5分閉じ+10–30分再開なし。正規化と特徴量順序は`tech-state-builder-v3.md`に準拠し揺らさない。

## 1. ドメイン優先順位

同じ30分窓で複数ドメインのDPが発火した場合、以下の優先順位で1つだけ採用。

| 優先度 | ドメイン | 理由 |
|-------|---------|------|
| 1 | Sleep (wake) | 起床は1日の始まりで遅延許容が低い |
| 2 | Mental | 苦痛ベースで即応が必要（ユーザー起点を尊重） |
| 3 | Screen | 長時間スクロールは早期遮断が効果的 |
| 4 | Movement | 座位解除は多少遅れてもリカバリ可能 |
| 5 | Habit | 夜のフォローアップは他より優先度低 |

## 2. 時間窓制御

- 窓サイズ: 30分（local TZ）。
- 同一窓で複数DP → 上表の最優先1件のみ送信。
- 落選DPは次窓へ延期（最大2窓まで）。2回延期後も競合なら破棄。
- 例: 10:05にScreen/Movement同時→Screen採用、Movementは10:35まで延期、そこで再度競合判定。

- quiet: 非Mentalは送信0件。active: 日上限1.5倍、クールダウン0.5x。

- 全体上限到達後は Mental のみ許可。

- 30分窓で競合時は優先度を比較し、落選DPは最大2窓まで延期。3回目も競合なら破棄。

- metrics stale>15分 or 権限未許可時は送信しない（quiet扱い）。

## 3. クールダウン（ドメイン別・intensity補正）

| ドメイン | 基本クールダウン | quiet | normal | active |
|---------|----------------|-------|--------|--------|
| Wake | 24h | 24h | 24h | 24h |
| Sleep (bedtime) | 24h | 24h | 24h | 24h |
| Screen | 60m | 60m | 60m | 30m (0.5x) |
| Morning Phone | 45m | 45m | 45m | 25m (≈0.5x) |
| Movement | 90m | 90m | 90m | 45m (0.5x) |
| Mental (Feeling) | なし | なし | なし | なし |
| Habit | 24h | 24h | 24h | 24h |

- quietは権限未許可（HealthKit/ScreenTime）やユーザー設定時に自動適用。quiet中はMental以外送信しない。
- activeは明示設定時のみ。未設定ユーザーは常にnormal。

## 4. 1日上限（local dateで集計）

| ドメイン | normal上限 | quiet | active |
|---------|-----------|-------|--------|
| Wake | 1 | 0 | 1 |
| Screen | 5 | 0 | 7 (ceil 5×1.5) |
| Morning Phone | 2 | 0 | 3 |
| Movement | 4 | 0 | 6 (ceil 4×1.5) |
| Mental | 制限なし | 制限なし | 制限なし |
| Habit | 1 | 0 | 1 |
| **全体** | 8 | 0 | 12 (ceil 8×1.5) |

- 上限判定はlocal dateで0時リセット。staleなmetricsの場合は送信しない（カウントも増やさない）。

## 5. Quiet Mode / nudgeIntensity と権限

| 設定 | 挙動 |
|------|------|
| `quiet` | 全自動Nudge無効（Mentalのみ許可）。クールダウン無効化は行わず、送信判定で即false。権限未許可/データ未同期(stale)時に自動でここへフォールバック。 |
| `normal` | クールダウン・上限を基本値で運用。 |
| `active` | クールダウンを半減、日上限を1.5倍（上表）。バーストしないよう優先順位・30分窓制御は据え置き。 |

- Profile画面でHealthKit/ScreenTime許可がONになった瞬間からquiet解除し、次のDPから通常運用・可視化再開。
- stateBuilderは常に Big5/struggles/nudgeIntensity を含め、権限未許可は特徴量0/false埋めでbanditに渡す（キャッシュ禁止）。

## 6. 実装フロー（擬似コード）

```typescript
async function shouldSendNudge(userId: string, domain: string, now: Date): Promise<boolean> {
  const localDate = toLocalDate(now, userTz(userId));

  // 0. データ鮮度
  const freshness = await getDailyMetricsFreshness(userId);
  if (freshness > 15 * MINUTE) return false; // staleなら送らない

if (freshness > 15*MINUTE) return false;
if (intensity === 'quiet' && domain !== 'mental') return false;

  // 1. nudgeIntensity + 権限
  const intensity = await getNudgeIntensity(userId); // quiet/normal/active
  if (intensity === 'quiet' && domain !== 'mental') return false;
  if (!hasRequiredPermissions(userId, domain) && domain !== 'mental') return false;

  // 2. クールダウン
  const last = await getLastNudge(userId, domain);
  const cooldown = getCooldown(domain, intensity);
  if (last && now.getTime() - last.getTime() < cooldown) return false;

  // 3. 日次上限
  const todayCountDomain = await getNudgeCount(userId, domain, localDate);
  const todayCountAll = await getNudgeCountAll(userId, localDate);
  const limitDomain = getDailyLimit(domain, intensity);
  const limitAll = getDailyLimitAll(intensity);
  if (todayCountDomain >= limitDomain) return false;
  if (todayCountAll >= limitAll) return false;

  // 4. 時間窓競合（30分固定）
  const windowNudges = await getWindowNudges(userId, now, 30);
  if (windowNudges.length > 0) {
    const myPriority = getPriority(domain);
    const best = Math.min(...windowNudges.map(n => getPriority(n.domain)));
    if (myPriority > best) return false; // 低優先は延期 or 破棄（呼び出し側で再スケジュール）
  }

  return true;
}
```

- 送信直前に stateBuilder を呼び出し、HealthKit/ScreenTime未許可は0埋めで bandit に渡す（キャッシュ禁止）。
- DP成功/失敗判定の時間窓は共通前提に従う（起床30–60分以内、Screen/MorningPhone5分閉じ+10–30分再開なし、Movement30分以内に歩数+300〜500など）。
- 送信可否判定の粒度は30分窓だが、成功判定はドメイン別の固定窓幅を用いる（上記共通前提）。

## 7. エッジケース・運用ルール

- **複数ドメイン重複時の延期上限**: 2窓まで。3窓目で再度衝突した場合は破棄しログのみ残す。
- **静音時間帯**: ユーザー指定のサイレント時間帯は全ドメイン停止（Mentalも停止）。ただしUX仕様に従いWakeは指定外時間に調整せず破棄。
- **サーバー/クライアント時刻差**: server clock vs device clockで±3分以上差異がある場合は送信をスキップし、メトリクス同期を優先。
- **全体上限到達**: 全体上限8/12到達後はその日残りの自動Nudgeを破棄、Feeling起点のMentalのみ許可。

## 8. 参考文献メモ（頻度・クールダウン設定の根拠）

- Nahum-Shani et al. “JITAI in Mobile Health” (PMCID: PMC5364076) — 介入頻度は「負荷と効果のトレードオフ」を踏まえ1–5回/日が多く、時間窓で調整するのが推奨。
- SNapp JITAI for steps (ScienceDirect 2024, S0749379724003155) — 歩行促進で1時間以内再通知を避け、日上限5回設計。
- Shift (JMIR Human Factors 2025, e62960) — 怒り管理JITAIで「1日3–5件、クールダウン≥60分」を採用し通知疲れを回避。
- Stress JITAI protocol (JMIR Res Protoc 2025, e58985) — ストレス介入で「30分窓＋優先度制御」を用い多重発火を抑制。
- これらに基づき、本仕様では30分窓・上限8(quiet0/active12)・Screen/Movementクールダウン60–90分・Wake/Habit 24hを採用。


