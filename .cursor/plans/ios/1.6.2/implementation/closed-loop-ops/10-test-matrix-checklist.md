# 10 — テストマトリックス + チェックリスト + 境界

> **元ファイル**: `../closed-loop-ops.md` Section 11-14, 21, 25-27
> **ナビ**: [← README](./README.md) | [エージェント評価 →](./11-agent-evaluation.md) | [E2E統合 →](./12-e2e-integration-tests.md)

---

## テストマトリックス（T1-T60）

| # | テスト対象 | テスト名 | 種別 | カバー |
|---|-----------|---------|------|--------|
| T1 | Proposal Service | `test_createProposal_accepted` | Unit | 正常系 — auto-approve対象 |
| T2 | Proposal Service | `test_createProposal_rejected_capGate` | Unit | Cap Gateリジェクト |
| T3 | Proposal Service | `test_createProposal_pending_noAutoApprove` | Unit | auto-approve対象外 → pending |
| T4 | Proposal Service | `test_createProposal_dailyLimit` | Unit | 日次100件上限 |
| T5 | Cap Gate | `test_postXGate_quotaReached` | Unit | X日次クォータ |
| T6 | Cap Gate | `test_postXGate_disabled` | Unit | x_autopost=false |
| T7 | Cap Gate | `test_sendNudgeGate_quotaReached` | Unit | Nudge日次クォータ |
| T8 | Policy Service | `test_getPolicy_cached` | Unit | キャッシュヒット |
| T9 | Policy Service | `test_setPolicy_invalidatesCache` | Unit | キャッシュ無効化 |
| T10 | Trigger Evaluator | `test_evaluateTriggers_fireOnMatch` | Unit | イベント合致→提案生成 |
| T11 | Trigger Evaluator | `test_evaluateTriggers_cooldown` | Unit | クールダウン内→スキップ |
| T12 | Trigger Evaluator | `test_evaluateTriggers_delayCondition` | Unit | delay_min 未到達→スキップ |
| T13 | Reaction Processor | `test_processReactionQueue_createProposal` | Unit | pending→提案生成 |
| T14 | Reaction Matrix | `test_evaluateReactionMatrix_probability` | Unit | 確率判定 |
| T15 | Reaction Matrix | `test_evaluateReactionMatrix_cooldown` | Unit | クールダウン内→スキップ |
| T16 | Stale Recovery | `test_recoverStaleSteps_markFailed` | Unit | 30分超→failed |
| T17 | Stale Recovery | `test_maybeFinalizeMission_allSucceeded` | Unit | 全ステップ成功→mission succeeded |
| T18 | Stale Recovery | `test_maybeFinalizeMission_anyFailed` | Unit | 1つfailed→mission failed |
| T19 | Heartbeat API | `test_heartbeat_returns200` | Integration | 正常レスポンス |
| T20 | Proposal API | `test_proposal_validInput` | Integration | Zodバリデーション |
| T21 | Proposal API | `test_proposal_invalidInput` | Integration | バリデーションエラー |
| T22 | Step Next API | `test_stepNext_noSteps` | Integration | ステップなし→null |
| T23 | Step Next API | `test_stepNext_claimStep` | Integration | ステップ取得+running更新 |
| T24 | Step Complete API | `test_stepComplete_succeeded` | Integration | 成功報告 |
| T25 | Step Complete API | `test_stepComplete_missionFinalized` | Integration | ミッション最終化 |
| T26 | Auth | `test_opsAuth_rejectNoToken` | Unit | トークンなし→401 |
| T27 | Auth | `test_opsAuth_rejectBadToken` | Unit | 不正トークン→401 |
| **T28** | **Step Data Pass** | `test_stepNext_injectsPreviousOutput` | **Unit** | **前ステップoutput注入** |
| **T29** | **Step Data Pass** | `test_stepNext_blocksPendingPrevStep` | **Unit** | **前ステップ未完了→ブロック** |
| **T30** | **Approval** | `test_approveProposal_createsMission` | **Unit** | **承認→Mission作成** |
| **T31** | **Approval** | `test_rejectProposal_updatesStatus` | **Unit** | **リジェクト→status更新** |
| **T32** | **Approval API** | `test_slackApproval_approve` | **Integration** | **Slack承認エンドポイント** |
| **T33** | **Approval API** | `test_slackApproval_reject` | **Integration** | **Slackリジェクトエンドポイント** |
| **T34** | **Executor** | `test_executeDraftContent_returnsContent` | **Unit** | **下書き生成** |
| **T35** | **Executor** | `test_executeVerifyContent_passes` | **Unit** | **検証合格** |
| **T36** | **Executor** | `test_executeVerifyContent_failsAfterRetries` | **Unit** | **検証不合格** |
| **T37** | **Executor** | `test_executorRegistry_unknownKind` | **Unit** | **未知step_kind** |
| **T38** | **emitEvent** | `test_emitEvent_triggersReactionMatrix` | **Unit** | **Reaction Matrix自動評価** |
| **T39** | **Trigger** | `test_delayMin_tooEarly` | **Unit** | **delay_min未到達** |
| **T40** | **Trigger** | `test_delayMin_tooOld` | **Unit** | **delay_min×2超過** |
| **T41** | **Monitor** | `test_checkOpsHealth_alertOnSpike` | **Unit** | **失敗スパイクアラート** |
| **T42** | **Monitor** | `test_checkOpsHealth_noAlertBelowThreshold` | **Unit** | **閾値未満→アラートなし** |
| **T43** | **Summary API** | `test_dailySummary_returns24hData` | **Integration** | **日次サマリー** |
| **T44** | **Executor: post_x** | `test_executePostX_createsXPost` | **Unit** | **XPost DB記録 + イベント発行** |
| **T45** | **Executor: post_tiktok** | `test_executePostTiktok_createsTiktokPost` | **Unit** | **TiktokPost DB記録 + イベント発行** |
| **T46** | **Executor: fetch_metrics** | `test_executeFetchMetrics_xBigIntConversion` | **Unit** | **BigInt→Number変換 + メトリクス計算** |
| **T47** | **Executor: fetch_metrics** | `test_executeFetchMetrics_tiktokMetrics` | **Unit** | **TikTokメトリクス取得** |
| **T48** | **Executor: analyze_engagement** | `test_executeAnalyzeEngagement_highThreshold` | **Unit** | **5%閾値判定 + hookスコア更新** |
| **T49** | **Executor: diagnose** | `test_executeDiagnose_extractsFailedSteps` | **Unit** | **失敗ステップ抽出 + LLM診断** |
| **T50** | **Executor: detect_suffering** | `test_executeDetectSuffering_passthrough` | **Unit** | **VWSパススルー構造** |
| **T51** | **Executor: draft_nudge** | `test_executeDraftNudge_topSeveritySelection` | **Unit** | **最高severity選択 + 50文字制限** |
| **T52** | **Executor: send_nudge** | `test_executeSendNudge_skipsWhenNoContent` | **Unit** | **nudgeContent空→skipped=true** |
| **T53** | **Executor: evaluate_hook** | `test_executeEvaluateHook_shouldPostDecision` | **Unit** | **LLM評価 + shouldPost判定** |
| **T54** | **callLLM** | `test_callLLM_returnsString` | **Unit** | **LLM呼び出し正常系** |
| **T55** | **callLLM** | `test_callLLM_throwsOnFailure` | **Unit** | **LLM呼び出しエラー系** |
| **T56** | **verifier** | `test_verifyWithRegeneration_passesOnFirstTry` | **Unit** | **初回合格** |
| **T57** | **verifier** | `test_verifyWithRegeneration_regeneratesOnFailure` | **Unit** | **再生成フロー** |
| **T58** | **verifier** | `test_verifyWithRegeneration_failsAfterMaxRetries` | **Unit** | **最大回数超過→失敗** |
| **T59** | **SAFE-T** | `test_scoreContent_crisisDetection` | **Unit** | **危機表現→score=0 + crisis flag** |
| **T60** | **SAFE-T** | `test_detectSuffering_crisisEvent` | **Unit** | **severity>=0.9→crisis:detected イベント** |

