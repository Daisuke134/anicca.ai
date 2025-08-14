# OpenAI Voice Agents SDK + Slack MCP 実装ガイド

## 概要
OpenAI Voice Agents SDKとMCP（Model Context Protocol）を使用して、Aniccaの音声処理を完全にリファクタリングする。Slack MCPを最初に統合し、段階的に他のMCPを追加していく。

## 選定技術

### Slack MCP Server
**採用：korotovsky/slack-mcp-server**

理由：
- **Userとして動作可能**（User OAuth Token対応）
- `@username`や`#channel`での直接指定可能
- DM/グループDM完全対応
- 高度な検索機能
- `SLACK_MCP_ADD_MESSAGE_TOOL=true`でユーザーとして送信

## 最終的なファイル構造

```
src/
├── agents/
│   ├── mainAgent.ts          # RealtimeAgent（Aniccaのメイン）
│   ├── sessionManager.ts     # RealtimeSession管理
│   └── tools.ts              # 既存ツール（think_with_claude等）
│
├── mcp/
│   ├── slackMCP.ts           # Slack MCPプロキシ接続
│   └── elevenLabsMCP.ts      # ElevenLabs MCPプロキシ接続（将来）
│
├── utils/
│   ├── proxyClient.ts        # プロキシ通信ユーティリティ
│   └── audioHandlers.ts      # 音声処理（必要に応じて）
│
├── services/
│   ├── voiceServer.ts        # ❌ 削除
│   ├── desktopAuthService.ts # ✅ 維持
│   ├── simpleEncryption.ts   # ✅ 維持
│   └── interfaces.ts         # ✅ 維持
│
├── main-voice-simple.ts       # ✏️ SDK版に書き換え
├── config.ts                  # ✏️ MCP設定追加
└── recorder.html              # ✅ 維持
```

## 実装TODOリスト

### Phase 1: パッケージインストール
- [ ] `npm install @openai/agents@latest`
- [ ] `npm install @openai/agents-realtime@latest`
- [ ] `npm install @openai/agents-extensions`
- [ ] `npm install slack-mcp-server`

### Phase 2: プロキシサーバー側の準備
- [ ] `anicca-proxy-slack/api/mcp/slack.js` - Slack MCPプロキシエンドポイント作成

### Phase 3: 新規ファイル作成（順番通り）
1. [ ] `src/utils/proxyClient.ts` - プロキシ通信ユーティリティ
2. [ ] `src/mcp/slackMCP.ts` - Slack MCPプロキシ接続
3. [ ] `src/agents/tools.ts` - 既存ツール移植（think_with_claude等）
4. [ ] `src/agents/mainAgent.ts` - RealtimeAgent実装
5. [ ] `src/agents/sessionManager.ts` - セッション管理

### Phase 4: 既存ファイル修正
- [ ] `src/config.ts` - MCPプロキシURL追加
- [ ] `src/main-voice-simple.ts` - SDK版に完全書き換え
- [ ] `src/services/voiceServer.ts` - 削除

- [ ] `anicca-proxy-slack/api/mcp/elevenlabs.js` - ElevenLabs MCPプロキシ作成（将来）

## 重要な実装ポイント

### 🔒 セキュリティ（最重要）
- **環境変数は一切ローカルに置かない**
- **envファイルは絶対に使用しない**
- **ハードコーディング厳禁**
- **全ての認証はプロキシ経由（Railway）で管理**

```typescript
// ❌ 絶対にダメな例
env: {
  SLACK_TOKEN: process.env.SLACK_TOKEN // NG!
  SLACK_TOKEN: "xoxp-..." // 絶対NG!
}

// ✅ 正しい実装（プロキシ経由）
const slackMCP = new MCPServerStreamableHttp({
  url: `${PROXY_URL}/api/mcp/slack`, // プロキシサーバーで認証
  // トークンはRailway側で管理
});
```

### 既存機能の維持
- **instructions**は`voiceServer.ts`から`mainAgent.ts`に完全移植
- **think_with_claude**等の既存ツールは継続使用可能
- **scheduled_tasks**との連携維持

