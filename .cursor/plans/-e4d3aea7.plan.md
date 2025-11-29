<!-- e4d3aea7-4e14-451c-9f86-0aa763da3078 dc222b25-1621-426e-a3a2-2b94c06ac366 -->
# トレーニングカウント保持機能の実装

## 問題の要約

トレーニングセッション中、ユーザーが声で割り込むとカウントがリセットされ、0から始まってしまう。プロンプトだけでは解決が難しいため、ロジック的な実装が必要。

## 解決策の選択肢

1. **理想案**: Function Callingによる外部状態管理
   - カウントをiOSアプリ側で管理
   - モデルがFunctionを呼び出してカウントを更新・取得
   - 割り込みが発生しても外部状態は保持される

2. **中間案**: モーダリティ切り替え
   - トレーニング中は`turn_detection`を無効化（一方向）
   - 完了後に`turn_detection`を有効化（双方向）

3. **最悪案**: 完全一方向
   - トレーニング中は常に一方向のみ

## 実装計画

### ステップ1: Function Callingによるカウント管理の実装（理想案）

#### 1.1 カウント状態管理クラスの作成
- `TrainingCountManager.swift`を新規作成
- セッションごとのカウント状態を管理
- `currentCount`, `targetCount`, `isActive`を保持

#### 1.2 VoiceSessionControllerでのFunction定義とハンドリング
- `session.update`でFunction定義を追加
  - `increment_training_count`: カウントを1増やす
  - `get_training_count`: 現在のカウントを取得
  - `reset_training_count`: カウントをリセット（完了時のみ）
- `dataChannel`のイベントハンドラーでFunction Callを検出・処理

#### 1.3 プロンプトの更新
- `training.txt`を更新
- Function Callingを使うように指示を追加
- カウントは必ずFunction経由で管理することを明記

### ステップ2: モーダリティ切り替えの実装（フォールバック）

#### 2.1 トレーニングセッション開始時の設定
- `VoiceSessionController.sendSessionUpdate()`で`turn_detection`を制御
- トレーニング習慣の場合は`turn_detection: null`で開始（一方向）
- 完了検知後に`turn_detection`を有効化

#### 2.2 完了検知の実装
- Function `training_complete`を追加
- 完了時にモーダリティを切り替え

### ステップ3: 既存コードとの統合

#### 3.1 AppStateとの連携
- `prepareForImmediateSession(habit:)`でトレーニング習慣を検出
- `TrainingCountManager`を初期化

#### 3.2 セッション終了時のクリーンアップ
- `VoiceSessionController.stop()`でカウント状態をリセット

## 実装ファイル

### 新規作成
- `aniccaios/aniccaios/Services/TrainingCountManager.swift`
  - カウント状態の管理
  - Function Callの処理ロジック

### 修正
- `aniccaios/aniccaios/VoiceSessionController.swift`
  - Function定義の追加
  - Function Callイベントのハンドリング
  - モーダリティ切り替えロジック

- `aniccaios/aniccaios/Resources/Prompts/training.txt`
  - Function Callingの使用指示を追加
  - カウント管理の明確化

- `aniccaios/aniccaios/AppState.swift`
  - `TrainingCountManager`との連携

## 技術的な詳細

### Function定義の例
```swift
let trainingCountTool: [String: Any] = [
    "type": "function",
    "name": "increment_training_count",
    "description": "トレーニングのカウントを1増やします。必ず各回の動作完了時に呼び出してください。",
    "parameters": [
        "type": "object",
        "properties": [
            "current_count": [
                "type": "integer",
                "description": "現在のカウント数"
            ]
        ],
        "required": ["current_count"]
    ]
]
```

### モーダリティ切り替えの例
```swift
// トレーニング開始時: 一方向
sessionPayload["turn_detection"] = nil

// トレーニング完了時: 双方向に切り替え
sessionPayload["turn_detection"] = [
    "type": "semantic_vad",
    "eagerness": "low",
    "interrupt_response": true,
    "create_response": true
]
```

## 注意事項

- Function CallingはRealtime APIの標準機能だが、iOSアプリ側での実装が必要
- モーダリティ切り替えは`session.update`で動的に変更可能
- カウント状態はセッション終了時に必ずクリーンアップ
- エラーハンドリングを適切に実装（Function Call失敗時のフォールバック）

## テスト項目

1. カウントが正しく増加するか
2. 割り込み時にカウントが保持されるか
3. 完了時に正しくリセットされるか
4. モーダリティ切り替えが正しく動作するか
5. エラー時のフォールバックが機能するか


