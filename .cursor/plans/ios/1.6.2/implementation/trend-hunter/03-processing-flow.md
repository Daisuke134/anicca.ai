## 処理フロー

### Step 1: トレンド収集（ProblemType別 × ソース別）

選択されたProblemTypeグループに対して、各ソースから並列で検索。

#### 1a. TikTok（Apify `clockworks/tiktok-trends-scraper` 経由）

```javascript
// Apify TikTok Trends Scraper — Creative Center のトレンドデータを自動取得
// 既存の APIFY_API_TOKEN を利用（clockworks~tiktok-scraper と同じアカウント）
// ログイン不要、GUI作業なし

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'clockworks~tiktok-trends-scraper';

// 日本 + グローバルのトレンドハッシュタグを取得
const regions = ['JP', 'US', 'GB']; // 日本、アメリカ、イギリス

for (const region of regions) {
  // Apify Actor を実行
  const runResult = await exec(`curl -s -X POST \
    "https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${APIFY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"countryCode": "${region}", "period": 7, "dataType": "hashtag"}'`);

  const runId = JSON.parse(runResult).data.id;

  // 完了待ち（最大5分、5秒間隔でポーリング）
  let status = 'RUNNING';
  while (status === 'RUNNING') {
    await sleep(5000);
    const check = await exec(`curl -s \
      "https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}"`);
    status = JSON.parse(check).data.status;
  }

  // 結果取得
  const datasetId = JSON.parse(await exec(`curl -s \
    "https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}"`)).data.defaultDatasetId;

  const items = await exec(`curl -s \
    "https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}"`);

  const hashtags = JSON.parse(items);

  // ProblemType関連のハッシュタグをフィルタ
  // カテゴリ: Education, Life, Sports & Outdoor（メンタルヘルス系が多い）
  const relevant = hashtags.filter(h =>
    ['Education', 'Life'].includes(h.industryName) ||
    PROBLEM_TYPE_KEYWORDS.some(kw =>
      h.name.toLowerCase().includes(kw)
    )
  );

  trends.push(...relevant.map(h => ({
    source: 'tiktok',
    hashtag: h.name,
    rank: h.rank,
    videoCount: h.videoCount,
    viewCount: h.viewCount,
    rankDiff: h.rankDiff,       // ランク変動（+3 = 急上昇）
    isNew: h.markedAsNew,       // 新規トレンド
    region: h.countryCode,
    industry: h.industryName,
  })));
}

// ProblemType関連キーワード（ハッシュタグ名のフィルタ用）
const PROBLEM_TYPE_KEYWORDS = [
  'sleep', 'insomnia', 'nightowl', 'wakeup', 'morning',     // staying_up_late, cant_wake_up
  'selfcare', 'selflove', 'selfworth', 'mentalhealth',       // self_loathing
  'overthinking', 'anxiety', 'worry', 'stress',               // rumination, anxiety
  'procrastination', 'productivity', 'motivation', 'lazy',    // procrastination
  'honesty', 'trust', 'lying',                                 // lying
  'anger', 'angermanagement', 'calm',                          // anger
  'ocd', 'obsessive', 'intrusive',                             // obsessive
  'lonely', 'loneliness', 'alone',                             // loneliness
  'addiction', 'sober', 'nofap', 'recovery',                   // porn_addiction, alcohol_dependency
  'habit', 'routine', 'discipline', 'mindset',                 // 全般
  // 日本語ハッシュタグ
  '夜更かし', '朝活', '不安', 'メンタル', '習慣', '依存',
  '自己嫌悪', '先延ばし', '孤独', '怒り',
];

// コスト見積もり:
// 1回の実行: 3リージョン × 1 Actor Run = 3 Apify runs
// 1日6実行: 18 runs（各run で ~50-100ハッシュタグ取得）
// Apify Free: $5/月で約800件。18 × 30 = 540 runs → 無料枠内
```

#### 1b. Reddit（reddapi.dev セマンティック検索）

```javascript
// reddapi - 各ProblemTypeに対してセマンティック検索
// 共感系: 当事者の投稿を検索
// 問題解決系: 対処法を検索

