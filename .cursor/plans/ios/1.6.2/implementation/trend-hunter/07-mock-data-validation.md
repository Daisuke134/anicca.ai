## モックAPIレスポンス（P0-3）

### TwitterAPI.io — Advanced Search レスポンス

```json
{
  "tweets": [
    {
      "type": "tweet",
      "id": "1846987139428634858",
      "url": "https://x.com/testuser/status/1846987139428634858",
      "text": "毎日「今日は早く寝よう」って決めてるのに気づいたら2時半でスマホ握りしめてる人、いいねしてくれ",
      "source": "Twitter for iPhone",
      "retweetCount": 12000,
      "replyCount": 3400,
      "likeCount": 50000,
      "quoteCount": 890,
      "viewCount": 2500000,
      "bookmarkCount": 4500,
      "createdAt": "2026-02-07T18:30:00.000Z",
      "lang": "ja",
      "isReply": false,
      "isRetweet": false,
      "isQuote": false,
      "entities": {
        "hashtags": [
          { "text": "夜更かし" },
          { "text": "寝れない" }
        ],
        "urls": [],
        "mentions": []
      },
      "author": {
        "type": "user",
        "userName": "testuser",
        "name": "テストユーザー",
        "id": "123456789",
        "followers": 15000,
        "following": 500,
        "isBlueVerified": false,
        "profilePicture": "https://pbs.twimg.com/profile_images/xxx/photo.jpg"
      },
      "extendedEntities": {},
      "card": null,
      "place": null
    },
    {
      "type": "tweet",
      "id": "1846987139428634999",
      "url": "https://x.com/sleepexpert/status/1846987139428634999",
      "text": "How to fix your sleep schedule in 7 days: A thread based on neuroscience research 🧵\n\n1. Light exposure within 30 min of waking\n2. No screens 1hr before bed\n3. Same wake time every day (even weekends)",
      "source": "Twitter Web App",
      "retweetCount": 8000,
      "replyCount": 1200,
      "likeCount": 35000,
      "quoteCount": 2100,
      "viewCount": 5000000,
      "bookmarkCount": 12000,
      "createdAt": "2026-02-06T14:00:00.000Z",
      "lang": "en",
      "isReply": false,
      "isRetweet": false,
      "isQuote": false,
      "entities": {
        "hashtags": [],
        "urls": [],
        "mentions": []
      },
      "author": {
        "type": "user",
        "userName": "sleepexpert",
        "name": "Dr. Sleep",
        "id": "987654321",
        "followers": 250000,
        "following": 800,
        "isBlueVerified": true,
        "profilePicture": "https://pbs.twimg.com/profile_images/yyy/photo.jpg"
      },
      "extendedEntities": {},
      "card": null,
      "place": null
    }
  ],
  "has_next_page": true,
  "next_cursor": "DAACCgACGdy1XF2xbk8KAAIZw"
}
```

### reddapi.dev — Semantic Search レスポンス

```json
{
  "success": true,
  "data": {
    "query": "can't stop staying up late scrolling phone",
    "results": [
      {
        "id": "1a2b3c4d",
        "title": "I literally cannot stop staying up until 3am every single night",
        "content": "I've tried everything - setting alarms, putting my phone in another room, downloading sleep apps. Nothing works. I know it's destroying my health but every night I tell myself 'just 5 more minutes' and suddenly it's 3am. Anyone else dealing with this? It's been going on for 6 years now.",
        "subreddit": "r/selfimprovement",
        "upvotes": 4523,
        "comments": 342,
        "created": "2026-02-05T22:15:00Z",
        "relevance": 0.97,
        "sentiment": "negative",
        "url": "https://reddit.com/r/selfimprovement/comments/1a2b3c4d"
      },
      {
        "id": "5e6f7g8h",
        "title": "The real reason you can't sleep on time (it's not what you think)",
        "content": "Sleep psychologist here. The reason most people can't stick to a sleep schedule isn't willpower - it's revenge bedtime procrastination. Your brain feels it didn't get enough 'me time' during the day, so it steals it from your sleep. Here's what actually works...",
        "subreddit": "r/getdisciplined",
        "upvotes": 8901,
        "comments": 567,
        "created": "2026-02-04T15:30:00Z",
        "relevance": 0.92,
        "sentiment": "neutral",
        "url": "https://reddit.com/r/getdisciplined/comments/5e6f7g8h"
      },
      {
        "id": "9i0j1k2l",
        "title": "6 years of trying to fix my sleep schedule. Nothing worked until I did this one thing.",
        "content": "I'm not selling anything. I just finally figured out what was keeping me up. It wasn't the phone. It wasn't caffeine. It was anxiety about tomorrow. Once I started journaling my worries before bed, I started falling asleep in 20 minutes instead of 3 hours.",
        "subreddit": "r/DecidingToBeBetter",
        "upvotes": 2156,
        "comments": 189,
        "created": "2026-02-03T08:45:00Z",
        "relevance": 0.89,
        "sentiment": "positive",
        "url": "https://reddit.com/r/DecidingToBeBetter/comments/9i0j1k2l"
      }
    ],
    "total": 20,
    "processing_time_ms": 1245,
    "ai_summary": "Users commonly report chronic inability to maintain sleep schedules despite knowing the health consequences. Key themes: phone addiction before bed, revenge bedtime procrastination, and underlying anxiety driving late-night behavior."
  }
}
```