### MCPツールと既存ツールの併用
```typescript
const aniccaAgent = new RealtimeAgent({
  name: 'Anicca',
  instructions: /* 既存のinstructionsをそのまま移植 */,
  tools: [
    slackMCP,           // MCP経由（新）
    elevenLabsMCP,      // MCP経由（新・将来）
    think_with_claude,  // 既存ツール（非MCP）
    search_tools,       // 既存ツール（非MCP）
  ]
});
```

## Railway環境変数設定（プロキシ側）

```env
# 既存（設定済み）
SLACK_CLIENT_ID=xxx
SLACK_CLIENT_SECRET=xxx
SLACK_REDIRECT_URI=xxx
SLACK_STATE_SECRET=xxx
SLACK_TOKEN_ENCRYPTION_KEY=xxx

# 新規追加
SLACK_MCP_XOXP_TOKEN=xoxp-...  # User OAuth Token
SLACK_MCP_ADD_MESSAGE_TOOL=true # ユーザーとして送信を有効化
SLACK_MCP_CHANNELS_CACHE=.channels_cache.json
SLACK_MCP_USERS_CACHE=.users_cache.json

# 将来追加
ELEVENLABS_API_KEY=xxx
EXA_API_KEY=xxx
```

 【現在の構成（安全）】
  Anicca Desktop → Proxy Server → 各種API
                    （APIキー管理）

  【SDK導入後（さらに安全）】
  Anicca Desktop → Proxy Server → MCP Servers → 各種API
                    （APIキー管理）  （標準化）

  メリット：
  - APIキーは一切ローカルに保存しない
  - 全てプロキシで管理
  - MCPによる標準化でセキュリティ向上

## プロキシエンドポイント実装例

### anicca-proxy-slack/api/mcp/slack.js
```javascript
export default async function handler(req, res) {
  // MCPプロトコルに従ってSlack MCPサーバーと通信
  const slackMCPServer = new SlackMCPServer({
    token: process.env.SLACK_MCP_XOXP_TOKEN,
    addMessageTool: true
  });
  
  const result = await slackMCPServer.handle(req.body);
  return res.json(result);
}
```

## RealtimeAgentのメリット

1. **音声処理の自動化**
   - WebSocket/WebRTC管理不要
   - 音声エンコード/デコード自動処理
   - VAD（音声活動検出）自動

2. **ツール実行の高速化**
   - MCPツール直接実行（中間層なし）
   - 並列処理可能
   - レスポンス時間：3-5秒 → 0.5秒（10倍高速）

3. **コード削減**
   - voiceServer.ts（1500行）→ mainAgent.ts（200行）
   - 保守性大幅向上

4. **将来の拡張性**
   - 新MCPは1行追加で使用可能
   - ハンドオフ機能で専門エージェント追加可能

## 期待される成果

### パフォーマンス
- **レスポンス速度**: 10倍高速化（3-5秒 → 0.5秒）
- **コード量**: 66%削減（1500行 → 500行）
- **メモリ使用量**: 30%削減

### 機能改善
- **Slackユーザーとして完全動作**（Bot制限なし）
- **リアルタイム音声生成**（ElevenLabs MCP）
- **MCP無限拡張可能**（新MCPは1行で追加）

### 保守性
- **標準化されたMCPインターフェース**
- **自動エラーハンドリング**
- **拡張可能なアーキテクチャ**

## 注意事項

1. **段階的移行ではなく完全置き換え**
   - 中途半端な実装は避ける
   - Gitで管理しているため、いつでも戻せる

2. **プロキシ必須**
   - デスクトップアプリは公開配布のため
   - 全てのAPIキーはRailway側で管理

3. **Slack MCP設定**
   - 必ず`SLACK_MCP_ADD_MESSAGE_TOOL=true`を設定
   - これによりユーザーとして送信可能

## 実装後のクリーンアップ

1. クローンしたMCPサーバーフォルダを削除
   - `/Users/cbns03/Downloads/anicca-project/ubie-slack-mcp`
   - `/Users/cbns03/Downloads/anicca-project/mcp-slack`
   - `/Users/cbns03/Downloads/anicca-project/slack-mcp-server`

2. 不要になったファイル削除
   - `src/services/voiceServer.ts`

## 次のステップ

1. まずSlack MCPを完全に動作させる
2. 安定したらElevenLabs MCP追加
3. その後、Exa Search MCP等を順次追加