for (const problemType of targetTypes) {
  const queries = QUERY_DICT[problemType];

  // 共感系: 当事者の叫び
  const empathyResult = await exec(`curl -s -X POST "https://reddapi.dev/api/v1/search/semantic" \
    -H "Authorization: Bearer ${REDDAPI_API_KEY}" \
    -d '{"query": "${queries.empathy_en}", "limit": 20}'`);

  // 問題解決系: 対処法バズ
  const solutionResult = await exec(`curl -s -X POST "https://reddapi.dev/api/v1/search/semantic" \
    -H "Authorization: Bearer ${REDDAPI_API_KEY}" \
    -d '{"query": "${queries.solution_en}", "limit": 20}'`);

  // score（upvote）が高いものだけ取得（バイラル判定）
  trends.push(...parseRedditResults(empathyResult, { problemType, type: 'empathy', minScore: 100 }));
  trends.push(...parseRedditResults(solutionResult, { problemType, type: 'solution', minScore: 100 }));
}

// 加えて、トレンドAPI で急成長トピックも取得
const trending = await exec(`curl -s "https://reddapi.dev/api/v1/trends" \
  -H "Authorization: Bearer ${REDDAPI_API_KEY}"`);
// growth_rate 上位から ProblemType に関連するものをフィルタ
```

#### 1c. X/Twitter（TwitterAPI.io 経由 — 公式X API不使用）

```javascript
// TwitterAPI.io: $0.15/1,000ツイート。メトリクス（いいね/RT/リプライ）取得可能。
// X API Free は write-only で検索不可。Basic は $200/月で高すぎる。
// Firecrawl は x.com を明示的にブロック。Brave site:x.com は不安定。

const TWITTERAPI_BASE = 'https://api.twitterapi.io/twitter';

for (const problemType of targetTypes) {
  const queries = QUERY_DICT[problemType];

  // 共感系（英語）: いいね1000以上のバズ投稿
  const empathyEn = await exec(`curl -s -X GET \
    "${TWITTERAPI_BASE}/tweet/advanced_search?query=${encodeURIComponent(queries.empathy_en + ' min_faves:1000')}&queryType=Top&cursor=" \
    -H "X-API-Key: ${TWITTERAPI_KEY}"`);

  // 問題解決系（英語）
  const solutionEn = await exec(`curl -s -X GET \
    "${TWITTERAPI_BASE}/tweet/advanced_search?query=${encodeURIComponent(queries.solution_en + ' min_faves:500')}&queryType=Top&cursor=" \
    -H "X-API-Key: ${TWITTERAPI_KEY}"`);

  // 共感系（日本語）: いいね100以上（日本語圏はボリューム少ないので閾値低め）
  const empathyJa = await exec(`curl -s -X GET \
    "${TWITTERAPI_BASE}/tweet/advanced_search?query=${encodeURIComponent(queries.empathy_ja + ' min_faves:100')}&queryType=Top&cursor=" \
    -H "X-API-Key: ${TWITTERAPI_KEY}"`);

  // 問題解決系（日本語）
  const solutionJa = await exec(`curl -s -X GET \
    "${TWITTERAPI_BASE}/tweet/advanced_search?query=${encodeURIComponent(queries.solution_ja + ' min_faves:50')}&queryType=Top&cursor=" \
    -H "X-API-Key: ${TWITTERAPI_KEY}"`);

  // レスポンスからメトリクス付きで取得
  // { text, likes, retweets, replies, author, url }
  trends.push(
    ...parseTweetsWithMetrics(empathyEn, { problemType, type: 'empathy', lang: 'en' }),
    ...parseTweetsWithMetrics(solutionEn, { problemType, type: 'solution', lang: 'en' }),
    ...parseTweetsWithMetrics(empathyJa, { problemType, type: 'empathy', lang: 'ja' }),
    ...parseTweetsWithMetrics(solutionJa, { problemType, type: 'solution', lang: 'ja' }),
  );
}

