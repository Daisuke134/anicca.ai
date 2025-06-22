# Anicca AGI 実装計画書 v2.0

## プロジェクト概要

**プロジェクト名**: Anicca AGI  
**ビジョン**: ユーザーの画面を常時監視し、必要なタスクを察知して自動実行し、最適なタイミングで結果を提示する完全自律型AGIアシスタント  
**コア機能**: 画面監視→AI判断→コンテナ実行→通知表示→音声対話→継続改善

## 技術スタック（確定版）

### フロントエンド (Anicca Desktop App)
- **Framework**: Electron (Main Process)
- **Interface**: System Tray + Native Notifications + Voice
- **Philosophy**: "No UI is the best UI"
- **画面キャプチャ**: Electron desktopCapturer API
- **音声処理**: **OpenAI Realtime API**（双方向リアルタイム音声）
- **通知**: Native System Notifications

### バックエンド (AGI Engine)
- **LLM**: Claude 4 Sonnet/Opus (Anthropic API)
- **画像解析**: Claude 4 Vision capabilities
- **音声対話**: **OpenAI Realtime API** (WebSocket/WebRTC)
- **タスク実行**: **Claude Code SDK** + container-use (MCP)

### 実行環境
- **コンテナ**: container-use + Dagger Engine
- **ブラウザ自動化**: browser-use MCP Server
- **通信**: WebSocket + MCP (Model Context Protocol)

## システムトレイ設計

### **Anicca システムトレイ UI**

**アイコン**: 🤖 Anicca（システムトレイに常駐）

**右クリックメニュー:**
```
🤖 Anicca
├─ ✅ 監視中... (現在のステータス)
├─ ⚙️ 設定...
├─ 🔄 再起動
└─ ❌ 完全終了
```

### **設定ウィンドウ（最小限）**

**「設定...」クリック時のみ表示される小さなウィンドウ:**

**画面監視設定:**
- 監視間隔: 5秒 / 8秒 / 15秒

**安全レベル:**
- 🟢 安全のみ（読み取り・分析のみ）
- 🟡 中リスク許可（ファイル作成・編集）
- 🔴 全て許可（システム操作・外部通信）

**通知設定:**
- デスクトップ通知: ON/OFF
- 音声フィードバック: ON/OFF
- 通知音: 選択

**その他:**
- 起動時自動開始: ON/OFF

### **UI哲学**
- **API Key設定不要**: 全て内蔵済み（真のAGI体験）
- **ログ表示なし**: 必要な情報は音声・通知で伝える
- **進捗バー不要**: バックグラウンドで完了まで実行
- **タスク履歴なし**: 過去ではなく現在と未来に集中

```
┌─────────────────────────────────────────────────────────────┐
│                Anicca Desktop App (Electron)                │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ Screen Monitor  │ │OpenAI Realtime  │ │ Notification UI ││
│  │ ・画面キャプチャ   │ │ API Handler     │ │ ・結果表示       ││
│  │ ・変化検知       │ │ ・双方向音声     │ │ ・承認UI        ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                Claude 4 Analysis Engine                     │
│            + Claude Code SDK Integration                    │
├─────────────────────────────────────────────────────────────┤
│                      MCP Layer                              │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │ container-use   │ │  browser-use    │ │   Custom MCP    ││
│  │ コンテナ管理     │ │  ブラウザ操作    │ │   その他ツール   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 主要コンポーネント詳細

### 1. Screen Monitor (画面監視)
```typescript
interface ScreenMonitor {
  captureInterval: number // デフォルト: 5秒
  detectChanges(current: Buffer, previous: Buffer): ChangeEvent[]
  assessImportance(changes: ChangeEvent[]): ImportanceLevel
  sendToAnalyzer(screenshot: Buffer, context: ScreenContext): void
}

interface ChangeEvent {
  type: 'window_change' | 'content_update' | 'error_appeared' | 'notification'
  region: Rectangle
  confidence: number
  timestamp: Date
}
```

### 2. 音声対話ハンドラー（分離アーキテクチャ）
```typescript
interface RealtimeVoiceHandler {
  // Gemini Live API または OpenAI Realtime API
  startRealtimeSession(): Promise<GeminiLiveAPI | OpenAIRealtimeWS>
  
  // 独立した音声処理（画面分析と分離）
  handleVoiceInput(audioStream: Buffer): Promise<VoiceResponse>
  streamVoiceOutput(text: string): Promise<void>
  