### reddapi.dev — Trends レスポンス

```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "topic": "revenge bedtime procrastination",
        "post_count": 1247,
        "total_upvotes": 45632,
        "total_comments": 8934,
        "avg_sentiment": -0.35,
        "top_subreddits": ["r/selfimprovement", "r/getdisciplined", "r/sleep"],
        "trending_keywords": ["phone addiction", "doom scrolling", "sleep schedule", "3am"],
        "trend_score": 98.5,
        "growth_rate": 245.3,
        "sample_posts": [
          {
            "id": "abc123",
            "title": "Anyone else revenge scroll until 3am?",
            "subreddit": "r/selfimprovement",
            "upvotes": 5432
          }
        ]
      },
      {
        "topic": "dopamine detox failures",
        "post_count": 834,
        "total_upvotes": 28900,
        "total_comments": 5600,
        "avg_sentiment": -0.42,
        "top_subreddits": ["r/nosurf", "r/selfimprovement", "r/getdisciplined"],
        "trending_keywords": ["dopamine", "screen time", "addiction", "cold turkey"],
        "trend_score": 87.2,
        "growth_rate": 189.7,
        "sample_posts": [
          {
            "id": "def456",
            "title": "I tried dopamine detox for 30 days and here's what happened",
            "subreddit": "r/nosurf",
            "upvotes": 3210
          }
        ]
      }
    ]
  }
}
```

### Apify TikTok Trends Scraper — 出力レスポンス

```json
[
  {
    "id": "1686858772679682",
    "name": "#sleepschedule",
    "url": "https://www.tiktok.com/tag/sleepschedule",
    "countryCode": "JP",
    "rank": 12,
    "industryName": "Education",
    "videoCount": 4523,
    "viewCount": 15800000,
    "rankDiff": 8,
    "markedAsNew": true,
    "isPromoted": false
  },
  {
    "id": "1686858772679999",
    "name": "#夜更かし",
    "url": "https://www.tiktok.com/tag/夜更かし",
    "countryCode": "JP",
    "rank": 45,
    "industryName": "Life",
    "videoCount": 890,
    "viewCount": 3200000,
    "rankDiff": 15,
    "markedAsNew": false,
    "isPromoted": false
  },
  {
    "id": "1686858772680111",
    "name": "#promoted_wellness",
    "url": "https://www.tiktok.com/tag/promoted_wellness",
    "countryCode": "JP",
    "rank": 3,
    "industryName": "Life",
    "videoCount": 12000,
    "viewCount": 50000000,
    "rankDiff": 0,
    "markedAsNew": false,
    "isPromoted": true
  }
]
```

### Apify API 呼び出しパラメータ

```json
{
  "input": {
    "adsScrapeHashtags": true,
    "resultsPerPage": 100,
    "adsCountryCode": "JP",
    "adsTimeRange": "7",
    "adsHashtagIndustry": ""
  },
  "pricing_note": "$0.005/run + $3.00/1,000 results. 100 hashtags = ~$0.305/run.",
  "sync_endpoint": "https://api.apify.com/v2/acts/clockworks~tiktok-trends-scraper/run-sync-get-dataset-items?token=TOKEN"
}
```

### Railway API — GET /api/agent/hooks レスポンス（期待）

```json
{
  "hooks": [
    {
      "id": "hook_001",
      "content": "毎晩同じ約束を自分にして、毎晩破る。6年間ずっとこれ。",
      "problemType": "staying_up_late",
      "source": "trend-hunter",
      "metadata": {
        "contentType": "empathy",
        "trendSource": { "platform": "x", "url": "https://x.com/..." },
        "allProblemTypes": ["staying_up_late"],
        "platform": "x"
      },
      "createdAt": "2026-02-07T05:00:00Z",
      "stats": {
        "impressions": 0,
        "engagements": 0,
        "score": 0
      }
    }
  ]
}
```