// レスポンスパーサー
function parseTweetsWithMetrics(response, meta) {
  const data = JSON.parse(response);
  return (data.tweets || []).map(tweet => ({
    source: 'x',
    problemType: meta.problemType,
    queryType: meta.type,
    lang: meta.lang,
    text: tweet.text,
    metrics: {
      likes: tweet.likeCount,
      retweets: tweet.retweetCount,
      replies: tweet.replyCount,
    },
    author: tweet.author?.userName,
    url: `https://x.com/${tweet.author?.userName}/status/${tweet.id}`,
  }));
}

// コスト見積もり:
// 1実行あたり: 4クエリ × 4ProblemType = 16リクエスト（各20件 = 320ツイート）
// 1日6実行: 96リクエスト（1,920ツイート）
// 月間コスト: 1,920 × 30 ÷ 1,000 × $0.15 = **約$8.64/月**
```

#### 1d. GitHub Trending（補助 — trend-watcher方式）

```javascript
// trend-watcher の httpRequest + parseTrendingHTML を流用
// メンタルヘルス・セルフケア系のリポジトリをチェック

const html = await httpRequest('https://github.com/trending?since=daily', 8000);
const repos = parseTrendingHTML(html);

// カテゴリフィルタ: メンタルヘルス、瞑想、習慣系
const MENTAL_HEALTH_KEYWORDS = [
  'meditation', 'mindfulness', 'habit', 'mental-health', 'wellness',
  'self-care', 'journaling', 'mood', 'anxiety', 'sleep',
];

const relevant = repos.filter(repo => {
  const text = `${repo.name} ${repo.description}`.toLowerCase();
  return MENTAL_HEALTH_KEYWORDS.some(kw => text.includes(kw));
});

