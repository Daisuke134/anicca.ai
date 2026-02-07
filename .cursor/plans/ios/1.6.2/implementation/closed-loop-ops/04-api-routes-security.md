# 04 — API Routes + Kill Switch + Auth

> **元ファイル**: `../closed-loop-ops.md` Section 7, 9, 10
> **ナビ**: [← API Services](./03-api-services.md) | [README](./README.md) | [次: Step Executors →](./05-step-executors.md)

---

## 7. API ルーター統合

> **⚠️ H6修正: step/next と step/complete の正規版（FOR UPDATE SKIP LOCKED + data passing + event自動発行）は `05-step-executors.md` §16.2-16.3 を参照。実装時は 05 版を使うこと。この版は構造参考のみ。**

```javascript
// apps/api/src/routes/ops/index.js
// ★ step/next, step/complete の正規版は 05-step-executors.md §16.2-16.3

import { Router } from 'express';
import heartbeatRouter from './heartbeat.js';
import { z } from 'zod';
import { createProposalAndMaybeAutoApprove } from '../../services/ops/proposalService.js';
import { prisma } from '../../lib/prisma.js';
import { maybeFinalizeMission } from '../../services/ops/staleRecovery.js';

const router = Router();

// Heartbeat
router.use(heartbeatRouter);

// --- Proposal API ---

const ProposalInputSchema = z.object({
  skillName: z.string().max(50),
  source: z.enum(['cron', 'trigger', 'reaction', 'manual']),
  title: z.string().max(500),
  payload: z.record(z.unknown()).default({}),
  steps: z.array(z.object({
    kind: z.string().max(50),
    order: z.number().int().min(0),
    input: z.record(z.unknown()).optional()
  })).min(1)
});

/**
 * POST /api/ops/proposal
 * 新しい提案を作成
 */
router.post('/proposal', async (req, res) => {
  const parsed = ProposalInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const result = await createProposalAndMaybeAutoApprove(parsed.data);
  res.json(result);
});

// --- Step Execution API (VPS Worker 用) ---

/**
 * GET /api/ops/step/next
 * 次の実行待ちステップを取得（VPS Worker が polling）
 */
router.get('/step/next', async (req, res) => {
  // queued ステップを step_order 昇順で1件取得し、running に更新
  const step = await prisma.$transaction(async (tx) => {
    const next = await tx.opsMissionStep.findFirst({
      where: { status: 'queued' },
      orderBy: [
        { createdAt: 'asc' },
        { stepOrder: 'asc' }
      ],
      include: {
        mission: {
          include: { proposal: true }
        }
      }
    });

    if (!next) return null;

    // 同一ミッション内で前のステップが完了しているか確認
    if (next.stepOrder > 0) {
      const prevStep = await tx.opsMissionStep.findFirst({
        where: {
          missionId: next.missionId,
          stepOrder: next.stepOrder - 1
        }
      });
      if (prevStep && prevStep.status !== 'succeeded') {
        return null; // 前のステップがまだ完了していない
      }
    }

    // running に更新（claim）
    await tx.opsMissionStep.update({
      where: { id: next.id },
      data: { status: 'running', reservedAt: new Date() }
    });

    return next;
  });

  if (!step) {
    return res.json({ step: null });
  }

  res.json({
    step: {
      id: step.id,
      missionId: step.missionId,
      stepKind: step.stepKind,
      stepOrder: step.stepOrder,
      input: step.input,
      proposalPayload: step.mission.proposal.payload,
      skillName: step.mission.proposal.skillName
    }
  });
});

/**
 * PATCH /api/ops/step/:id/complete
 * ステップ完了報告
 */
const StepCompleteSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  output: z.record(z.unknown()).optional(),
  error: z.string().optional()
});

// P1 #6 解消: step_kind 別の output 必須フィールド（バリデーションは warn ログのみ、reject しない）
// 理由: VPS Worker の出力を厳密に拒否すると、バージョン不一致時にステップが永久に失敗する
// 実装: output 保存後にフィールド不足を warn ログ出力（監視用）
const STEP_OUTPUT_HINTS = {
  draft_content:       ['content', 'hookId', 'platform'],
  verify_content:      ['content', 'verificationScore', 'passed'],
  post_x:              ['postId', 'platform'],
  post_tiktok:         ['postId', 'platform'],
  fetch_metrics:       ['metrics', 'postId', 'platform'],
  analyze_engagement:  ['analysis', 'isHighEngagement', 'engagementRate'],
  detect_suffering:    [],  // VPS パススルー（動的output）
  diagnose:            ['diagnosis'],
  draft_nudge:         ['nudgeContent'],
  send_nudge:          ['sent'],
  evaluate_hook:       ['shouldPost'],
};

router.patch('/step/:id/complete', async (req, res) => {
  const { id } = req.params;
  const parsed = StepCompleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { status, output, error } = parsed.data;

  // H14修正: ステータスガード — running 以外のステップを完了させない
  // 二重完了や、queued→complete（runningスキップ）を防止
  const current = await prisma.opsMissionStep.findUnique({ where: { id }, select: { status: true } });
  if (!current || current.status !== 'running') {
    return res.status(409).json({
      error: `Step ${id} is not in 'running' state (current: ${current?.status || 'not found'})`
    });
  }

  const step = await prisma.opsMissionStep.update({
    where: { id },
    data: {
      status,
      output: output || {},
      lastError: error || null,
      completedAt: new Date()
    }
  });

  // ミッション最終化判定
  const missionStatus = await maybeFinalizeMission(step.missionId);

  res.json({ ok: true, stepStatus: status, missionStatus });
});

export default router;
```