実装の差分パッチをチャットで示します。

## 実装パッチ

### 1. TrainingCountManager.swift（新規作成）

```swift
import Foundation

@MainActor
final class TrainingCountManager: ObservableObject {
    static let shared = TrainingCountManager()
    
    private(set) var currentCount: Int = 0
    private(set) var targetCount: Int = 0
    private(set) var isActive: Bool = false
    
    private init() {}
    
    func startSession(targetCount: Int) {
        self.currentCount = 0
        self.targetCount = targetCount
        self.isActive = true
    }
    
    func increment() -> Int {
        guard isActive else { return currentCount }
        currentCount += 1
        return currentCount
    }
    
    func getCurrentCount() -> Int {
        return currentCount
    }
    
    func reset() {
        currentCount = 0
        targetCount = 0
        isActive = false
    }
    
    func isComplete() -> Bool {
        return isActive && currentCount >= targetCount
    }
}
```

### 2. VoiceSessionController.swift の修正

#### 2.1 プロパティの追加

```swift
// VoiceSessionControllerクラス内に追加
private var trainingCountManager = TrainingCountManager.shared
private var isTrainingSession: Bool = false
```

#### 2.2 sendSessionUpdate()の修正

```swift
@MainActor
func sendSessionUpdate() {
    guard let channel = dataChannel, channel.readyState == .open else { return }
    
    var sessionPayload: [String: Any] = [
        "modalities": ["text", "audio"],
        "voice": "alloy",
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "input_audio_noise_reduction": [
            "type": "near_field"
        ],
        "max_response_output_tokens": "inf"
    ]
    
    // トレーニングセッションの判定
    if let prompt = AppState.shared.consumePendingPrompt() {
        sessionPayload["instructions"] = prompt
        // プロンプトからトレーニング習慣かどうかを判定
        isTrainingSession = prompt.contains("トレーニング") || prompt.contains("training")
        
        // トレーニングセッションの場合はFunction定義を追加
        if isTrainingSession {
            sessionPayload["tools"] = [
                [
                    "type": "function",
                    "name": "increment_training_count",
                    "description": "トレーニングのカウントを1増やします。各回の動作完了時に必ず呼び出してください。",
                    "parameters": [
                        "type": "object",
                        "properties": [
                            "current_count": [
                                "type": "integer",
                                "description": "現在のカウント数（モデルが認識している数値）"
                            ]
                        ],
                        "required": ["current_count"]
                    ]
                ],
                [
                    "type": "function",
                    "name": "get_training_count",
                    "description": "現在のトレーニングカウントを取得します。割り込み後に続きから再開する際に使用してください。",
                    "parameters": [
                        "type": "object",
                        "properties": [:],
                        "required": []
                    ]
                ],
                [
                    "type": "function",
                    "name": "training_complete",
                    "description": "トレーニングが完了したことを通知します。目標回数に到達した時に呼び出してください。",
                    "parameters": [
                        "type": "object",
                        "properties": [:],
                        "required": []
                    ]
                ]
            ]
            
            // トレーニング中は一方向モード（割り込みを防ぐ）
            // ただし、Function Callingで完了を検知したら双方向に切り替え
            sessionPayload["turn_detection"] = nil  // 一方向モード
        } else {
            // 通常セッションは双方向
            sessionPayload["turn_detection"] = [
                "type": "semantic_vad",
                "eagerness": "low",
                "interrupt_response": true,
                "create_response": true
            ]
        }
    }
    
    let update: [String: Any] = [
        "type": "session.update",
        "session": sessionPayload
    ]
    
    do {
        let json = try JSONSerialization.data(withJSONObject: update, options: [.fragmentsAllowed])
        let buffer = RTCDataBuffer(data: json, isBinary: false)
        channel.sendData(buffer)
    } catch {
        logger.error("Failed to send session.update: \(error.localizedDescription, privacy: .public)")
    }
}
```

#### 2.3 Function Callイベントハンドラーの追加