### Railway API — POST /api/agent/hooks リクエスト仕様（C3解消）

> **エンドポイント契約**: trend-hunter が hook を保存する際の POST リクエスト仕様

```json
{
  "endpoint": "POST /api/agent/hooks",
  "auth": "Authorization: Bearer ${ANICCA_AGENT_TOKEN}",
  "content_type": "application/json",
  "request_body_example": {
    "content": "毎晩同じ約束を自分にして、毎晩破る。6年間ずっとこれ。",
    "problemType": "staying_up_late",
    "source": "trend-hunter",
    "idempotencyKey": "hook-1707300000000-a1b2c3",
    "metadata": {
      "contentType": "empathy",
      "trendSource": {
        "platform": "x",
        "url": "https://x.com/testuser/status/1846987139428634858",
        "hashtags": ["夜更かし", "寝れない"],
        "metrics": { "likes": 50000, "retweets": 12000 }
      },
      "allProblemTypes": ["staying_up_late"],
      "platform": "x",
      "angle": "夜更かしの当事者共感"
    }
  },
  "response_201_created": {
    "id": "hook_abc123",
    "content": "...",
    "createdAt": "2026-02-08T05:00:00Z"
  },
  "response_200_duplicate": {
    "status": "duplicate",
    "existingId": "hook_abc123",
    "message": "Hook with idempotencyKey already exists"
  },
  "response_400_validation": {
    "error": "validation",
    "message": "content is required and must be <= 500 characters"
  }
}
```

**idempotencyKey**: JSON bodyに含める（ヘッダーではない）。同一キーの2回目以降は200 + duplicate（エラーではない）。
**必須フィールド**: `content`, `problemType`, `source`
**任意フィールド**: `idempotencyKey`, `metadata`

> **実装**: trend-hunter 実装前に Railway API 側でこのエンドポイントを作成する必要がある。

---

## LLM出力バリデーション（P1）

### フィルタ出力スキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["trend_id", "relevance_score", "virality", "content_type", "problemTypes", "angle"],
    "properties": {
      "trend_id": { "type": "string" },
      "relevance_score": { "type": "number", "minimum": 0, "maximum": 10 },
      "virality": { "enum": ["high", "medium", "low"] },
      "content_type": { "enum": ["empathy", "solution"] },
      "problemTypes": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
      "angle": { "type": "string", "minLength": 1 },
      "skip_reason": { "type": ["string", "null"] }
    }
  }
}
```

### hook生成出力スキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "maxItems": 5,
  "items": {
    "type": "object",
    "required": ["content", "contentType", "problemTypes", "platform", "trendSource", "angle"],
    "properties": {
      "content": { "type": "string", "maxLength": 500 },
      "contentType": { "enum": ["empathy", "solution"] },
      "problemTypes": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
      "platform": { "enum": ["x", "tiktok", "both"] },
      "trendSource": {
        "type": "object",
        "required": ["platform"],
        "properties": {
          "platform": { "type": "string" },
          "url": { "type": ["string", "null"] },
          "hashtags": { "type": "array", "items": { "type": "string" } },
          "metrics": { "type": "object" }
        }
      },
      "angle": { "type": "string" }
    }
  }
}
```

**LLM出力がスキーマに適合しない場合**: パースエラーとして処理 → 1回リトライ → 失敗なら当該バッチをスキップしてDLQに記録。

### LLM出力の合格サンプル（P0 #11 解消）

**フィルタ出力 — 合格例:**

```json
[
  {
    "trend_id": "1846987139428634858",
    "relevance_score": 9,
    "virality": "high",
    "content_type": "empathy",
    "problemTypes": ["staying_up_late"],
    "angle": "夜更かしの当事者が大量共感を得ている — 「あなただけじゃない」系hookに最適",
    "skip_reason": null
  },
  {
    "trend_id": "1846987139428634999",
    "relevance_score": 8,
    "virality": "high",
    "content_type": "solution",
    "problemTypes": ["staying_up_late", "cant_wake_up"],
    "angle": "睡眠科学ベースの対処法スレッド — Aniccaの機能紹介hookに変換可能",
    "skip_reason": null
  },
  {
    "trend_id": "5e6f7g8h",
    "relevance_score": 3,
    "virality": "medium",
    "content_type": "solution",
    "problemTypes": ["staying_up_late"],
    "angle": "",
    "skip_reason": "一般的な睡眠知識で、ペルソナの「挫折6年」に刺さらない"
  }
]
```

