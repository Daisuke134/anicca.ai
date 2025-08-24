# Composio MCP Integration Guide

## Composioとは

**Composioの役割**：
- Google Calendar、Slack、GitHub等のAPIへの認証を管理するプラットフォーム
- 各サービスのMCPサーバーをクラウドでホスト
- ユーザーごとにMCPサーバーURLを生成・管理
- OAuth認証の一元管理とトークンの自動更新

**重要**: ComposioはMCPサーバーを**提供・管理**するプラットフォームであり、MCPプロトコルそのものではない。

## MCPサーバーの作成と管理

### 1. MCPサーバーの作成

```typescript
// 正しいComposio MCPサーバーの作成方法
const mcpServer = await composio.mcp.create(
  "Google Calendar Server",  // サーバー名
  [
    {
      authConfigId: "ac_xxx",  // platform.composio.devで作成したAuth Config ID
      allowedTools: [
        "GOOGLECALENDAR_CREATE_EVENT",
        "GOOGLECALENDAR_LIST_EVENTS", 
        "GOOGLECALENDAR_UPDATE_EVENT"
      ]
    }
  ],
  { 
    isChatAuth: true  // チャット認証を有効化
  }
);
```

### 2. ユーザーごとのMCPサーバーURL取得

```typescript
// ✅ 正しい方法（2引数のみ）
const serverUrls = await composio.mcp.getServer(
  mcpServerId,  // MCPサーバーID
  userId        // ユーザーID
);

// ❌ 間違った方法（第3引数は存在しない）
const serverUrls = await composio.mcp.getServer(
  mcpServerId,
  userId,
  { isChatAuth: true }  // この第3引数はエラーになる
);
```

## 認証フローと管理

### 1. 初回認証フロー

```typescript
// 1. ユーザーの接続状態を確認
const connectionStatus = await composio.mcp.getUserConnectionStatus(
  userId,
  mcpServerId
);

if (!connectionStatus.connected) {
  // 2. 認証URLを生成
  const authRequest = await composio.mcp.authorize(
    userId,
    mcpServerId,
    'googlecalendar'
  );
  
  // 3. ユーザーをブラウザに誘導
  shell.openExternal(authRequest.redirectUrl);
}

// 4. 認証完了後、サーバーURLを取得
const serverUrls = await composio.mcp.getServer(mcpServerId, userId);
```

### 2. 音声エージェント用のツール定義

```typescript
const connectGoogleCalendarTool = tool({
  name: 'connect_google_calendar',
  description: 'Google Calendarを連携する',
  parameters: z.object({}),
  execute: async () => {
    const status = await composio.mcp.getUserConnectionStatus(
      MCP_SERVER_ID,
      sessionManager.getCurrentUserId()
    );
    
    if (!status.connected) {
      const authRequest = await composio.mcp.authorize(
        sessionManager.getCurrentUserId(),
        MCP_SERVER_ID,
        'googlecalendar'
      );
      
      await shell.openExternal(authRequest.redirectUrl);
      return "ブラウザでGoogleアカウントにログインしてください。";
    }
    
    return "Google Calendarは既に接続されています。";
  }
});
```

## OpenAI Agents SDKとの連携

### 1. MCPServerSSEの正しい使用方法

```typescript
// ComposioからURLを取得後、OpenAI Agents SDKのMCPServerSSEを使用
const serverUrls = await composio.mcp.getServer(mcpServerId, userId);

// URLからMCPServerSSEインスタンスを作成
const mcpServers = Object.entries(serverUrls).map(([key, value]) => {
  return new MCPServerSSE({
    url: value.url || value,
    name: key,
    cacheToolsList: true
  });
});

// RealtimeAgentにツールを渡す
const tools = await getAllMcpTools(mcpServers);
const agent = new RealtimeAgent({
  name: 'Anicca',
  instructions: INSTRUCTIONS,
  tools: [...existingTools, ...tools]
});
```

### 2. RealtimeAgentでの事前ツール展開

```typescript
// ❌ これはサポートされていない
new RealtimeAgent({
  mcpServers: [server]
});

// ✅ 正しい方法（事前展開）
const tools = await getAllMcpTools(servers);
new RealtimeAgent({
  tools: [...existingTools, ...tools]
});
```

## 重要なComposio APIメソッド

### mcp.create()
```typescript
composio.mcp.create(
  name: string,
  serverConfig: Array<{
    authConfigId: string,
    allowedTools: string[]
  }>,
  options?: { isChatAuth?: boolean }
): Promise<McpServer>
```

