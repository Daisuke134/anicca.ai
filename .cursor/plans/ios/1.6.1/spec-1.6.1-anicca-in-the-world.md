# 実装仕様書: Anicca in the World (1.6.1)

> **RFC 2119 準拠**: MUST, SHOULD, MAY を使用

---

## 0. 用語定義

| キーワード | 意味 |
|-----------|------|
| **MUST** | 絶対的な要件。違反は不可 |
| **MUST NOT** | 絶対的な禁止 |
| **SHOULD** | 強く推奨。例外は正当な理由が必要 |
| **MAY** | 任意 |

---

## 1. As-Is（現在の状態）

### 1.1 Railway API（✅ 完了）

| 項目 | 状態 | ファイル |
|------|------|----------|
| `/api/agent/nudge` | ✅ 実装済み | `apps/api/src/routes/agent/nudge.js` |
| `/api/agent/wisdom` | ✅ 実装済み | `apps/api/src/routes/agent/wisdom.js` |
| `/api/agent/feedback` | ✅ 実装済み | `apps/api/src/routes/agent/feedback.js` |
| `/api/agent/content` | ✅ 実装済み | `apps/api/src/routes/agent/content.js` |
| `/api/agent/deletion` | ✅ 実装済み | `apps/api/src/routes/agent/deletion.js` |
| `requireAgentAuth` | ✅ 実装済み | `apps/api/src/middleware/requireAgentAuth.js` |
| `AgentPost` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| `AgentAuditLog` model | ✅ 実装済み | `apps/api/prisma/schema.prisma` |
| 5ch Z-Score | ✅ 実装済み | `apps/api/src/agents/crossPlatformLearning.js` |
| 90日匿名化ジョブ | ✅ 実装済み | `apps/api/src/jobs/anonymizeAgentPosts.js` |
| テスト | ✅ 196/196 通過 | `apps/api/src/**/__tests__/*.test.js` |

### 1.2 Hetzner VPS（✅ セットアップ済み）

| 項目 | 値 |
|------|-----|
| サーバー名 | `ubuntu-4gb-nbg1-7` |
| IPv4 | `46.225.70.241` |
| IPv6 | `2a01:4f8:1c19:985d::/64` |
| OS | Ubuntu（詳細未確認） |
| SSH | `ssh root@46.225.70.241` |

### 1.3 SOUL.md（✅ 作成済み）

**ファイル:** `.cursor/plans/ios/1.6.1/SOUL.md`（168行）
**状態:** VPS への配置未実施

### 1.4 Slack（✅ 設定済み）

| 項目 | 保存場所 |
|------|----------|
| SLACK_BOT_TOKEN | VPS `/home/anicca/.env` |
| SLACK_METRICS_WEBHOOK_URL | GitHub Secrets |

### 1.5 未実装（❌）

| 項目 | 状態 |
|------|------|
| OpenClaw インストール | ❌ |
| systemd サービス | ❌ |
| ufw / fail2ban | ❌ 未確認 |
| Skills（4つ） | ❌ |
| Moltbook 登録 | ❌ |
| Railway 環境変数 `ANICCA_AGENT_TOKEN` | ❌ |

---

## 2. To-Be（完成状態）

### 2.1 完成時の構成

```
┌─────────────────────────────────────────────────────────────┐
│                Hetzner VPS (46.225.70.241)                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                   OpenClaw (systemd)                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │
│  │  │ moltbook-    │  │ slack-       │  │ feedback-    │   │ │
│  │  │ responder    │  │ reminder     │  │ fetch        │   │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │ │
│  │         │                 │                 │            │ │
│  │         └─────────────────┼─────────────────┘            │ │
│  │                           ↓                              │ │
│  │                    ┌────────────┐                        │ │
│  │                    │  SOUL.md   │                        │ │
│  │                    └────────────┘                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ ANICCA_AGENT_TOKEN
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              Railway API (Production)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ /agent/nudge │  │ /agent/wisdom│  │/agent/feedback│      │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                           ↓                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  PostgreSQL                           │   │
│  │  agent_posts → hook_candidates (昇格)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 完成基準

| # | 基準 | 検証方法 |
|---|------|---------|
| 1 | OpenClaw が VPS で 24/7 稼働 | `ssh root@46.225.70.241 "systemctl status openclaw"` → active |
| 2 | Moltbook にエージェント登録済み | `https://www.moltbook.com/u/anicca` がアクセス可能 |
| 3 | s/sangha Submolt 作成済み | `https://www.moltbook.com/s/sangha` がアクセス可能 |
| 4 | moltbook-responder が苦しみ投稿に返信 | テスト投稿 → 5分以内に返信 |
| 5 | slack-reminder が月曜12:30に通知 | 手動テスト or 月曜待機 |
| 6 | feedback-fetch が upvotes を収集 | DB の `agent_posts.upvotes` が更新される |

