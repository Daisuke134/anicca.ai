# OpenAI Agents SDK RealtimeAgent 導入ガイド

## 概要
OpenAI Agents SDKは2025年3月にリリースされた新しいエージェント構築フレームワーク。
RealtimeAgentは音声エージェント専用のコンポーネント。

## 主要機能

### 1. RealtimeAgent
- リアルタイム音声対話のためのエージェント
- WebSocket/WebRTC経由で動作
- 音声処理の自動化

### 2. MCP（Model Context Protocol）統合
**重要**: MCPツールを自動的に統合可能
```javascript
const agent = new RealtimeAgent({
  name: 'MCP-enabled Agent',
  mcp_servers: ['filesystem', 'slack', 'browser']
});
```

### 3. 基本実装
```javascript
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';

const agent = new RealtimeAgent({
  name: 'Voice Assistant',
  instructions: 'You are a helpful assistant',
  tools: [tool1, tool2],
  voice: {
    model: 'gpt-4o-realtime-preview-2025-06-03',
    speed: 1.0  // 話速調整
  }
});

const session = new RealtimeSession(agent);
await session.connect({ apiKey });
```

## Aniccaへの適用

### 現在の実装との違い
| 現在（voiceServer.ts） | RealtimeAgent |
|---------------------|--------------|
| WebSocket手動管理 | 自動管理 |
| ツール手動登録 | MCPで自動統合 |
| イベント手動処理 | 抽象化 |
| 約1500行のコード | 約500行に削減可能 |

### メリット
1. **MCPツール自動統合**: filesystem、Slack、browser制御など
2. **コード削減**: 現在の実装の約1/3
3. **保守性向上**: OpenAI直接メンテナンス
4. **新機能自動取得**: SDKアップデートで新機能

### 導入で可能になること
- AniccaがMCPツールを直接使える
- ファイルシステム操作
- Slack連携
- ブラウザ制御
- 他のMCPサーバーとの統合

## 段階的導入計画

### Phase 1: 調査・検証（1週間）
- POC作成
- 互換性確認
- パフォーマンステスト

### Phase 2: 部分導入（2週間）
- 新機能をRealtimeAgentで実装
- 既存機能と並行稼働
- A/Bテスト

### Phase 3: 完全移行（1ヶ月）
- 全機能移行
- MCPツール完全統合
- 旧コード削除

## 実装例（Anicca完全版）
```javascript
import { RealtimeAgent, RealtimeSession } from '@openai/agents-realtime';
import { loadMCPServers } from '@openai/agents-mcp';

// MCPツール読み込み
const mcpTools = await loadMCPServers([
  'filesystem',  // read_file, write_file
  'slack',       // Slack連携
  'browser'      // ブラウザ制御
]);

// Aniccaエージェント作成
const aniccaAgent = new RealtimeAgent({
  name: 'Anicca',
  instructions: `
    あなたはAniccaです。
    起床・就寝タスクを管理し、
    ユーザーの行動変容を促すエージェントです。
    scheduled_tasks.jsonを確認して、
    確実にユーザーを起こす/寝かせることが使命です。
  `,
  tools: [...mcpTools, customTools],
  mcp_servers: ['filesystem', 'slack'],
  voice: {
    model: 'gpt-4o-realtime-preview-2025-06-03',
    voice: 'shimmer',
    speed: 1.0
  }
});

// セッション管理
const session = new RealtimeSession(aniccaAgent);
await session.connect();

// 起床タスク反応検出
session.on('user_speech', async (audio) => {
  if (currentScheduledTask) {
    console.log('ユーザー反応検出');
    completeTask(currentScheduledTask);
  }
});
```

## 注意事項
- 現在はブラウザ向け最適化
- npm install @openai/agents-realtime
- zod@3.25.67以下が必要
- MCPサーバーは別途設定必要

## 参考リンク
- https://github.com/openai/openai-agents-js
- https://openai.github.io/openai-agents-js/
- MCP統合: lastmile-ai/openai-agents-mcp