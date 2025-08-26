# Composio MCP 正しい実装方法 - 公式ドキュメント準拠

最終更新: 2025-08-25

## 🚨 重要な警告事項

### ❌ 絶対に使ってはいけないもの
- **MCPServerSSE** - **非推奨！音声処理をブロックする！**
- SSEエンドポイント（`/sse`）
- `transport=sse`パラメータ
- UI上のMCP Configs（これは間違い）

### ✅ 正しい方法
- **MCPServerStreamableHttp**を使用
- **OpenAIProvider**を使用
- **Auth ConfigsはComposio Dashboardで作成**
- **getAllMcpTools**で事前展開

---

## 1. Composio SDK の正しい初期化

```typescript
import { Composio } from '@composio/core';
import { OpenAIProvider } from '@composio/openai';

// ✅ 正しい初期化方法
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new OpenAIProvider(),  // OpenAIProviderが必須！
});
```

## 2. MCP サーバーの作成

```typescript
// ✅ 正しいMCPサーバー作成
const mcpConfig = await composio.mcp.create(
  "Google Calendar Server",  // サーバー名
  [
    {
      authConfigId: "ac_xxx",  // Dashboardで作成したAuth Config ID
      allowedTools: [
        "GOOGLECALENDAR_LIST_EVENTS",
        "GOOGLECALENDAR_CREATE_EVENT",
        "GOOGLECALENDAR_DELETE_EVENT"
      ]
    }
  ],
  {
    isChatAuth: true  // チャット認証を有効化
  }
);
```

### Auth Config IDについて
- **作成場所**: platform.composio.dev のDashboard
- **形式**: `ac_xxx`（ac_で始まる）
- **役割**: APIスコープと権限を定義

## 3. ユーザー認証の確認と処理

```typescript
// 接続状態を確認
const connectionStatus = await composio.mcp.getUserConnectionStatus(
  userId,
  mcpConfig.id
);

if (!connectionStatus.connected) {
  // 認証が必要な場合
  const authRequest = await composio.mcp.authorize(
    userId,
    mcpConfig.id,
    "google-calendar"  // toolkit名
  );
  
  if (authRequest.redirectUrl) {
    // ブラウザで認証ページを開く
    shell.openExternal(authRequest.redirectUrl);
  }
}
```

## 4. サーバーURLの取得

```typescript
// ✅ 正しいURL取得方法
const serverUrls = await composio.mcp.getServer(
  mcpConfig.id,
  userId
);

// serverUrlsは配列で返される
// [{url: "https://mcp.composio.dev/...", name: "...", toolkit: "..."}]
```

## 5. RealtimeAgent での統合方法

### 重要：RealtimeAgentの制約
- **mcpServersプロパティをサポートしていない**
- **理由**: 音声のリアルタイム性を優先、同期的コンストラクタ

### 正しい実装方法

```typescript
import { MCPServerStreamableHttp, getAllMcpTools } from '@openai/agents';
import { RealtimeAgent } from '@openai/agents/realtime';

// 1. MCPサーバーに接続
const mcpServer = new MCPServerStreamableHttp({
  url: serverUrls[0].url,  // Composioから取得したURL
  name: 'Composio Google Calendar'
});

await mcpServer.connect();

// 2. ツールを事前に展開（重要！）
const mcpTools = await getAllMcpTools([mcpServer]);

// 3. RealtimeAgentに展開済みツールを渡す
const agent = new RealtimeAgent({
  name: 'Anicca',
  instructions: '...',
  tools: [...existingTools, ...mcpTools],  // 展開済みツール
  voice: 'alloy'
});
```

## 6. 既存サーバーの管理

```typescript
// 名前でサーバーを検索
const existingServer = await composio.mcp.getByName("Google Calendar Server");

// 接続状態の確認
const status = await composio.mcp.getUserConnectionStatus(
  userId,
  existingServer.id
);

// URLの再取得
const urls = await composio.mcp.getServer(
  existingServer.id,
  userId
);
```

## 7. ベストプラクティス

### ✅ やるべきこと
1. **接続状態を必ず確認**してからMCPサーバーを使用
2. **認証フローを適切に処理**（リダイレクトURL提供）
3. **意味のあるサーバー名**を使用
4. **必要なツールのみ**に制限
5. **サーバー設定をキャッシュ**してAPI呼び出しを削減

### ❌ やってはいけないこと
1. **MCPServerSSEを使用**（音声処理をブロック）
2. **mcpServersプロパティをRealtimeAgentで使用**（サポートされていない）
3. **手動でツール定義**（MCPの意味がない）
4. **Auth Configをコードでハードコーディング**

## 8. 音声トリガーでの認証フロー

1. ユーザー：「カレンダー繋いで」
2. Aniccaが認証状態を確認
3. 未認証の場合：
   - 認証URLを生成
   - `shell.openExternal()`でブラウザを開く
   - 「Google Calendar認証ページを開きました」と応答
4. ユーザーがブラウザで認証完了
5. 次回から自動的に使用可能

## 9. 環境変数の設定（Railway）

```env
COMPOSIO_API_KEY=xxx
GOOGLE_CALENDAR_AUTH_CONFIG_ID=ac_xxx  # Dashboardで作成
```

## まとめ

### 正しい実装のキーポイント
1. **OpenAIProviderを使用**（Composio SDK初期化時）
2. **Auth ConfigはDashboardで作成**（UIでac_xxxを取得）
3. **MCPServerStreamableHttpを使用**（SSEは非推奨）
4. **getAllMcpToolsで事前展開**（RealtimeAgentの制約回避）
5. **接続状態を必ず確認**（getUserConnectionStatus）

### なぜこの方法なのか
- **音声処理をブロックしない**（SSEの問題を回避）
- **RealtimeAgentの制約に対応**（事前展開で同期的作成）
- **セキュアな認証**（Composio管理のOAuth）
- **標準的なMCPプロトコル準拠**（互換性確保）

---

**重要**: この実装方法は公式ドキュメントに基づいた正しい方法です。
SSEやmcpServersプロパティの直接使用など、間違った実装は絶対に避けてください。