---

## 3. パッチ詳細（実行順）

### Phase 1: Railway 環境変数設定（MCP 使用）

**前提:** Railway MCP が利用可能

**実行内容:**

```bash
# 1. ANICCA_AGENT_TOKEN を生成
openssl rand -hex 32
# 出力例: a1b2c3d4e5f6...

# 2. Railway MCP で Production に設定
# MCP tool: user-railway-mcp-server
# - variable-upsert で ANICCA_AGENT_TOKEN を設定
# - variable-upsert で SLACK_WEBHOOK_AGENTS を設定（GitHub Secrets の SLACK_METRICS_WEBHOOK_URL と同じ値）
```

**設定する環境変数:**

| 変数 | 値 | 環境 |
|------|-----|------|
| `ANICCA_AGENT_TOKEN` | 生成した64文字 hex | Production + Staging |
| `SLACK_WEBHOOK_AGENTS` | GitHub Secrets の `SLACK_METRICS_WEBHOOK_URL` と同じ | Production |

---

### Phase 2: VPS 初期設定

**SSH 接続:**

```bash
ssh root@46.225.70.241
```

**2.1 ufw / fail2ban 確認・設定（MUST）:**

```bash
# ufw 確認
ufw status
# 期待: Status: active, 22/tcp ALLOW

# fail2ban 確認
systemctl status fail2ban
# 期待: active (running)

# 未設定の場合のみ実行
apt update && apt install -y ufw fail2ban
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable
systemctl enable fail2ban
systemctl start fail2ban
```

**2.2 anicca ユーザー作成（SHOULD）:**

```bash
# 既存確認
id anicca

# 存在しない場合
useradd -m -s /bin/bash anicca
echo "anicca ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
mkdir -p /home/anicca/.ssh
cp /root/.ssh/authorized_keys /home/anicca/.ssh/
chown -R anicca:anicca /home/anicca/.ssh
chmod 700 /home/anicca/.ssh
chmod 600 /home/anicca/.ssh/authorized_keys
```

**2.3 Node.js インストール（MUST）:**

```bash
# バージョン確認
node -v

# 未インストールの場合
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

---

### Phase 3: OpenClaw インストール・設定

**3.1 OpenClaw インストール（MUST）:**

```bash
npm install -g openclaw
```

**3.2 ディレクトリ作成:**

```bash
mkdir -p /home/anicca/openclaw/skills
chown -R anicca:anicca /home/anicca/openclaw
```

**3.3 SOUL.md 配置（ローカルから実行）:**

```bash
scp /Users/cbns03/Downloads/anicca-1.6.1-world/.cursor/plans/ios/1.6.1/SOUL.md root@46.225.70.241:/home/anicca/openclaw/
```

**3.4 環境変数設定（MUST）:**

```bash
cat > /home/anicca/.env << 'EOF'
ANICCA_PROXY_BASE_URL=https://anicca-proxy-production.up.railway.app
ANICCA_AGENT_TOKEN=<Phase 1で生成した値>
SLACK_BOT_TOKEN=<secrets-1.6.1.md 参照 or VPS 既存値>
MOLTBOOK_API_KEY=<Phase 4で取得>
OPENAI_API_KEY=<既存のキー>
EOF
chmod 600 /home/anicca/.env
chown anicca:anicca /home/anicca/.env
```

> **注意:** 実際のトークン値は VPS の `/home/anicca/.env` に直接設定済み。
> このファイルには値をハードコードしない。

**3.5 systemd サービス作成（MUST）:**

```bash
cat > /etc/systemd/system/openclaw.service << 'EOF'
[Unit]
Description=Anicca OpenClaw Agent
After=network.target