```swift
// RTCDataChannelDelegate extension内に追加
func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) {
    guard let text = String(data: buffer.data, encoding: .utf8) else { return }
    logger.debug("Realtime event: \(text, privacy: .public)")
    
    // JSONパース
    guard let data = text.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let eventType = json["type"] as? String else {
        return
    }
    
    // Function Callイベントの処理
    if eventType == "conversation.item.input_audio_transcription.completed" {
        // ユーザーの発話が完了したら、カウントを取得して続きから再開するよう促す
        if isTrainingSession && trainingCountManager.isActive {
            let currentCount = trainingCountManager.getCurrentCount()
            if currentCount > 0 {
                // カウント情報をモデルに送信
                sendTrainingCountUpdate(currentCount: currentCount)
            }
        }
    }
    
    // Function Callの検出と処理
    if eventType == "conversation.item.function_call" || eventType == "response.function_call_arguments.done" {
        handleFunctionCall(from: json)
    }
}

private func handleFunctionCall(from json: [String: Any]) {
    guard let functionName = json["name"] as? String else { return }
    
    switch functionName {
    case "increment_training_count":
        if let arguments = json["arguments"] as? String,
           let argsData = arguments.data(using: .utf8),
           let args = try? JSONSerialization.jsonObject(with: argsData) as? [String: Any],
           let count = args["current_count"] as? Int {
            let newCount = trainingCountManager.increment()
            sendFunctionCallOutput(functionName: functionName, result: ["count": newCount, "message": "カウントを\(newCount)に更新しました"])
        }
        
    case "get_training_count":
        let currentCount = trainingCountManager.getCurrentCount()
        sendFunctionCallOutput(functionName: functionName, result: ["count": currentCount, "message": "現在のカウントは\(currentCount)です"])
        
    case "training_complete":
        trainingCountManager.reset()
        isTrainingSession = false
        // 双方向モードに切り替え
        switchToBidirectionalMode()
        sendFunctionCallOutput(functionName: functionName, result: ["message": "トレーニング完了"])
        
    default:
        break
    }
}

private func sendFunctionCallOutput(functionName: String, result: [String: Any]) {
    guard let channel = dataChannel, channel.readyState == .open else { return }
    
    let output: [String: Any] = [
        "type": "conversation.item.function_call.output",
        "item_id": "function_call_item_id", // 実際のitem_idを取得する必要あり
        "output": try! JSONSerialization.data(withJSONObject: result).base64EncodedString()
    ]
    
    do {
        let json = try JSONSerialization.data(withJSONObject: output, options: [])
        let buffer = RTCDataBuffer(data: json, isBinary: false)
        channel.sendData(buffer)
    } catch {
        logger.error("Failed to send function call output: \(error.localizedDescription, privacy: .public)")
    }
}

private func sendTrainingCountUpdate(currentCount: Int) {
    guard let channel = dataChannel, channel.readyState == .open else { return }
    
    let message: [String: Any] = [
        "type": "conversation.item.create",
        "item": [
            "type": "message",
            "role": "user",
            "content": [
                [
                    "type": "input_text",
                    "text": "現在のカウントは\(currentCount)です。続きから再開してください。"
                ]
            ]
        ]
    ]
    
    do {
        let json = try JSONSerialization.data(withJSONObject: message, options: [])
        let buffer = RTCDataBuffer(data: json, isBinary: false)
        channel.sendData(buffer)
    } catch {
        logger.error("Failed to send training count update: \(error.localizedDescription, privacy: .public)")
    }
}

private func switchToBidirectionalMode() {
    guard let channel = dataChannel, channel.readyState == .open else { return }
    
    let update: [String: Any] = [
        "type": "session.update",
        "session": [
            "turn_detection": [
                "type": "semantic_vad",
                "eagerness": "low",
                "interrupt_response": true,
                "create_response": true
            ]
        ]
    ]
    
    do {
        let json = try JSONSerialization.data(withJSONObject: update, options: [])
        let buffer = RTCDataBuffer(data: json, isBinary: false)
        channel.sendData(buffer)
    } catch {
        logger.error("Failed to switch to bidirectional mode: \(error.localizedDescription, privacy: .public)")
    }
}
```

#### 2.4 stop()メソッドの修正

```swift
func stop() {
    logger.debug("Stopping realtime session")
    sessionTimeoutTask?.cancel()
    sessionTimeoutTask = nil
    usageTrackingTask?.cancel()
    usageTrackingTask = nil
    sessionStartTime = nil
    lastServerSyncTime = nil
    
    // トレーニングカウントのリセット
    trainingCountManager.reset()
    isTrainingSession = false
    
    Task { await self.notifyStopIfNeeded() }
    peerConnection?.close()
    peerConnection = nil
    dataChannel = nil
    audioTrack = nil
    cachedSecret = nil
    setStatus(.disconnected)
    deactivateAudioSession()
}
```

### 3. training.txt の修正