// テック系トレンドは補助データとして保存（hook生成の優先度は低い）
trends.push(...relevant.map(r => ({
  source: 'github',
  type: 'tech_trend',
  ...r,
})));
```

### Step 2: Aniccaフィルタ（LLM判定）

収集したトレンドをLLMに渡して、hook候補としての価値を判定する。

```javascript
const FILTER_PROMPT = `
あなたはAniccaのトレンドアナリストです。

## Aniccaのターゲットペルソナ
- 25-35歳、6-7年間習慣化に失敗し続けている人
- 習慣アプリを10個以上試して全部3日坊主で挫折
- 「自分はダメな人間だ」と信じ込んでいる
- 諦めモードだが心の奥では変わりたい

## Aniccaの13 ProblemTypes
staying_up_late, cant_wake_up, self_loathing, rumination,
procrastination, anxiety, lying, bad_mouthing, porn_addiction,
alcohol_dependency, anger, obsessive, loneliness

## 2種類のバイラルコンテンツ
1. 共感系: 当事者が苦しみを語り、「わかる」「俺もそう」とバズっている
   → Aniccaの「あなただけじゃない」系hookに変換
2. 問題解決系: 「○○をやめる方法5選」「△△の対処法」等でバズっている
   → Aniccaの機能紹介hookに変換

## 以下のトレンドを分析してください:

{trends_json}

各トレンドに対して以下をJSON配列で返してください:
{
  "trend_id": "元のID",
  "relevance_score": 0-10,
  "virality": "high|medium|low",
  "content_type": "empathy|solution",
  "problemTypes": ["関連するProblemType（複数可）"],
  "angle": "Aniccaがこのトレンドにどう乗れるか（1行）",
  "skip_reason": "スキップ理由（relevance < 5 の場合のみ）"
}

## 判定基準
- relevance_score >= 5 AND virality != 'low' → 通過
- 苦しみの当事者投稿で大量共感 → 高スコア（共感系hook向き）
- 対処法・方法論で高エンゲージメント → 高スコア（問題解決系hook向き）
- ProblemTypeに直接関係ない一般的な話題 → 低スコア
`;
```

### Step 3: hook候補生成（LLM生成）

```javascript
const HOOK_PROMPT = `
フィルタを通過したトレンド:
{filtered_trends_json}

## hook生成ルール

### 絶対禁止
- 「簡単に習慣化！」「たった○日で！」→ ペルソナは信じない、警戒する
- 上から目線のアドバイス → ペルソナは反発する
- 「あなたは大丈夫」的な安易な励まし → 空虚に感じる

### 刺さるhookパターン
- 共感系: 「6年間、何も変われなかった」「習慣アプリ10個全部挫折」
- 問題解決系: 具体的で小さいステップ。「まず1つだけ」「完璧じゃなくていい」
- トレンドのハッシュタグ/キーワードを自然に含める（検索流入のため）

### 共感系hookの生成パターン
元トレンド: 「夜中3時にスマホ見てるの俺だけ？」（バズ: いいね5000+）
→ hook: 「毎晩『今日こそ早く寝る』って決めて、気づいたら3時。
   6年間ずっとこれ。同じ人いる？ #夜更かし #寝れない」

### 問題解決系hookの生成パターン
元トレンド: 「夜更かしを直す5つの方法」（バズ: RT2000+）
→ hook: 「夜更かしを直す方法、全部知ってる。全部試した。全部3日で終わった。
   方法が悪いんじゃない。続けられない自分がいるだけ。
   だから方法じゃなくて、続ける仕組みを変えた。 #夜更かし」

## 出力（JSON配列、最大5件）
{
  "content": "hookテキスト（max 500 chars）",
  "contentType": "empathy|solution",
  "trendSource": {
    "platform": "tiktok|reddit|x|github",
    "url": "元トレンドのURL（あれば）",
    "hashtags": ["関連ハッシュタグ"],
    "metrics": { "likes": 5000, "retweets": 2000 }
  },
  "angle": "切り口の説明",
  "problemTypes": ["staying_up_late"],
  "platform": "x|tiktok|both"
}
`;
```

### Step 4: 重複チェック & 保存

```javascript
// 1. 既存hookを取得
const existingHooks = await exec(`curl -s \
  -H "Authorization: Bearer ${ANICCA_AGENT_TOKEN}" \
  "https://anicca-proxy-staging.up.railway.app/api/agent/hooks"`);

// 2. 各候補に対して重複チェック
for (const candidate of hookCandidates) {
  // テキスト類似度チェック（LLMに判定させる）
  const isDuplicate = await checkSimilarity(candidate.content, existingHooks, threshold=0.8);

  if (!isDuplicate) {
    // 3. Railway DB に保存
    await exec(`curl -s -X POST \
      -H "Authorization: Bearer ${ANICCA_AGENT_TOKEN}" \
      -H "Content-Type: application/json" \
      "https://anicca-proxy-staging.up.railway.app/api/agent/hooks" \
      -d '${JSON.stringify({
        content: candidate.content,
        problemType: candidate.problemTypes[0], // 主要ProblemType
        source: "trend-hunter",
        metadata: {
          contentType: candidate.contentType,
          trendSource: candidate.trendSource,
          allProblemTypes: candidate.problemTypes,
          platform: candidate.platform,
          angle: candidate.angle,
        }
      })}'`);
  }
}

// 4. Slack #trends に結果サマリー
await slack.send('#trends',
  `🔍 トレンドスキャン完了\n` +
  `対象: ${targetTypes.join(', ')}\n` +
  `TikTok: ${tiktokCount}件 | Reddit: ${redditCount}件 | X: ${xCount}件\n` +
  `→ フィルタ通過: ${filteredCount}件 → 新規hook: ${savedCount}件\n` +
  `共感系: ${empathyCount} | 問題解決系: ${solutionCount}`
);
```