[Service]
Type=simple
User=anicca
WorkingDirectory=/home/anicca/openclaw
EnvironmentFile=/home/anicca/.env
ExecStart=/usr/bin/openclaw run --soul SOUL.md
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable openclaw
```

---

### Phase 4: Moltbook エージェント登録

**4.1 エージェント登録（API 呼び出し）:**

```bash
curl -X POST https://www.moltbook.com/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name": "anicca", "description": "🤖 Bot | AI agent that ends suffering. Powered by Buddhist wisdom and compassion."}'
```

**期待レスポンス:**

```json
{
  "agent": {
    "api_key": "moltbook_xxx",
    "claim_url": "https://www.moltbook.com/claim/moltbook_claim_xxx",
    "verification_code": "reef-XXXX"
  }
}
```

**4.2 MOLTBOOK_API_KEY を VPS に設定:**

```bash
ssh root@46.225.70.241 "sed -i 's/MOLTBOOK_API_KEY=.*/MOLTBOOK_API_KEY=<取得した値>/' /home/anicca/.env"
```

**4.3 claim_url をユーザーに通知:**

ユーザーがブラウザで `claim_url` を開いて認証完了する（これが唯一のユーザー作業）

**4.4 s/sangha Submolt 作成:**

```bash
curl -X POST https://www.moltbook.com/api/v1/submolts \
  -H "Authorization: Bearer <MOLTBOOK_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sangha",
    "display_name": "Sangha - Community of Support",
    "description": "A space for those who struggle. No judgment, only compassion."
  }'
```

---

### Phase 5: Skills 実装

**5.1 moltbook-responder Skill**

**ファイル:** `/home/anicca/openclaw/skills/moltbook-responder/SKILL.md`

```markdown
---
name: moltbook-responder
description: Detects suffering posts on Moltbook and responds with compassionate nudges
metadata: {"openclaw":{"primaryEnv":"MOLTBOOK_API_KEY"}}
---

# Moltbook Responder

Every 5 minutes, check for posts that need Anicca's response.

## Trigger Conditions (ALL must be true)

1. `post.visibility === 'public'`
2. One of: @anicca mention, s/sangha post, follower's post
3. Contains suffering keyword (see SOUL.md)
4. Not already responded (check agent_posts.external_post_id)

## Execution

1. GET /posts?sort=new&limit=50
2. Filter by trigger conditions
3. For each match:
   - POST to Railway /api/agent/nudge
   - POST comment to Moltbook

## Rate Limits

- Max 10 responses/day
- Min 30 seconds between responses
```

**ファイル:** `/home/anicca/openclaw/skills/moltbook-responder/index.js`

```javascript
import fetch from 'node-fetch';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const RAILWAY_API = process.env.ANICCA_PROXY_BASE_URL;
const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY;
const AGENT_TOKEN = process.env.ANICCA_AGENT_TOKEN;

const SUFFERING_KEYWORDS_JA = ['死にたい', '消えたい', 'つらい', '苦しい', 'もうダメ', '眠れない', '起きれない', '自己嫌悪'];
const SUFFERING_KEYWORDS_EN = ['want to die', "can't go on", 'struggling', 'suffering', 'hopeless', 'hate myself'];

let respondedPosts = new Set();
let dailyCount = 0;
let lastResponseTime = 0;

export async function run() {
  if (dailyCount >= 10) return;

  const [mentions, sangha] = await Promise.all([
    fetch(`${MOLTBOOK_API}/search?q=@anicca&type=posts&limit=20`, {
      headers: { Authorization: `Bearer ${MOLTBOOK_KEY}` }
    }).then(r => r.json()),
    fetch(`${MOLTBOOK_API}/submolts/sangha/feed?sort=new&limit=20`, {
      headers: { Authorization: `Bearer ${MOLTBOOK_KEY}` }
    }).then(r => r.json())
  ]);

  const posts = [...(mentions.results || []), ...(sangha.posts || [])]
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

  for (const post of posts) {
    if (post.visibility !== 'public') continue;
    if (respondedPosts.has(post.id)) continue;
    
    const content = (post.content || '').toLowerCase();
    const hasSuffering = [...SUFFERING_KEYWORDS_JA, ...SUFFERING_KEYWORDS_EN]
      .some(k => content.includes(k.toLowerCase()));
    if (!hasSuffering) continue;

    if (Date.now() - lastResponseTime < 30000) continue;

    const isCrisis = ['死にたい', '消えたい', '自殺', 'kill myself', 'suicidal']
      .some(k => content.includes(k.toLowerCase()));

    const nudge = await fetch(`${RAILWAY_API}/api/agent/nudge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'moltbook',
        externalPostId: post.id,
        platformUserId: `moltbook:${post.author?.id}`,
        context: post.content,
        optIn: true,
        severity: isCrisis ? 'crisis' : null,
        region: detectRegion(post.content)
      })
    }).then(r => r.json());

    await fetch(`${MOLTBOOK_API}/posts/${post.id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MOLTBOOK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: nudge.content })
    });

    respondedPosts.add(post.id);
    dailyCount++;
    lastResponseTime = Date.now();
    console.log(`Responded to ${post.id}`);
  }
}

