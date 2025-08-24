# OpenAI Voice Agents SDK完全移行計画

## 現在の状況

### ❌ 現在はレガシー版で動作中
```
npm run voice:simple → 完全にvoiceServer.tsベースで動作
sessionManager.ts → 初期化のみで未使用（実質的に無意味）
MCP → 使用不可（レガシー版では対応不可能）
```

## 🌳 システムフローの比較（ツリー構造）

### 📦 現在のレガシーシステムフロー

```
🚀 npm run voice:simple
  │
  ├─ 📱 main-voice-simple.ts
  │   ├─ voiceServer起動（3838ポート）
  │   ├─ SessionManager初期化（※使われない）
  │   └─ hiddenWindow作成
  │
  ├─ 🖥️ voiceServer.ts（1650行の巨大ファイル）
  │   ├─ Expressサーバー
  │   │   ├─ /session → プロキシからAPIキー取得
  │   │   ├─ /tools/:toolName → switch文で処理
  │   │   └─ /auth/callback → OAuth処理
  │   │
  │   ├─ WebSocketサーバー
  │   └─ ツール実行（巨大なswitch文）
  │       ├─ case 'slack_list_channels': → tools.slack_list_channels()
  │       ├─ case 'think_with_claude': → tools.think_with_claude()
  │       └─ ... 15個のcase文
  │
  └─ 🌐 hiddenWindow（ブラウザ）
      ├─ WebRTC接続 → OpenAI Realtime API
      ├─ マイク入力
      └─ ツール実行時
          └─ HTTP POST → /tools/slack_list_channels
              └─ voiceServerが仲介 → tools.ts実行
```

### ✨ SDK移行後のシステムフロー

```
🚀 npm run voice:simple
  │
  ├─ 📱 main-voice-simple.ts
  │   ├─ SessionManager初期化 ✅
  │   ├─ SessionManager.startBridge(3838) ✅
  │   └─ hiddenWindow作成（変更なし）
  │
  ├─ 🎯 SessionManager.ts（SDKベース）
  │   ├─ RealtimeAgent（tools配列を自動登録）
  │   │   └─ tools: [...allTools, ...mcpTools]
  │   │
  │   ├─ RealtimeSession
  │   │   ├─ on('agent_tool_start') → 自動実行
  │   │   └─ on('agent_tool_end') → 完了通知
  │   │
  │   ├─ Bridgeサーバー（互換性維持）
  │   │   ├─ /session → そのまま（hiddenWindow用）
  │   │   ├─ /tools/:toolName → SDK経由で実行
  │   │   └─ /auth/callback → そのまま
  │   │
  │   └─ WebSocketサーバー（通知用）
  │
  └─ 🌐 hiddenWindow（変更なし）
      ├─ WebRTC接続 → OpenAI Realtime API
      ├─ マイク入力
      └─ ツール実行時
          ├─ 
          └─ 方法2: OpenAI API → agent_tool_start（SDK自動）
```

## 🔄 ツール実行フローの違い

### ❌ レガシー版のツール実行
```
ユーザー: "Slackのチャンネル一覧を見せて"
    ↓
1. OpenAI Realtime API判断
    ↓
2. hiddenWindow（dataChannel.onmessage）
    ↓
3. handleFunctionCall()
    ↓
4. HTTP POST /tools/slack_list_channels
    ↓
5. voiceServer.ts（908行目）
    ↓
6. switch (toolName) { case 'slack_list_channels': ...（1198行目）
    ↓
7. tools.slack_list_channels.execute()
    ↓
8. 結果をhiddenWindowに返す
```

### ✅ SDK版のツール実行
```
ユーザー: "Slackのチャンネル一覧を見せて"
    ↓
1. OpenAI Realtime API判断
    ↓
2. RealtimeSession
    ↓
3. agent_tool_start イベント発火
    ↓
4. SDK自動実行（tools配列から自動選択）
    ↓
5. tools.slack_list_channels.execute()
    ↓
6. 結果を自動返却
```

## 📊 メリットの可視化

```
            レガシー版          SDK版
─────────────────────────────────────
コード量      1650行      →    500行
ツール追加    50行追加    →    1行追加
エラー処理    手動実装    →    SDK自動
MCP対応       不可能      →    簡単追加
レスポンス    3-5秒      →    0.5秒
保守性        困難        →    簡単
```

# OpenAI Voice Agents SDK完全移行計画 - 2025/01/16更新

## 🎯 TDD実装進捗状況

### ✅ 完了済み
- **音声修正**: voice設定をash→alloyに変更
- **テスト環境**: Vitest導入・設定完了
- **TDD-RED-1**: 基本テスト作成完了（2テスト失敗を確認）

### 🔍 TDD-RED-1で判明した重要な発見

#### ✅ 成功した要素
1. **RealtimeAgentは14個のツールを正常に登録**
2. **SessionManagerでツール付きエージェント作成成功**
3. **voice: 'alloy'設定が正常に反映**
4. **executeToolDirectlyメソッド未実装を確認（期待通り）**