  // 既存の画面状況を参照（重い分析は行わない）
  getScreenContext(): ScreenContext
  
  // 瞬時応答重視
  maintainConversationState(): ConversationState
}

interface VoiceResponse {
  intent: UserIntent
  shouldExecute: boolean
  confidence: number
  response: string
  latency: number // <500ms目標
}
```

### 音声API選択指針
**推奨: Gemini Live API**
- サブ秒レイテンシ（600ms以内）
- マルチモーダル対応（画面+音声同時処理）
- 感情認識・背景音除去機能
- コスト効率（OpenAIより大幅に安価）
- 30言語対応

**代替: OpenAI Realtime API**
- 安定性重視の場合
- 豊富なドキュメント
```

### 3. Claude Code SDK Integration
```typescript
interface AniccaExecutor {
  // Claude Code SDKでタスク実行
  executeWithClaudeCodeSDK(
    task: Task,
    containerEnv: string
  ): Promise<ExecutionResult>
  
  // MCP Servers統合
  setupMCPServers(): Promise<MCPServerConfig[]>
  
  // 並列実行管理
  manageParallelExecution(tasks: Task[]): Promise<ExecutionResult[]>
}

interface ExecutionResult {
  taskId: string
  status: 'success' | 'partial' | 'failed'
  outputs: OutputArtifact[]
  previewUrl?: string
  logs: ExecutionLog[]
  containerBranch: string // Git branch in container-use
}
```

## 実装フェーズ（戦略的順序）

### Phase 1: UIレス化 + 画面監視基盤 (1-2週間)
**目標**: 複雑なUIを捨てて、真のAGI体験の基盤を作る

- [x] **システムトレイ化**: 現在のReact UIを完全撤廃
  - 🤖 アイコンのみ表示
  - 右クリック → 最小限設定メニュー
  - **UIデザイン問題を根本解決**
- [x] **画面監視コア**: 8秒間隔スクリーンキャプチャ
- [x] **Claude 4分析**: 基本的な画面状況判断
- [x] **システム通知**: 分析結果をネイティブ通知で表示

**Phase 1完了時の体験:**
```
バックグラウンドでAniccaが画面監視
↓
「VSCodeでコーディング中を検出」(通知)
「エラーが発生しました」(通知)
```

### Phase 2: 音声対話統合 (2-3週間)
**目標**: 分離アーキテクチャで高速音声対話を実現

- [x] **音声API選択・統合**: Gemini Live API（推奨）
- [x] **分離設計**: 画面分析と音声を独立スレッドで処理
- [x] **瞬時応答**: 既存画面状況を参照して<500ms応答
- [x] **双方向会話**: 中断可能なリアルタイム対話

**Phase 2完了時の体験:**
```
あなた: 「これバグってるね」
Anicca: 「確認しました。Reactエラーですね」(即座応答)
あなた: 「直して」  
Anicca: 「修正開始します」
```

### Phase 3: タスク実行機能 (3-4週間)
**目標**: コンテナでの安全な作業実行と結果配信

- [x] **Claude Code SDK統合**: タスク実行エンジン
- [x] **container-use連携**: 安全な並列実行環境
- [x] **結果配信システム**: コンテナ→ユーザー画面への魔法配信
- [x] **ブラウザ自動化**: browser-use MCP統合

**Phase 3完了時の体験:**
```
音声指示 → コンテナで実行 → ブラウザ自動起動
「Webアプリが完成しました！」+ 自動ブラウザ表示
```

### Phase 4: 高度なAGI機能 (3-4週間)
**目標**: 学習・予測・最適化による真のAGI体験

- [x] **学習システム**: ユーザー行動パターン記憶
- [x] **予測機能**: 先回りタスク実行
- [x] **マルチタスク管理**: 複数作業の並列処理
- [x] **パフォーマンス最適化**: レスポンス時間改善

### Phase 5: 仕上げ・検証 (2-3週間)
- [x] **エラーハンドリング強化**
- [x] **セキュリティ検証**
- [x] **ユーザビリティテスト**
- [x] **ドキュメント整備**

## 分離アーキテクチャの利点

### **画面監視スレッド**（独立動作）
- 8秒間隔で継続監視
- Claude 4による詳細分析
- 状況変化のみメモリ保存

### **音声対話スレッド**（瞬時応答）
- Gemini Live API/OpenAI Realtime API
- 既存画面状況を即座参照
- <500ms応答目標