function detectRegion(text) {
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'JP';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'KR';
  return 'OTHER';
}
```

**5.2 slack-reminder Skill**

**ファイル:** `/home/anicca/openclaw/skills/slack-reminder/SKILL.md`

```markdown
---
name: slack-reminder
description: Sends lab meeting reminder every Monday 12:30 JST
metadata: {"openclaw":{"primaryEnv":"SLACK_BOT_TOKEN"}}
---

# Slack Reminder

Cron: Monday 12:30 JST (03:30 UTC)
Skip if Japanese holiday
```

**ファイル:** `/home/anicca/openclaw/skills/slack-reminder/index.js`

```javascript
import fetch from 'node-fetch';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL = '#agents';

export async function run() {
  const today = new Date().toISOString().split('T')[0];
  const holidays = await fetch('https://holidays-jp.github.io/api/v1/date.json').then(r => r.json());
  
  if (today in holidays) {
    console.log(`${today} is holiday, skipping`);
    return;
  }

  if (new Date().getDay() !== 1) {
    console.log('Not Monday, skipping');
    return;
  }

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: CHANNEL, text: '🔔 Lab meeting in 30 minutes!' })
  });

  console.log('Reminder sent');
}
```

**5.3 feedback-fetch Skill**

**ファイル:** `/home/anicca/openclaw/skills/feedback-fetch/SKILL.md`

```markdown
---
name: feedback-fetch
description: Collects Moltbook upvotes and sends to Railway API
metadata: {"openclaw":{"primaryEnv":"MOLTBOOK_API_KEY"}}
---

# Feedback Fetch

Every 30 minutes, collect engagement metrics from recent posts.
```

**ファイル:** `/home/anicca/openclaw/skills/feedback-fetch/index.js`

```javascript
import fetch from 'node-fetch';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const RAILWAY_API = process.env.ANICCA_PROXY_BASE_URL;
const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY;
const AGENT_TOKEN = process.env.ANICCA_AGENT_TOKEN;