---

## テスト基盤（Vitest + Supertest + Prisma Mock）

### Vitest 設定

```javascript
// apps/api/vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/services/ops/**'],
      threshold: { lines: 80, branches: 80, functions: 80 }
    },
    setupFiles: ['./src/test/setup.js']
  }
});
```

### テストセットアップ（Prisma Mock）

```javascript
// apps/api/src/test/setup.js
import { vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';

const prismaMock = mockDeep();

vi.mock('../lib/prisma.js', () => ({
  prisma: prismaMock
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export { prismaMock };
```

### テスト実行コマンド

```bash
cd apps/api && npx vitest run                    # 全テスト
cd apps/api && npx vitest run --coverage         # カバレッジ付き
cd apps/api && npx vitest run src/services/ops/  # opsのみ
cd apps/api && npx vitest                        # ウォッチモード
```

---

## 実装チェックリスト（12.1〜12.25）

| # | タスク | AC（受け入れ条件） | 状態 |
|---|--------|-------------------|------|
| 12.1 | マイグレーション SQL 適用 | `prisma db pull` で全opsテーブルがスキーマに反映 | ⬜ |
| 12.2 | Policy シードデータ投入 | `SELECT * FROM ops_policy` で9行 | ⬜ |
| 12.3 | Trigger Rule シードデータ投入 | `SELECT * FROM ops_trigger_rules` で4行 | ⬜ |
| 12.4 | proposalService.js 実装 | T1-T4 全PASS | ⬜ |
| 12.5 | capGates.js 実装 | T5-T7 全PASS | ⬜ |
| 12.6 | policyService.js 実装 | T8-T9 全PASS | ⬜ |
| 12.7 | eventEmitter.js 実装（Reaction接続込み） | T38 PASS | ⬜ |
| 12.8 | triggerEvaluator.js 実装（delay_min修正込み） | T10-T12, T39-T40 全PASS | ⬜ |
| 12.9 | reactionProcessor.js 実装 | T13-T15 全PASS | ⬜ |
| 12.10 | staleRecovery.js 実装 | T16-T18 全PASS | ⬜ |
| 12.11 | Heartbeat ルーター実装（監視込み） | T19, T41-T42 PASS | ⬜ |
| 12.12 | Proposal/Step ルーター実装（data pass込み） | T20-T29 全PASS | ⬜ |
| 12.13 | opsAuth ミドルウェア実装 | T26-T27 PASS | ⬜ |
| **12.14** | **Step Executor Registry + 11個の executor** | **T34-T37, T44-T53 PASS** | ⬜ |
| **12.15** | **approvalNotifier + approvalHandler 実装** | **T30-T33 PASS** | ⬜ |
| **12.16** | **Approval API ルーター実装** | **T32-T33 PASS** | ⬜ |
| **12.17** | **insightPromoter.js 実装** | **手動テストで WisdomPattern に昇格確認** | ⬜ |
| **12.18** | **opsMonitor.js 実装** | **T41-T42 PASS** | ⬜ |
| **12.19** | **Summary API 実装** | **T43 PASS** | ⬜ |
| 12.20 | mission-worker SKILL.md 作成（詳細版） | `openclaw skills list` に表示 | ⬜ |
| 12.21 | 既存スキル移行（x-poster） | 提案経由で投稿成功 | ⬜ |
| 12.22 | schedule.yaml 更新 | `openclaw cron list` で新ジョブ表示 | ⬜ |
| 12.23 | Vitest + Prisma Mock セットアップ | `npx vitest run` で全テスト PASS | ⬜ |
| 12.24 | Staging デプロイ + E2Eテスト | 全フロー完走 | ⬜ |
| 12.25 | Production 段階的ロールアウト（Phase A: x-poster） | 1週間 Mission 成功率 > 90% | ⬜ |