### mcp.getServer()
```typescript
composio.mcp.getServer(
  serverId: string,
  userId: string
): Promise<ServerUrls>
```

### mcp.getUserConnectionStatus()
```typescript
composio.mcp.getUserConnectionStatus(
  userId: string,
  serverId: string
): Promise<{
  connected: boolean,
  connectedToolkits: Record<string, {
    connected: boolean,
    toolkit: string,
    connectedAccountId?: string
  }>
}>
```

### mcp.authorize()
```typescript
composio.mcp.authorize(
  userId: string,
  serverId: string,
  toolkitName: string
): Promise<{
  redirectUrl?: string
}>
```

## セキュリティとデプロイ

### 1. 環境変数の管理

```bash
# Railway/Vercelの環境変数
COMPOSIO_API_KEY=xxx
MCP_GOOGLE_CALENDAR_ID=xxx
GOOGLE_CALENDAR_AUTH_CONFIG_ID=ac_xxx
```

### 2. ユーザーID管理

```typescript
// ❌ ハードコードは絶対禁止
const userId = '9f126de1-8f37-4635-bd33-b9e1fff262c1';

// ✅ セッションから動的に取得
const userId = sessionManager.getCurrentUserId();
```

## よくある間違いと解決方法

### 1. getServerの第3引数エラー
```typescript
// ❌ 間違い - 第3引数は存在しない
await composio.mcp.getServer(id, userId, options);

// ✅ 正解 - 2引数のみ
await composio.mcp.getServer(id, userId);
```

### 2. MCPServerSSEの誤用
```typescript
// ❌ 間違い - ComposioのURLに対してMCPServerSSEを直接使用
const server = new MCPServerSSE({ url: composioUrl });

// ✅ 正解 - getAllMcpToolsに渡す時のみ使用
const tools = await getAllMcpTools([mcpServerInstance]);
```

### 3. ユーザーIDのハードコード
```typescript
// ❌ 間違い - 特定ユーザーのIDをハードコード
const userId = 'specific-user-id';

// ✅ 正解 - セッションから動的に取得
const userId = authService.getCurrentUserId() || sessionManager.getCurrentUserId();
```

## 今後のMCP拡張

### 複数MCPサービスの管理
```typescript
const mcpServices = {
  googleCalendar: {
    serverId: process.env.MCP_GOOGLE_CALENDAR_ID,
    authConfigId: process.env.GOOGLE_CALENDAR_AUTH_CONFIG_ID
  },
  slack: {
    serverId: process.env.MCP_SLACK_ID,
    authConfigId: process.env.SLACK_AUTH_CONFIG_ID
  },
  github: {
    serverId: process.env.MCP_GITHUB_ID,
    authConfigId: process.env.GITHUB_AUTH_CONFIG_ID
  }
};

// ユーザーごとに有効なサービスを管理
async function getUserEnabledMCPs(userId: string): Promise<Tool[]> {
  const allTools = [];
  
  for (const [service, config] of Object.entries(mcpServices)) {
    const status = await composio.mcp.getUserConnectionStatus(
      userId,
      config.serverId
    );
    
    if (status.connected) {
      const serverUrls = await composio.mcp.getServer(
        config.serverId,
        userId
      );
      const tools = await getAllMcpTools(serverUrls);
      allTools.push(...tools);
    }
  }
  
  return allTools;
}
```

## デバッグとトラブルシューティング

### 1. 接続状態の確認
```typescript
// ユーザーの全MCP接続状態を確認
const status = await composio.mcp.getUserConnectionStatus(userId, serverId);
console.log('Overall connection:', status.connected);
console.log('Toolkit connections:', status.connectedToolkits);
```

### 2. エラーハンドリング
```typescript
try {
  const serverUrls = await composio.mcp.getServer(serverId, userId);
} catch (error) {
  if (error.message.includes('User not found')) {
    // ユーザー認証が必要
    return await initiateOAuthFlow(userId, serverId);
  }
  throw error;
}
```

### 3. 音声エージェントの初期化失敗
- MCPツール取得でエラーが発生するとRealtimeAgent全体が無効化される
- 必ずtry-catchでエラーハンドリングを行う
- fallbackツールセットを用意しておく

## まとめ

- **Composio**: MCPサーバーをホスト・管理するプラットフォーム
- **MCP**: AI AgentとToolを繋ぐプロトコル
- **OpenAI Agents SDK**: MCPプロトコルをサポートするAIエージェントフレームワーク
- **認証**: Composioが一元管理、初回のみブラウザでOAuth
- **デプロイ**: 環境変数でセキュア管理、ユーザーIDは動的取得必須