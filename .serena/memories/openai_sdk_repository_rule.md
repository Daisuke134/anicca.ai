# OpenAI SDK実装の絶対ルール

## リポジトリパス
`/Users/cbns03/Downloads/anicca-project/openai-agents-js`

## 重要なファイル
- **RealtimeSession**: `packages/agents-realtime/src/realtimeSession.ts`
- **RealtimeAgent**: `packages/agents-realtime/src/realtimeAgent.ts`
- **Transport層**: `packages/agents-realtime/src/openaiRealtimeWebsocket.ts`

## RealtimeSession APIリファレンス
```typescript
class RealtimeSession {
  // 音声送信（ArrayBuffer必須）
  sendAudio(audio: ArrayBuffer, options: { commit?: boolean } = {})
  
  // テキストメッセージ送信
  sendMessage(message: string, otherEventData?: any)
  
  // セッション中断
  interrupt()
  
  // セッション終了
  close()
  
  // 履歴更新
  updateHistory(history: RealtimeItem[])
  
  // 接続
  async connect(options: RealtimeSessionConnectOptions)
}
```

## Keep-alive実装
```typescript
// 正しい方法：空のArrayBufferをcommit付きで送信
await this.session.sendAudio(new ArrayBuffer(0), { commit: true });
```

## 絶対ルール
1. **OpenAI SDK関連の実装前に必ずこのリポジトリを確認**
2. **推測でAPIを書かない**
3. **実際のソースコードを読んで確認**
4. **存在しないメソッド（例：commitAudio）を使わない**

最終更新: 2025-08-23
理由: commitAudio()が存在しないことが判明し、正しいAPIを確認