#### ❌ 失敗した要素（次のGREENで修正）
1. **SDKツール構造変換**: SDK内部でツール構造が変化する
   - executeプロパティ → invokeプロパティに変換される
2. **ツール実行メソッド**: tool()関数でexecute→invokeに自動変換

### 📋 現在のTODOリスト状況

```
✅ 【即修正】音声をash→alloyに変更
✅ 【TDD準備】テスト環境セットアップ
✅ 【TDD-RED-1】基本テスト作成：SDKにツールが登録されているか確認

🔄 【TDD-GREEN-1】基本実装：createAniccaAgentでツール登録確認
   → SDKツール構造変換の対応が必要

⏳ 【TDD-RED-2】slack_list_channelsのSDK自動実行テスト作成
⏳ 【TDD-GREEN-2】agent_tool_startイベントでslack_list_channels実行
⏳ 【TDD-RED-3】音声入力（PCM16）がSDKに届くテスト作成
⏳ 【TDD-GREEN-3】hiddenWindowからSDKへの音声送信実装
⏳ 【TDD-RED-4】SDKからの音声応答テスト作成
⏳ 【TDD-GREEN-4】SDKからの音声応答をhiddenWindowで再生
⏳ 【TDD-REFACTOR】レガシーコード削除・整理
⏳ 【統合テスト】実際に音声コマンドでSlack操作できるか確認
⏳ 【拡張】他のツール（search_exa等）も同様にTDDで実装
⏳ 【ドキュメント】仕様書生成（テストから逆生成）
```

## 🚧 現在の技術的課題

### 1. SDKツール構造変換問題（解決済み）
```typescript
// 元の構造（tools.ts）
export const slack_list_channels = tool({
  name: 'slack_list_channels',
  description: 'List all Slack channels',
  parameters: z.object({}),
  execute: async () => {...}  // ← これが
});

// SDK変換後の構造
{
  name: 'slack_list_channels',
  description: 'List all Slack channels',
  parameters: z.object({}),
  invoke: async () => {...}   // ← invokeに変換される
}
```

### 2. 音声経路の統合
- **現状**: hiddenWindow → WebRTC → OpenAI（独自実装）
- **目標**: hiddenWindow → SDK → OpenAI（統一経路）

### 3. ツール実行経路の一本化
- **レガシー**: HTTP POST /tools/:toolName（削除予定）
- **SDK**: agent_tool_startイベント（実装中）

## 🌳 システムフロー現状

### 📦 現在の実装状況

```
🚀 npm run voice:simple
  │
  ├─ 📱 main-voice-simple.ts
  │   ├─ ✅ SessionManager初期化済み
  │   ├─ ✅ SessionManager.startBridge(3838)動作中
  │   └─ 🟡 hiddenWindow（SDK未統合）
  │
  ├─ 🎯 SessionManager.ts（部分実装）
  │   ├─ ✅ RealtimeAgent（14ツール登録済み）
  │   ├─ 🟡 RealtimeSession（ツール実行未統合）
  │   ├─ ✅ Bridgeサーバー（/session, /auth動作中）
  │   └─ ✅ WebSocketサーバー（通知用）
  │
  └─ 🌐 hiddenWindow（レガシー）
      ├─ 🔴 WebRTC接続（独自実装）
      ├─ 🔴 マイク入力（PCM16未対応）
      └─ 🔴 ツール実行（HTTP POST経路）
```

## 🔄 次の実装ステップ（TDD-GREEN-1）

### 修正が必要な箇所

1. **executeToolDirectlyメソッド実装**
   ```typescript
   // SessionManagerにツール直接実行メソッド追加
   async executeToolDirectly(toolName: string, args: any) {
     const tool = this.agent.tools.find(t => t.name === toolName);
     // invokeメソッドを使用（execute→invokeに変換済み）
     return await tool.invoke(args);
   }
   ```

2. **agent_tool_startイベント統合**
   ```typescript
   // setupEventHandlers内でツール自動実行を実装
   this.session.on('agent_tool_start', async (event) => {
     // SDKの自動実行を活用
   });
   ```

3. **テストコード修正**
   ```typescript
   // execute → invoke に変更
   expect(tool).toHaveProperty('invoke');
   expect(typeof tool.invoke).toBe('function');
   ```

## 📊 最終目標との差分

```
現在の達成度: 35%

完了済み:
✅ 基盤環境（35%）
  - テスト環境
  - 音声設定
  - ツール登録
  - SDK構造理解

実装中:
🔄 ツール統合（5%）
  - executeToolDirectly実装中

未着手:
⏳ 音声統合（0%）
⏳ レガシー削除（0%）
⏳ MCP追加（0%）
```

## 🎯 成功の定義

最終的に以下が動作すること：
1. ✅ 音声コマンド「Slackのチャンネル一覧を見せて」
2. ✅ SDK経由でslack_list_channelsツール自動実行
3. ✅ プロキシサーバー経由でSlack API呼び出し
4. ✅ 音声で結果を返答
5. ✅ レガシーコード（voiceServer.ts）完全削除

次のステップ：【TDD-GREEN-1】でexecuteToolDirectlyメソッドを実装し、基本的なツール実行を確立する。