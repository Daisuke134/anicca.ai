## テスト可能なコード境界（P0-1）

### アーキテクチャ原則

```
Pure Functions（決定論的・テスト容易）
    ↕ データだけやり取り
Mockable Interfaces（外部API・LLM呼び出し）
```

**純粋関数**: 同じ入力 → 常に同じ出力。副作用なし。ユニットテストのみで100%カバー。
**Mockableインターフェース**: 外部APIやLLMの呼び出し。テスト時はモックに差し替え。

### モジュール一覧

| モジュール | 種別 | 責務 | 入力 | 出力 |
|-----------|------|------|------|------|
| `queryBuilder` | Pure | ProblemType → 検索クエリ文字列を組み立て | `(problemType, contentType, lang)` | `string` |
| `rotationSelector` | Pure | 実行回数からローテーショングループを選択 | `(executionCount)` | `string[]`（ProblemType配列） |
| `twitterResponseParser` | Pure | TwitterAPI.io の生JSONを正規化 | `(rawJson, meta)` | `NormalizedTrend[]` |
| `redditResponseParser` | Pure | reddapi.dev の生JSONを正規化 | `(rawJson, meta)` | `NormalizedTrend[]` |
| `tiktokResponseParser` | Pure | Apify TikTok の生JSONを正規化 | `(rawJson)` | `NormalizedTrend[]` |
| `viralityFilter` | Pure | メトリクス閾値でフィルタ | `(trends[], thresholds)` | `NormalizedTrend[]` |
| `textSimilarity` | Pure | 2テキスト間の類似度計算（Jaccard） | `(text1, text2)` | `number`（0.0-1.0） |
| `slackFormatter` | Pure | 結果サマリーをSlackメッセージ文字列に変換 | `(results)` | `string` |
| `twitterApiClient` | Mockable | TwitterAPI.io への HTTP呼び出し | `(query, options)` | `Promise<RawTwitterResponse>` |
| `redditApiClient` | Mockable | reddapi.dev への HTTP呼び出し | `(query, options)` | `Promise<RawRedditResponse>` |
| `tiktokApiClient` | Mockable | Apify Actor 実行 + 結果取得 | `(region, options)` | `Promise<RawTikTokResponse>` |
| `llmClient` | Mockable | LLMフィルタ + hook生成 | `(prompt, data)` | `Promise<LlmResponse>` |
| `railwayApiClient` | Mockable | Railway API GET/POST hooks | `(method, data?)` | `Promise<ApiResponse>` |
| `orchestrator` | 統合 | 全モジュールを繋いで実行 | `(config)` | `Promise<ExecutionResult>` |

### 正規化データ型

```typescript
// 全ソース共通の正規化型
interface NormalizedTrend {
  id: string;                          // ソース固有ID
  source: 'x' | 'tiktok' | 'reddit' | 'github';
  problemType: string;                 // 検索時のProblemType
  contentType: 'empathy' | 'solution'; // 検索クエリの種別
  lang: 'ja' | 'en';
  text: string;                        // 本文 or ハッシュタグ名
  url: string | null;                  // 元投稿URL
  metrics: {
    engagement: number;                // ソースごとの主要指標（正規化済み）
    // X: likeCount, Reddit: upvotes, TikTok: viewCount
  };
  author: string | null;
  raw: Record<string, unknown>;        // パーサーが捨てなかった元データ
}

// LLMフィルタ出力型
interface FilteredTrend {
  trendId: string;
  relevanceScore: number;              // 0-10
  virality: 'high' | 'medium' | 'low';
  contentType: 'empathy' | 'solution';
  problemTypes: string[];
  angle: string;
  skipReason: string | null;
}

// hook候補型
interface HookCandidate {
  content: string;                     // hookテキスト（max 500 chars）
  contentType: 'empathy' | 'solution';
  problemTypes: string[];
  platform: 'x' | 'tiktok' | 'both';
  trendSource: {
    platform: string;
    url: string | null;
    hashtags: string[];
    metrics: Record<string, number>;
  };
  angle: string;
}
```

---

## テストマトリックス（P0-2）

### Pure Functions テスト

#### queryBuilder

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 1 | `test_queryBuilder_empathy_ja` | `('staying_up_late', 'empathy', 'ja')` | `'"また3時だ" OR "夜更かし やめられない"'` を含む文字列 | 日本語共感系 |
| 2 | `test_queryBuilder_solution_en` | `('staying_up_late', 'solution', 'en')` | `'"how to fix sleep schedule" OR "screen time before bed"'` を含む文字列 | 英語問題解決系 |
| 3 | `test_queryBuilder_all_problemTypes` | 13個のProblemType全て | 全てnon-emptyの文字列を返す（null/undefinedなし） | 辞書網羅 |
| 4 | `test_queryBuilder_unknown_type_throws` | `('invalid_type', 'empathy', 'ja')` | `Error` をthrow | 不正入力 |
| 5 | `test_queryBuilder_min_faves_appended` | `('anxiety', 'empathy', 'en')` に `{minFaves: 1000}` オプション | `'min_faves:1000'` が末尾に付与 | X検索オプション |