**hook生成出力 — 合格例:**

```json
[
  {
    "content": "毎晩「今日こそ早く寝る」って決めて、気づいたら3時。\n6年間ずっとこれ。習慣アプリ5個試した。全部3日で消した。\n方法の問題じゃなかった。 #夜更かし #寝れない",
    "contentType": "empathy",
    "problemTypes": ["staying_up_late"],
    "platform": "x",
    "trendSource": {
      "platform": "x",
      "url": "https://x.com/testuser/status/1846987139428634858",
      "hashtags": ["夜更かし", "寝れない"],
      "metrics": { "likes": 50000, "retweets": 12000 }
    },
    "angle": "夜更かしバズ投稿の共感を活用、6年間の挫折を強調"
  },
  {
    "content": "How to fix your sleep schedule — I've read every thread.\nTried every tip. Light exposure, no screens, melatonin.\nAll lasted 3 days. The problem wasn't the method.\nIt was me. Until I changed one thing. #sleepschedule",
    "contentType": "solution",
    "problemTypes": ["staying_up_late", "cant_wake_up"],
    "platform": "x",
    "trendSource": {
      "platform": "x",
      "url": "https://x.com/sleepexpert/status/1846987139428634999",
      "hashtags": [],
      "metrics": { "likes": 35000, "retweets": 8000 }
    },
    "angle": "科学的スレッドの人気に乗り、「方法は知ってるけど続かない」ペルソナを狙う"
  }
]
```

**不合格パターン（テスト用）:**

| パターン | 入力 | 期待エラー |
|---------|------|----------|
| 空配列 | `[]` | スキーマ合格だが0件 — 正常扱い |
| 必須フィールド欠落 | `[{"trend_id": "x"}]` | `relevance_score` missing |
| 範囲外スコア | `[{"relevance_score": 15, ...}]` | `maximum: 10` 違反 |
| 不正 virality | `[{"virality": "super", ...}]` | `enum` 違反 |
| 不正 JSON | `"これはJSONではない"` | JSON.parse 失敗 |
| 混合（一部不正） | `[{valid}, {invalid}]` | 配列全体がスキーマ不適合（部分合格なし） |

---

## 重複判定アルゴリズム（P1）

### 採用: Jaccard類似度（bi-gram）

LLM呼び出しなしで高速に重複チェックできる軽量アルゴリズム。

```javascript
function jaccardBigram(text1, text2) {
  const bigrams = (s) => {
    const normalized = s.replace(/\s+/g, ' ').trim().toLowerCase();
    const set = new Set();
    for (let i = 0; i < normalized.length - 1; i++) {
      set.add(normalized.substring(i, i + 2));
    }
    return set;
  };

  const a = bigrams(text1);
  const b = bigrams(text2);
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 閾値: 0.7以上 = 重複とみなす
const SIMILARITY_THRESHOLD = 0.7;
```

**なぜJaccardか**:
| 手法 | 速度 | 精度 | LLM呼び出し | 適用 |
|------|------|------|------------|------|
| LLMに判定させる | 遅い（1-2秒/ペア） | 最高 | あり（コスト） | 不採用 |
| コサイン類似度（TF-IDF） | 中 | 高 | なし | 大規模向け |
| **Jaccard（bi-gram）** | **最速** | **十分** | **なし** | **採用**（hook数が少ない段階） |
| 完全一致 | 最速 | 低（言い換えを検出不可） | なし | 不採用 |

hook数が1000件超になったらコサイン類似度に移行を検討。

---

## 未解決項目（P1/P2）

| 優先度 | 項目 | 状態 | 対策 |
|--------|------|------|------|
| P1 | Railway API `/api/agent/hooks` の実装有無確認 | 未確認 | 実装前にcurlで確認。なければAPI作成が先行タスク |
| P1 | reddapi 500 calls/月で足りるか | ギリギリ（推定540） | モニタリング + Reddit公式APIフォールバック |
| P2 | `executionCount` の永続化 | 未設計 | OpenClaw memory ツールで保存 or ファイルベース |
| P2 | hook候補の有効期限管理 | 未設計 | `createdAt` + 30日で自動期限切れ（Railway API側） |
| P2 | Slack `#trends` チャンネル存在確認 | 未確認 | 実装前にSlack APIで確認。なければ作成 |