---

## 境界（やらないこと）

| やらないこと | 理由 |
|-------------|------|
| iOS アプリ変更 | ops レイヤーはバックエンドのみ |
| 既存 `/api/mobile/*` 変更 | 後方互換維持。破壊的変更禁止 |
| memU テーブル変更 | 別の責務（長期記憶 vs 運用状態） |
| hookSelector.js 変更 | Thompson Sampling ロジックは不変 |
| verifier.js 変更 | content-verifier ロジックは不変 |
| Supabase 導入 | Railway PostgreSQL で十分（ADR-004） |
| Dashboard UI | 将来（Phase C以降で検討） |
| Moltbook 連携 | 別スコープ（Phase 4） |

---

## ファイル構成（最終版）

```
apps/api/
├── prisma/
│   └── schema.prisma                          # ← ops テーブル追加
├── sql/
│   ├── 20260208_add_ops_tables.sql
│   ├── 20260208_seed_ops_policy.sql
│   └── 20260208_seed_ops_trigger_rules.sql
├── vitest.config.js
└── src/
    ├── test/
    │   └── setup.js
    ├── middleware/
    │   └── opsAuth.js
    ├── routes/
    │   └── ops/
    │       ├── index.js
    │       ├── heartbeat.js
    │       ├── approval.js
    │       └── summary.js
    └── services/
        └── ops/
            ├── proposalService.js
            ├── capGates.js
            ├── policyService.js
            ├── eventEmitter.js
            ├── triggerEvaluator.js
            ├── reactionProcessor.js
            ├── staleRecovery.js
            ├── insightPromoter.js
            ├── approvalNotifier.js
            ├── approvalHandler.js
            ├── opsMonitor.js
            ├── __tests__/
            │   ├── proposalService.test.js
            │   ├── capGates.test.js
            │   ├── policyService.test.js
            │   ├── triggerEvaluator.test.js
            │   ├── reactionProcessor.test.js
            │   ├── staleRecovery.test.js
            │   ├── approvalHandler.test.js
            │   └── opsMonitor.test.js
            └── stepExecutors/
                ├── registry.js
                ├── executeDraftContent.js
                ├── executeVerifyContent.js
                ├── executePostX.js
                ├── executePostTiktok.js
                ├── executeFetchMetrics.js
                ├── executeAnalyzeEngagement.js
                ├── executeDiagnose.js
                ├── executeDetectSuffering.js
                ├── executeDraftNudge.js
                ├── executeSendNudge.js
                ├── executeEvaluateHook.js
                └── __tests__/
                    ├── registry.test.js
                    ├── executeDraftContent.test.js
                    ├── executeVerifyContent.test.js
                    ├── executePostX.test.js
                    ├── executePostTiktok.test.js
                    ├── executeFetchMetrics.test.js
                    ├── executeAnalyzeEngagement.test.js
                    ├── executeDiagnose.test.js
                    ├── executeDetectSuffering.test.js
                    ├── executeDraftNudge.test.js
                    ├── executeSendNudge.test.js
                    └── executeEvaluateHook.test.js
    ├── lib/
    │   ├── llm.js
    │   └── __tests__/
    │       └── llm.test.js
    ├── services/
    │   ├── verifier.js
    │   └── __tests__/
    │       └── verifier.test.js

VPS (~/.openclaw/workspace/skills/):
├── mission-worker/
│   └── SKILL.md
├── x-poster/
│   └── SKILL.md（移行版）
├── tiktok-poster/
│   └── SKILL.md（移行版）
├── trend-hunter/
│   └── SKILL.md（移行版）
├── suffering-detector/
│   └── SKILL.md（移行版）
└── app-nudge-sender/
    └── SKILL.md（移行版）
```