### **レスポンス時間比較**
```
統合版: 音声 → 画面分析(3秒) → 応答(5秒)
分離版: 音声 → 状況参照(0.1秒) → 応答(0.5秒)
```

## 音声対話フロー設計

### 1. 提案フェーズ
```
Anicca: 「画面でエラーが検出されました。修正コードを書きましょうか？」
User: 「いいね、お願いします」（音声入力）
Anicca: 「承知しました。container-use環境で修正を開始します...」
```

### 2. 実行フェーズ
```
Anicca: 「修正が完了しました。プレビューを表示します」
[通知 + 自動ブラウザ表示]
User: 「うーん、この部分の色をもう少し暗くして」（音声入力）
Anicca: 「色調整を行います...」
[Claude Code SDKでリアルタイム修正]
```

### 3. 完了フェーズ
```
Anicca: 「修正が完了しました。このまま適用しますか？」
User: 「OK、提出して」（音声入力）
Anicca: 「変更を適用し、GitHubにプッシュしました」
```

## 技術実装詳細

### OpenAI Realtime API実装
```typescript
import { OpenAIRealtimeWS } from "openai/beta/realtime/ws"

class AniccaVoiceConversation {
  private realtimeClient: OpenAIRealtimeWS
  
  async initializeRealtimeAPI() {
    this.realtimeClient = await OpenAIRealtimeWS.create({
      model: "gpt-4o-realtime-preview",
      modalities: ["text", "audio"],
      instructions: "You are Anicca, an AGI assistant..."
    })
    
    this.setupEventHandlers()
  }
  
  async handleVoiceInput(audioStream: Buffer) {
    // リアルタイム音声処理
    const response = await this.realtimeClient.sendAudio(audioStream)
    
    // 画面コンテキストと組み合わせ
    const screenContext = await this.getScreenContext()
    const taskAnalysis = await this.analyzeTaskWithClaude4(
      response.transcript, 
      screenContext
    )
    
    if (taskAnalysis.shouldExecute) {
      await this.executeTaskWithClaudeCodeSDK(taskAnalysis.task)
    }
    
    return response
  }
}
```

### Claude Code SDK統合
```typescript
import { ClaudeCodeSDK } from '@anthropic-ai/claude-code-sdk'

class AniccaTaskExecutor {
  private claudeCodeSDK: ClaudeCodeSDK
  
  async executeTask(task: Task, containerEnv: string) {
    const result = await this.claudeCodeSDK.execute({
      prompt: task.description,
      environment: containerEnv,
      mcpServers: [
        'container-use',
        'browser-use',
        'digitalocean-mcp'
      ],
      dangerouslySkipPermissions: true, // AGI用途
      outputFormat: 'stream-json'
    })
    
    // リアルタイムで進捗をユーザーに通知
    this.streamProgressToUser(result.stream)
    
    return result
  }
}
```

### container-use + browser-use統合
```typescript
class AniccaEnvironmentManager {
  async setupContainerEnvironment(taskType: string) {
    // container-use経由で独立環境作成
    const environment = await this.containerUse.createEnvironment({
      name: `anicca-task-${Date.now()}`,
      baseImage: this.getBaseImageForTask(taskType),
      mcpServers: ['browser-use']
    })
    
    return environment
  }
  
  async executeBrowserAutomation(task: BrowserTask) {
    // browser-use MCP経由でブラウザ操作
    const result = await this.browserUse.execute({
      action: task.action,
      target: task.target,
      data: task.data
    })
    
    return result
  }
}
```

## パフォーマンス要件

### レスポンス時間
- 画面分析: < 2秒
- 音声応答開始: < 500ms（OpenAI Realtime API）
- タスク実行開始: < 3秒
- 通知表示: < 500ms

### リソース使用量
- CPU使用率: < 20% (アイドル時)
- メモリ使用量: < 1GB
- ディスク容量: < 5GB (コンテナ含む)

## セキュリティ・プライバシー

### データ保護
- 画面キャプチャは暗号化してローカル保存
- 音声データはOpenAI Realtime API経由で処理後即削除
- すべての通信はTLS暗号化

### 権限管理
- コンテナ実行の完全隔離
- ファイルアクセス権限の細かい制御
- 重要操作には音声確認必須

## 成功指標

### 技術指標
- タスク実行成功率: > 90%
- 音声認識精度: > 95%（OpenAI Realtime API）
- 応答速度: < 1秒（音声→実行開始）