### ルーターのマウント

```javascript
// apps/api/src/routes/index.js に追加

import opsRouter from './ops/index.js';
import approvalRouter from './ops/approval.js';
import summaryRouter from './ops/summary.js';
import { opsAuth } from '../middleware/opsAuth.js';

// 既存のルーター（変更なし）
app.use('/api/mobile', mobileRouter);
// ...

// 新規: Ops API（全エンドポイントに opsAuth 適用）
app.use('/api/ops', opsAuth, opsRouter);
// H8修正: approval エンドポイントにも opsAuth を適用
// Slack Interactivity URL → VPS → Railway 転送パスで Bearer Token が付与される前提
app.use('/api/ops', opsAuth, approvalRouter);
app.use('/api/ops', opsAuth, summaryRouter);
```

---

## 9. Kill Switch（自動承認しない操作）

| step_kind | 自動承認 | 理由 |
|-----------|---------|------|
| `draft_content` | ✅ 許可 | 下書きは安全。外部に影響なし |
| `verify_content` | ✅ 許可 | 検証するだけ。外部に影響なし |
| `detect_suffering` | ✅ 許可 | 検出するだけ。行動しない |
| `fetch_metrics` | ✅ 許可 | データ取得のみ |
| `analyze_engagement` | ✅ 許可 | 分析するだけ。外部に影響なし |
| `diagnose` | ✅ 許可 | 診断するだけ |
| **`post_x`** | **❌ 禁止** | 公開投稿。VoxYZ: "post_tweet will never auto-approve" |
| **`post_tiktok`** | **❌ 禁止** | 公開投稿 |
| **`send_nudge`** | **❌ 禁止** | ユーザーへの直接介入。仏教原則: ehipassiko |
| **`deploy`** | **❌ 永久禁止** | インフラ変更 |
| **`reply_dm`** | **❌ 永久禁止** | テーラヴァーダの不請法則に違反 |

**「post_x を auto-approve しないのに、どうやって自動投稿するのか？」**

答え: 現フェーズ（P2相当）では、post_x を含む提案は `status: 'pending'` のまま止まる。人間がSlack通知を見て承認する。将来 P3（自動実行+事後報告）に昇格した時点で、`auto_approve.allowed_step_kinds` に `post_x` を追加する。これは ops_policy テーブルの1行を更新するだけ。コード変更不要。

---

## 10. 認証

| エンドポイント | 認証方式 | 理由 |
|--------------|---------|------|
| `POST /api/ops/proposal` | Bearer Token (`ANICCA_AGENT_TOKEN`) | VPS Worker からのみ呼ばれる |
| `GET /api/ops/heartbeat` | Bearer Token (`ANICCA_AGENT_TOKEN`) | VPS crontab からのみ呼ばれる |
| `GET /api/ops/step/next` | Bearer Token (`ANICCA_AGENT_TOKEN`) | VPS Worker からのみ呼ばれる |
| `PATCH /api/ops/step/:id/complete` | Bearer Token (`ANICCA_AGENT_TOKEN`) | VPS Worker からのみ呼ばれる |

```javascript
// apps/api/src/middleware/opsAuth.js

/**
 * Ops API 認証ミドルウェア
 * ANICCA_AGENT_TOKEN で Bearer 認証
 */
export function opsAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token || token !== process.env.ANICCA_AGENT_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}
```
