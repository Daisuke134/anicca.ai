# トレーニング習慣の一方向音声対応

## 問題

トレーニング習慣時に、Aniccaが声かけをしている最中にユーザーが話すと割り込まれてしまい、カウントが中断される問題が発生していました。

- 例: 「Dais. 15回やってみよう。下げて... 上げて. 1. 下げて... 上げて. 2. ...」というカウント中にユーザーが話すと、割り込まれてカウントが止まる

## 対応方針

トレーニング習慣時は、**一方向の声かけのみ**を実現するため、マイク入力を完全に無効化する。

- トレーニング時: ユーザーの音声入力を受け付けない（一方向モード）
- その他の習慣（wake_up、bedtime、custom）: 双方向対話を維持

## 実装内容

### 1. WebRTC側のマイク入力無効化

**ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`

**変更箇所**: `setupLocalAudio()`メソッド

```swift
// トレーニング時はマイク入力を無効化
let isTrainingMode = currentHabitType == .training

// ... audio track作成 ...

// トレーニング時はマイクトラックを無効化
if isTrainingMode {
    track.isEnabled = false
    logger.info("Training mode: microphone input disabled")
}
```

- `audioTrack.isEnabled = false`でWebRTC側のマイク入力を無効化
- これにより、ユーザーが話しても音声データが送信されない

### 2. OpenAI Realtime API側のVAD無効化

**ファイル**: `aniccaios/aniccaios/VoiceSessionController.swift`

**変更箇所**: `sendSessionUpdate()`メソッド

```swift
// トレーニング時は turn_detection を null に設定してマイク入力を完全に無効化
if isTrainingMode {
    // トレーニング時: マイク入力を完全に無効化（一方向モード）
    sessionPayload["turn_detection"] = NSNull()
    logger.info("Training mode: turn_detection disabled for one-way audio")
} else {
    // その他の習慣: 双方向対話を維持
    sessionPayload["turn_detection"] = [
        "type": "semantic_vad",
        "eagerness": "low",
        "interrupt_response": true,
        "create_response": true
    ]
}
```

- `turn_detection: null`でVoice Activity Detection（VAD）を無効化
- サーバー側でも音声入力の検出を停止
- `NSNull()`を使用してJSONの`null`を正しく表現

### 3. iOS 17対応の統一

**変更箇所**: `setupLocalAudio()`メソッド

- `AVAudioApplication.shared.recordPermission`（プライベートAPIの可能性）を削除
- `AVAudioSession.sharedInstance().recordPermission`に統一して互換性を確保

## 動作確認

### トレーニング習慣の場合

1. 通知が来る → 「トレーニングの時間です」
2. 通知をタップしてセッション開始
   - マイク入力は無効化されている（ユーザーが話しても反応しない）
3. 一方向の声かけ
   - Aniccaが`training.txt`のプロンプトに従って声かけを開始
   - 例: 「Dais. 15回やってみよう。下げて... 上げて. 1. 下げて... 上げて. 2. ...」
   - ユーザーが話しても割り込まれない
   - カウントが最後まで続く
4. セッション終了
   - エンドセッションをタップすると終了

### その他の習慣（wake_up、bedtime、custom）の場合

1. 通知が来る
2. 通知をタップしてセッション開始
   - マイク入力は有効（双方向対話可能）
3. 双方向対話
   - Aniccaが声かけを開始
   - ユーザーが話すと割り込んで応答できる
   - 通常の会話が可能

## 技術的な検証

- ✅ `turn_detection: null`はOpenAI Realtime APIの公式ドキュメントでサポートされている
- ✅ Desktopアプリ（`apps/desktop/src/agents/sessionManager.ts`）でも同様の実装を確認
- ✅ `NSNull()`はSwiftでJSONの`null`を表現する正しい方法
- ✅ 現在のフラット構造のAPIフォーマットと整合性がある
- ✅ リンターエラーなし

## 参考資料

- OpenAI Realtime APIドキュメント: `turn_detection`を`null`に設定することでVADを無効化可能
- `docs/manage-conv.md`: VAD無効化の説明
- `apps/desktop/src/agents/sessionManager.ts`: 同様の実装例（1270行目）

## 日付

2025-01-XX