```diff
--- a/aniccaios/aniccaios/Resources/Prompts/training.txt
+++ b/aniccaios/aniccaios/Resources/Prompts/training.txt
@@ -38,7 +38,20 @@
 
 5. ユーザー割り込み時のカウント継続
-   - 【状態管理】常に現在のカウント数を内部状態として保持すること。
-   - 【絶対ルール】カウント中にユーザーが音声で割り込んだり、ノイズで割り込まれたりしても、現在のカウント数を必ず記憶し、続きから再開すること。
-   - 【絶対禁止】最初からリセットすることは絶対に禁止。最後に数えた数字の次の数字から続けること。
-   - 例（英語）: 「5」まで数えた後、ユーザーが話しかけた場合、「6」から続ける。決して「1」から始めない。
-   - 例（日本語）: 「5」まで数えた後、ユーザーが話しかけた場合、「6」から続ける。決して「1」から始めない。
-   - 状態の保持方法: 各カウントを発話するたびに、その数字を内部状態として更新し、割り込みが発生してもその状態を維持すること。
-   - 目標値に到達するまで、カウントを継続すること。途中でリセットすることは絶対に禁止。
+   - 【重要】カウント管理は必ずFunction Callingを使用すること。
+   - 【絶対ルール】各回の動作完了時に必ず`increment_training_count`を呼び出すこと。
+   - 【絶対ルール】割り込みが発生した場合は、まず`get_training_count`を呼び出して現在のカウントを取得し、その続きから再開すること。
+   - 【絶対禁止】カウントを内部状態だけで管理することは禁止。必ずFunction経由で管理すること。
+   - 【絶対禁止】最初からリセットすることは絶対に禁止。最後に数えた数字の次の数字から続けること。
+   - 例: 「5」まで数えた後、ユーザーが話しかけた場合、`get_training_count`で現在のカウント（5）を取得し、「6」から続ける。
+   - 目標値に到達したら、必ず`training_complete`を呼び出すこと。
 
 6. 完了確認
```

### 4. AppState.swift の修正

```swift
// prepareForImmediateSession(habit:)メソッド内に追加
func prepareForImmediateSession(habit: HabitType) {
    // ... 既存のコード ...
    
    // トレーニング習慣の場合はカウントマネージャーを初期化
    if habit == .training {
        // 目標回数を取得（プロフィールから）
        let targetCount = extractTargetCount(from: userProfile.trainingGoal)
        TrainingCountManager.shared.startSession(targetCount: targetCount)
    }
    
    // ... 既存のコード ...
}

private func extractTargetCount(from goal: String) -> Int {
    // "15回"のような文字列から数値を抽出
    let numbers = goal.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
    return Int(numbers) ?? 15  // デフォルトは15回
}
```

## 実装のポイント

1. Function Callingでカウントを外部管理し、割り込み時も状態を保持
2. トレーニング中は`turn_detection: null`で一方向にし、完了後に双方向へ切り替え
3. プロンプトでFunction Callingの使用を明示
4. セッション終了時にカウントをリセット

この実装で、割り込み時でもカウントが保持され、続きから再開できます。

2点を確認中です。まず、目標値設定の実装を確認します。


[5 tools called]



2点を確認しました。修正パッチを提示します。

## 1. 目標値設定の修正

`trainingGoal`は「15回」「プランク15秒」などの文字列です。`TrainingCountManager`の初期化時に、回数系と時間系を区別して目標値を抽出する必要があります。

### 修正パッチ

#### AppState.swift の修正

```swift
// prepareForImmediateSession(habit:)メソッド内に追加
func prepareForImmediateSession(habit: HabitType) {
    // ... 既存のコード ...
    
    // トレーニング習慣の場合はカウントマネージャーを初期化
    if habit == .training {
        let targetValue = extractTargetValue(from: userProfile.trainingGoal)
        TrainingCountManager.shared.startSession(targetValue: targetValue)
    }
    
    // ... 既存のコード ...
}

// 新規追加: trainingGoalから目標値を抽出（回数系・時間系に対応）
private func extractTargetValue(from goal: String) -> TrainingTarget {
    // 空の場合はデフォルト値
    guard !goal.isEmpty else {
        return .repetitions(15)  // デフォルトは15回
    }
    
    // 「15回」「15秒」「プランク15秒」などの形式を解析
    let numbers = goal.components(separatedBy: CharacterSet.decimalDigits.inverted).joined()
    guard let value = Int(numbers), value > 0 else {
        return .repetitions(15)  // 数値が取得できない場合はデフォルト
    }
    
    // 時間系のキーワードをチェック
    let lowercased = goal.lowercased()
    if lowercased.contains("秒") || lowercased.contains("second") || 
       lowercased.contains("プランク") || lowercased.contains("plank") ||
       lowercased.contains("キープ") || lowercased.contains("hold") {
        return .duration(seconds: value)
    }
    
    // 回数系のキーワードをチェック
    if lowercased.contains("回") || lowercased.contains("rep") || 
       lowercased.contains("times") || lowercased.contains("回数") {
        return .repetitions(value)
    }
    
    // デフォルトは回数系とみなす
    return .repetitions(value)
}
```