### ユーザー体験指標
- 「魔法のような体験」実現度: > 4.8/5
- 日次利用時間: > 3時間
- 手動介入率: < 15%

## 重要なリンク・リソース

### 必須リポジトリ
- **container-use**: https://github.com/dagger/container-use
- **Claude Code SDK**: https://docs.anthropic.com/en/docs/claude-code/sdk
- **OpenAI Realtime API**: https://platform.openai.com/docs/guides/realtime
- **browser-use MCP**: https://github.com/browser-use/browser-use

### MCP Servers
- **container-use MCP**: https://mcp.so/server/container-use/dagger
- **browser-use MCP**: https://github.com/browser-use/browser-use

## 🎪 ユーザー体験フロー（おじいちゃんの前での魔法）

### 実際に起こること：
1. **バックグラウンド**: コンテナでAniccaが作業
2. **フォアグラウンド**: おじいちゃんの画面に結果が現れる

```
コンテナ内作業                    ユーザーの前に現れる魔法
├─ Webアプリ開発                ➜ 自動でブラウザが開いてデモ表示
├─ ゲーム作成                  ➜ デスクトップにゲームが起動
├─ レポート生成                ➜ PDFが自動でダウンロードフォルダに
├─ API修正                    ➜ 通知「API修正完了！テストしますか？」
└─ UI改善                     ➜ 画面が自動更新されて新デザイン
```

### 魔法の仕組み：
```typescript
class AniccaMagic {
  async deliverResultToUser(result: ExecutionResult) {
    switch (result.type) {
      case 'web-app':
        // 1. コンテナのポートをローカルにフォワード
        const localUrl = await this.forwardPort(result.containerPort)
        
        // 2. ユーザーのブラウザを自動で開く
        await shell.openExternal(localUrl)
        
        // 3. 通知を表示
        this.showNotification("🎉 アプリが完成しました！", localUrl)
        break
        
      case 'game':
        // 1. ゲームファイルをローカルにコピー
        await this.copyFromContainer(result.gameFile, '~/Desktop/')
        
        // 2. ゲームを自動起動
        await shell.openPath(`~/Desktop/${result.gameFile}`)
        
        // 3. 音声で報告
        await this.speak("ゲームが完成しました！デスクトップで起動しています")
        break
        
      case 'document':
        // 1. ドキュメントをダウンロードフォルダに保存
        await this.saveToDownloads(result.document)
        
        // 2. フォルダを自動で開く
        await shell.showItemInFolder(result.downloadPath)
        break
    }
  }
}
```

## 🔒 セキュリティ方式の比較

### Option A: 完全コンテナ分離（推奨）
**メリット:**
- 100% 安全（ローカル環境に影響なし）
- 並列実行可能
- 失敗しても安心
- Git履歴で全て追跡可能

**デメリット:**
- 若干のオーバーヘッド
- ポートフォワーディング必要

### Option B: ローカル密閉ワークスペース
**メリット:**
- 直接ファイルアクセス
- 低オーバーヘッド

**デメリット:**
- ローカル環境が汚れる可能性
- 並列実行が困難
- セキュリティリスク

### 💡 最適解：ハイブリッド方式
```typescript
class AniccaSecurityModel {
  async executeTask(task: Task) {
    if (task.risk === 'low' && task.needsLocalAccess) {
      // ローカル密閉ワークスペース
      return await this.executeInLocalSandbox(task)
    } else {
      // コンテナ完全分離
      return await this.executeInContainer(task)
    }
  }
  
  private async executeInLocalSandbox(task: Task) {
    // 特定ディレクトリのみアクセス許可
    const sandbox = await this.createLocalSandbox(`./anicca-workspace/${task.id}`)
    return await this.claudeCodeSDK.execute({
      ...task,
      workingDirectory: sandbox.path,
      restrictToDirectory: true
    })
  }
}
```

---

## 次のアクション

1. **Electron + OpenAI Realtime API** のプロトタイプ作成
2. **Claude Code SDK + container-use** 統合テスト
   - container-use repo: https://github.com/dagger/container-use
3. **画面監視→音声対話→実行** の基本フロー実装
4. **browser-use MCP** によるブラウザ自動化テスト
5. **結果配信システム** の実装（コンテナ→ユーザー画面）

**Anicca AGI**: おじいちゃんの前で魔法を起こす真のデジタルアシスタント 🪄✨