#### rotationSelector

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 6 | `test_rotation_group0` | `executionCount=0` | `['staying_up_late','cant_wake_up','self_loathing','rumination','procrastination']` | グループ0 |
| 7 | `test_rotation_group1` | `executionCount=1` | `['anxiety','lying','bad_mouthing','porn_addiction']` | グループ1 |
| 8 | `test_rotation_group2` | `executionCount=2` | `['alcohol_dependency','anger','obsessive','loneliness']` | グループ2 |
| 9 | `test_rotation_wraps` | `executionCount=3` | グループ0と同じ | 循環 |
| 10 | `test_rotation_large_number` | `executionCount=999` | グループ `999%3=0` | 大きい数 |

#### twitterResponseParser

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 11 | `test_parse_twitter_valid` | モックレスポンス（tweets配列2件） | `NormalizedTrend[]` 長さ2、source='x'、metrics.engagement=likeCount | 正常系 |
| 12 | `test_parse_twitter_empty` | `{"tweets":[],"has_next_page":false}` | 空配列 | 空レスポンス |
| 13 | `test_parse_twitter_missing_author` | author=null のtweet | `NormalizedTrend` でauthor=null、url=null | 欠損データ |
| 14 | `test_parse_twitter_malformed_json` | `"not json"` | `Error` をthrow | 不正JSON |

#### redditResponseParser

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 15 | `test_parse_reddit_valid` | モックレスポンス（results配列3件） | `NormalizedTrend[]` 長さ3、source='reddit'、metrics.engagement=upvotes | 正常系 |
| 16 | `test_parse_reddit_empty` | `{"success":true,"data":{"results":[]}}` | 空配列 | 空レスポンス |
| 17 | `test_parse_reddit_api_error` | `{"success":false,"error":"Rate limited"}` | `Error` をthrow | APIエラー |

#### tiktokResponseParser

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 18 | `test_parse_tiktok_valid` | モックレスポンス（ハッシュタグ配列2件） | `NormalizedTrend[]` 長さ2、source='tiktok'、metrics.engagement=viewCount | 正常系 |
| 19 | `test_parse_tiktok_filter_promoted` | `isPromoted: true` のハッシュタグ含む | promotedを除外 | プロモ除外 |
| 20 | `test_parse_tiktok_empty` | `[]` | 空配列 | 空レスポンス |

#### viralityFilter

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 21 | `test_filter_above_threshold` | engagement=5000, threshold=1000 | 通過（配列に含む） | 閾値以上 |
| 22 | `test_filter_below_threshold` | engagement=500, threshold=1000 | 除外（配列に含まない） | 閾値未満 |
| 23 | `test_filter_exact_threshold` | engagement=1000, threshold=1000 | 通過（>=で判定） | 境界値 |
| 24 | `test_filter_mixed` | 5件中2件が閾値以上 | 長さ2の配列 | 混在 |
| 25 | `test_filter_source_specific_thresholds` | X=1000, Reddit=100, TikTok=10000 のソース別閾値 | 各ソースの閾値で判定 | ソース別閾値 |

#### textSimilarity

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 26 | `test_similarity_identical` | `("hello world", "hello world")` | `1.0` | 完全一致 |
| 27 | `test_similarity_different` | `("hello world", "goodbye moon")` | `< 0.3` | 完全不一致 |
| 28 | `test_similarity_partial` | `("夜更かし やめたい", "夜更かし やめられない つらい")` | `0.3 < x < 0.8` | 部分一致 |
| 29 | `test_similarity_empty_string` | `("", "hello")` | `0.0` | 空文字列 |
| 30 | `test_similarity_threshold_check` | 類似度 > 0.8 のペア | `isDuplicate = true` | 重複判定閾値 |

#### slackFormatter

| # | テスト名 | 入力 | 期待出力 | カバー |
|---|---------|------|---------|--------|
| 31 | `test_format_normal` | tiktok:3, reddit:5, x:10, saved:4 | ソース別件数 + 保存件数を含むメッセージ | 正常系 |
| 32 | `test_format_all_zero` | 全ソース0件 | 「トレンド0件」を含むメッセージ | 空結果 |
| 33 | `test_format_source_failure` | reddit: error | 「Reddit: エラー」を含むメッセージ | 部分失敗 |

### Mockable Interfaces テスト（統合テスト）

| # | テスト名 | モック設定 | 期待動作 | カバー |
|---|---------|----------|---------|--------|
| 34 | `test_orchestrator_happy_path` | 全API正常レスポンス + LLM正常出力 | hook候補がRailway APIに保存される | E2Eハッピーパス |
| 35 | `test_orchestrator_twitter_down` | twitterApiClient → Error | TikTok+Redditの結果のみで続行、Slackに警告 | X障害時 |
| 36 | `test_orchestrator_all_sources_down` | 全ApiClient → Error | Slack #alertsに通知、DLQに記録、hookは0件 | 全障害 |
| 37 | `test_orchestrator_llm_fallback` | llmClient gpt-4o → Error, gpt-4o-mini → 正常 | フォールバックで正常完了 | LLMフォールバック |
| 38 | `test_orchestrator_duplicate_skip` | railwayApiClient.getHooks → 既存hookと類似度0.9 | 保存スキップ、ログに記録 | 重複チェック |
| 39 | `test_orchestrator_railway_save_fail` | railwayApiClient.saveHook → Error | DLQに書き込み、次回リトライ | 保存失敗 |
| 40 | `test_orchestrator_rotation` | executionCount=0, 1, 2 を順に実行 | 各グループの ProblemType で検索される | ローテーション |

---