#### TrainingCountManager.swift の修正

```swift
import Foundation

// 目標値の型を定義
enum TrainingTarget: Equatable {
    case repetitions(Int)  // 回数系（例: 15回）
    case duration(seconds: Int)  // 時間系（例: 15秒）
    
    var displayString: String {
        switch self {
        case .repetitions(let count):
            return "\(count)回"
        case .duration(let seconds):
            return "\(seconds)秒"
        }
    }
}

@MainActor
final class TrainingCountManager: ObservableObject {
    static let shared = TrainingCountManager()
    
    private(set) var currentCount: Int = 0
    private(set) var targetValue: TrainingTarget = .repetitions(15)
    private(set) var isActive: Bool = false
    
    private init() {}
    
    func startSession(targetValue: TrainingTarget) {
        self.currentCount = 0
        self.targetValue = targetValue
        self.isActive = true
    }
    
    func increment() -> Int {
        guard isActive else { return currentCount }
        currentCount += 1
        return currentCount
    }
    
    func getCurrentCount() -> Int {
        return currentCount
    }
    
    func reset() {
        currentCount = 0
        targetValue = .repetitions(15)
        isActive = false
    }
    
    func isComplete() -> Bool {
        guard isActive else { return false }
        
        switch targetValue {
        case .repetitions(let targetCount):
            return currentCount >= targetCount
        case .duration(let targetSeconds):
            // 時間系の場合は、秒数をカウントとして扱う
            // 実際の実装では、経過時間を管理する必要があるが、
            // ここでは簡易的にカウントで管理
            return currentCount >= targetSeconds
        }
    }
    
    var targetDisplayString: String {
        return targetValue.displayString
    }
}
```

## 2. Function Callingのパフォーマンスについて

### レイテンシーの目安

1. Function Call決定までの時間: モデルがFunction Callを決定するまでの時間（通常100-500ms程度）
2. Function Call実行時間: アプリ側の処理（カウント更新は数ミリ秒）
3. Function Call出力送信: WebRTC経由で送信（数ミリ秒）
4. モデルの続き生成: Function Call出力を受け取って続きを生成（通常200-800ms程度）

合計で約300-1300ms程度が想定されます。

### パフォーマンス最適化のポイント

1. Function Callは非同期で処理: アプリ側の処理は即座に完了するため、レイテンシーは主にモデルの処理時間に依存
2. カウント更新は軽量: メモリ上の数値更新のみなので、パフォーマンスへの影響はほぼない
3. ストリーミング対応: Realtime APIはストリーミング対応なので、Function Callの結果を待たずに音声生成を開始できる場合がある

### 実装上の注意点

- Function Callの完了を待たずに、アプリ側のカウントは即座に更新する
- モデルがFunction Callを呼び忘れても、アプリ側のカウントは正しく保持される
- 割り込み時は`get_training_count`で最新のカウントを取得できる

## まとめ

1. 目標値設定: `trainingGoal`から回数系・時間系を区別して目標値を抽出し、`TrainingCountManager`に設定
2. Function Callingのパフォーマンス: カウント更新自体は軽量。レイテンシーは主にモデルの処理時間（300-1300ms程度）に依存し、実用上問題ない

この修正で、`trainingGoal`が「15回」「プランク15秒」などでも正しく目標値が設定されます。

### To-dos

- [ ] TrainingCountManager.swiftを作成し、カウント状態管理機能を実装
- [ ] VoiceSessionControllerにFunction Callingの定義とハンドリングを追加
- [ ] training.txtプロンプトを更新し、Function Callingの使用を指示
- [ ] トレーニングセッション開始時と完了時のモーダリティ切り替えを実装
- [ ] AppStateとTrainingCountManagerを連携
- [ ] セッション終了時のカウント状態クリーンアップを実装