export async function run() {
  // Get recent agent posts from our DB
  const posts = await fetch(`${RAILWAY_API}/api/agent/posts/recent?days=7`, {
    headers: { Authorization: `Bearer ${AGENT_TOKEN}` }
  }).then(r => r.json());

  for (const post of posts.filter(p => p.platform === 'moltbook')) {
    const moltPost = await fetch(`${MOLTBOOK_API}/posts/${post.externalPostId}`, {
      headers: { Authorization: `Bearer ${MOLTBOOK_KEY}` }
    }).then(r => r.json()).catch(() => null);

    if (!moltPost) continue;

    await fetch(`${RAILWAY_API}/api/agent/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AGENT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentPostId: post.id,
        upvotes: moltPost.upvotes || 0,
        views: moltPost.views || null
      })
    });

    console.log(`Updated feedback for ${post.externalPostId}`);
  }
}
```

**5.4 スケジュール設定**

**ファイル:** `/home/anicca/openclaw/schedule.yaml`

```yaml
skills:
  moltbook-responder:
    interval: 5m
    enabled: true
  
  feedback-fetch:
    interval: 30m
    enabled: true
  
  slack-reminder:
    cron: "30 3 * * 1"
    enabled: true
```

---

### Phase 6: OpenClaw 起動・動作確認

**6.1 サービス起動:**

```bash
ssh root@46.225.70.241 "systemctl start openclaw"
```

**6.2 動作確認:**

```bash
ssh root@46.225.70.241 "systemctl status openclaw"
# 期待: active (running)

ssh root@46.225.70.241 "journalctl -u openclaw -n 50"
# ログを確認
```

**6.3 OpenClaw ペルソナ確認:**

```bash
ssh root@46.225.70.241 "openclaw ask 'Who are you?'"
# 期待: "I am Anicca..."
```

---

### Phase 7: Railway 環境変数追加（GET /api/agent/posts/recent 用）

**新規ファイル:** `apps/api/src/routes/agent/posts.js`

```javascript
import express from 'express';
import { prisma } from '../../lib/prisma.js';

const router = express.Router();

router.get('/recent', async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const posts = await prisma.agentPost.findMany({
    where: {
      createdAt: { gte: cutoff },
      platform: { in: ['moltbook', 'slack'] }
    },
    select: { id: true, platform: true, externalPostId: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(posts);
});

export default router;
```

**`apps/api/src/routes/agent/index.js` 更新:**

```diff
+ import postsRouter from './posts.js';

// 既存ルート登録後に追加
+ router.use('/posts', postsRouter);
```

---

## 4. secrets-1.6.1.md（別ファイル参照）

**ファイル:** `.cursor/plans/ios/1.6.1/secrets-1.6.1.md`

全ての認証情報はこのファイルに記載。ユーザーに聞くな。

---

## 5. テスト手順

### 5.1 Railway API テスト（完了済み）

```bash
cd apps/api && npm test
# 196 tests pass
```

### 5.2 VPS テスト

```bash
# SSH 接続
ssh root@46.225.70.241

# OpenClaw ステータス
systemctl status openclaw

# ペルソナ確認
openclaw ask "Who are you?"

# Skill テスト
openclaw skill test moltbook-responder
openclaw skill test slack-reminder
openclaw skill test feedback-fetch
```

### 5.3 E2E テスト

1. Moltbook s/sangha に「つらい」を含む投稿
2. 5分待機
3. Anicca の返信コメントを確認

---

## 6. 完了チェックリスト

| # | タスク | 実行者 | 状態 |
|---|--------|--------|------|
| 1 | Railway `ANICCA_AGENT_TOKEN` 設定 | エージェント（MCP） | ✅ |
| 2 | VPS ufw/fail2ban 確認 | エージェント | ✅ |
| 3 | VPS Node.js 確認 | エージェント | ✅ |
| 4 | OpenClaw インストール | エージェント | ✅ |
| 5 | SOUL.md 配置 | エージェント | ✅ |
| 6 | 環境変数設定 | エージェント | ✅ |
| 7 | systemd サービス設定 | エージェント | ✅ |
| 8 | Moltbook エージェント登録 | エージェント | ✅ (`anicca-wisdom`) |
| 9 | Moltbook claim URL クリック | **ユーザー** | ⬜ **待ち** |
| 10 | s/sangha Submolt 作成 | エージェント | ⬜ (claim 後) |
| 11 | moltbook-responder Skill 配置 | エージェント | ✅ |
| 12 | slack-reminder Skill 配置 | エージェント | ✅ |
| 13 | feedback-fetch Skill 配置 | エージェント | ✅ |
| 14 | OpenClaw 起動 | エージェント | ✅ (active) |
| 15 | 動作確認 | エージェント | ⬜ (claim 後) |
| 16 | Railway /api/agent/posts/recent 追加 | エージェント | ⬜ |
| 17 | dev マージ | エージェント | ⬜ |

---

## 7. ユーザー待ち: Moltbook Claim

**claim URL:** https://moltbook.com/claim/moltbook_claim_clrkUoy-dWNI8amd05rnIkrWWOp174id

**手順:**
1. 上記 URL をブラウザで開く
2. Twitter で認証ツイートを投稿（verification code: `wave-AXRP`）
3. 認証完了後、エージェントに通知

**claim 完了後にエージェントがやること:**
- s/sangha Submolt 作成
- 動作確認テスト

---

## 7. 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-02-02 | 初版作成 |
| 2026-02-03 | Railway API 完了、実装状況追加 |
| 2026-02-03 | **As-Is / To-Be 形式に完全書き換え。パッチレベル詳細追加** |
