# MCP完全実装ガイド - Anicca開発での学習記録

最終更新: 2025-08-21 (タイプエラー解決、TypeScript理解深化)

## 目次
1. [基本概念](#基本概念)
2. [RealtimeAgentでのMCP実装](#realtimeagentでのmcp実装)
3. [実装方法](#実装方法)
4. [ローカルMCP vs リモートMCP](#ローカルmcp-vs-リモートmcp)
5. [重要な技術概念](#重要な技術概念)
6. [現在の実装例](#現在の実装例)
7. [今後のMCP追加手順](#今後のmcp追加手順)
8. [トラブルシューティング](#トラブルシューティング)

## 基本概念

### MCPとは
Model Context Protocol - LLMエージェントに標準化された方法でツールを提供するプロトコル

### MCP準拠の意味
MCPの標準仕様に従ったツール定義：
```json
{
  "name": "tool_name",
  "description": "ツールの説明",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param": { "type": "string" }
    }
  }
}
```
この形式に従えば、どのMCPクライアント（Claude、Cursor、Cline等）でも使える。

## RealtimeAgentでのMCP実装

### 問題の背景（GitHub Issue #353）

#### 問題点
RealtimeAgentは`mcpServers`プロパティをサポートしていない。

#### 理由（メンテナーvrtnis氏の説明）
1. **低遅延音声優先**: RealtimeAgentは音声のリアルタイム性を最優先
2. **同期的コンストラクタ**: 非同期処理を避けて即座にエージェントを作成
3. **設計思想**: 
   - 通常のAgent = "batteries-included"（全部入り）
   - RealtimeAgent = "engine piece"（最小限のエンジン）

#### 解決策
```typescript
// ❌ これはできない
new RealtimeAgent({
  mcpServers: [server]  // サポートされていない
});

// ✅ 正しい方法
const tools = await getAllMcpTools(servers);  // 事前に展開
new RealtimeAgent({
  tools: [...existingTools, ...tools]  // 展開済みツールを渡す
});
```

### なぜこの方法が良いのか
1. **エージェント作成は同期的**（高速）
2. **MCP展開は非同期的**だが事前に完了
3. **音声開始時の遅延を最小化**

## 実装方法

### 1. MCPサーバー設定ファイル（mcpServers.ts）

```typescript
import { MCPServerStdio, getAllMcpTools } from '@openai/agents';

const PROXY_URL = process.env.PROXY_URL || 'https://anicca-proxy-staging.up.railway.app';

// MCPサーバー設定を取得（APIキー等）
async function getMCPConfig() {
  const response = await fetch(`${PROXY_URL}/api/mcp/config`);
  return await response.json();
}

// MCPサーバーを初期化
export async function initializeMCPServers() {
  const config = await getMCPConfig();
  const servers = [];

  // Serena MCPサーバー（記憶管理）
  const serenaServer = new MCPServerStdio({
    name: 'Serena Memory Server',
    fullCommand: 'uvx serena-agent serena-mcp-server',
    env: {
      SERENA_PROJECT_PATH: process.env.HOME + '/.anicca'
    }
  });
  servers.push(serenaServer);

  // 各サーバーに接続
  for (const server of servers) {
    await server.connect();
  }

  return servers;
}

// MCPツールを取得
export async function getMCPTools() {
  const servers = await initializeMCPServers();
  
  // すべてのMCPツールを展開
  const allMcpTools = await getAllMcpTools({
    mcpServers: servers,
    convertSchemasToStrict: true
  });
  
  return allMcpTools;
}
```

### 2. エージェント作成時の統合

```typescript
export const createAniccaAgent = async () => {
  // MCPツールを取得
  const mcpTools = await getMCPTools();
  
  // 既存のツールとMCPツールを結合
  const combinedTools = [...allTools, ...mcpTools];
  
  return new RealtimeAgent({
    name: 'Anicca',
    instructions: ANICCA_INSTRUCTIONS,
    tools: combinedTools,
    voice: 'alloy'
  });
};
```

## ローカルMCP vs リモートMCP

### ローカルMCP（MCPServerStdio）

```typescript
const localServer = new MCPServerStdio({
  fullCommand: 'uvx serena-agent serena-mcp-server'
});
```

**動作**：
```
[Anicca] → stdin → [MCPサーバー on Mac]
         ← stdout ←
```

**メリット**：
- ✅ 低遅延（直接通信）
- ✅ オフラインでも動作
- ✅ ローカルファイルアクセス可能

**デメリット**：
- ❌ DMGに含める必要がある
- ❌ 更新時は再配布が必要

### リモートMCP（MCPServerStreamableHttp）

```typescript
const remoteServer = new MCPServerStreamableHttp({
  url: 'https://anicca-proxy.railway.app/api/mcp/serena'
});
```

**動作**：
```
[Anicca] → HTTP → [Railway] → [MCPサーバー on Railway]
         ← HTTP ←
```

**メリット**：
- ✅ サーバー側だけ更新すればOK
- ✅ 重い処理をサーバーで実行
- ✅ DMGサイズが小さい

**デメリット**：
- ❌ ネットワーク遅延
- ❌ ローカルファイルアクセス不可

### 切り替えは簡単

```typescript
// 環境変数で切り替え
const server = process.env.USE_REMOTE_MCP === 'true'
  ? new MCPServerStreamableHttp({ url: '...' })  // リモート
  : new MCPServerStdio({ fullCommand: '...' });   // ローカル

// どちらも同じように使える！
const tools = await getAllMcpTools([server]);
```

## 重要な技術概念

### 同期的 vs 非同期的

**同期的（sync）**：
```javascript
const agent = new RealtimeAgent({ name: 'Agent' });  // 即座に完了
```

**非同期的（async）**：
```javascript
await mcpServer.connect();  // ネットワーク接続で時間かかる
```

### 標準入出力通信（stdio）

Standard Input/Output - プロセス間の最も基本的な通信方法：
- **stdin**: プロセスへの入力
- **stdout**: プロセスからの出力
- ネットワーク不要で高速

### MCP展開のタイミング

```typescript
// タイムライン
// 1. アプリ起動時（事前）
const mcpTools = await getMCPTools();  // 時間かかってもOK

// 2. 音声開始時（リアルタイム）
const agent = new RealtimeAgent({
  tools: mcpTools  // 既に展開済み、即座に渡せる
});
```

## 現在の実装例

### ElevenLabs（ハイブリッド方式）

現在の実装は**API呼び出しはリモート、音声再生はローカル**：

```
[Anicca] → API呼び出し → [Railway] → [ElevenLabs API]
                              ↓
                        音声データ(base64)
                              ↓
[Anicca] ← 音声データ ← [Railway]
    ↓
ローカルで new Audio() で再生
```

**利点**：
- APIキーはRailwayで管理（セキュア）
- 音声再生はローカル（低遅延）
- DMG配布時もAPIキー不要

## 今後のMCP追加手順

### 新しいMCPを追加する場合

1. **パッケージ確認**
   ```bash
   # npmパッケージの場合
   npm search @example/mcp-server
   
   # Pythonパッケージの場合
   pip search example-mcp
   ```

2. **mcpServers.tsに追加**
   ```typescript
   const newServer = new MCPServerStdio({
     name: '新しいMCPサーバー',
     fullCommand: 'npx -y @example/mcp-server',
     env: {
       API_KEY: config.exampleApiKey  // Railwayから取得
     }
   });
   servers.push(newServer);
   ```

3. **Railwayにキー追加**（必要な場合）
   - Railway環境変数に追加
   - config APIエンドポイントを更新

4. **テスト**
   ```bash
   npm run dev
   # コンソールでツール一覧を確認
   ```

5. **DMGビルドして配布テスト**

### 重要：手動ツール定義は不要！

従来の方法（tools.tsに個別定義）：
```typescript
// ❌ もう不要！
const newTool = tool({
  name: 'tool_name',
  execute: async () => { ... }
});
```

MCP方式：
```typescript
// ✅ MCPサーバーを追加するだけ！
servers.push(newMcpServer);
// ツールは自動的に展開される
```

## トラブルシューティング

### TypeScriptエラー：'never'型の配列

**症状**:
```
Argument of type 'MCPServerStdio' is not assignable to parameter of type 'never'
```

**原因**: 配列の型宣言が欠けている

**解決策**:
```typescript
// ❌ エラーになる
const servers = [];
servers.push(new MCPServerStdio(...));  // never[]にpushできない

// ✅ 正しい
const servers: MCPServerStdio[] = [];
servers.push(new MCPServerStdio(...));
```

### getAllMcpToolsの型について

**重要**: 戻り値は`Tool[]`（`FunctionTool[]`ではない）
```typescript
import type { Tool } from '@openai/agents';

export async function getMCPTools(): Promise<Tool[]> {
  const allMcpTools = await getAllMcpTools(servers);
  return allMcpTools;  // Tool[]型
}
```

### パッケージ構造の理解

OpenAI Agents JSのパッケージ構造：
```
@openai/agents (v0.0.16)
├─ @openai/agents-core
│   ├─ MCPServerStdio
│   ├─ getAllMcpTools
│   └─ Tool型定義
├─ @openai/agents-openai
└─ @openai/agents-realtime
    └─ RealtimeAgent
```

インポートは`@openai/agents`から行うが、実体は各サブパッケージにある。

### MCPサーバーが起動しない
1. fullCommandが正しいか確認
2. 必要なパッケージがインストールされているか
3. 環境変数が設定されているか

### ツールが認識されない
1. `console.log(allMcpTools)`でツール一覧を確認
2. サーバーの`connect()`が成功しているか
3. MCPサーバーのログを確認

### DMGで動作しない
1. ローカルMCPを使用しているか確認
2. APIキーがRailwayから取得できているか
3. Electronのサンドボックス設定を確認

## まとめ

### なぜこの方式か
1. **セキュリティ**: APIキーは全てRailway管理
2. **拡張性**: MCPサーバーを追加するだけ
3. **保守性**: 手動ツール定義が不要
4. **互換性**: Issue #353の制約を回避
5. **配布**: DMGで誰でもすぐ使える

### 学んだこと
- RealtimeAgentの制約を理解して回避
- MCPの標準化の威力を活用
- ローカル/リモートの適材適所
- セキュアな配布方法の実現
- **TypeScript型宣言の重要性**：配列は明示的に型指定が必要
- **パッケージ構造の理解**：re-exportの仕組みと実体の場所
- **想像でコードを書かないことの絶対重要性**

### 次のステップ
1. ✅ Serena MCPの実装完了
2. 他の有用なMCPサーバーの調査（ElevenLabsなど）
3. リモートMCP対応の準備（将来）

---
*このドキュメントは実装時の重要な学習内容をまとめたものです。*
*今後のMCP追加時はこのガイドを参照してください。*