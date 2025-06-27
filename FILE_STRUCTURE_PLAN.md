# Anicca Project - ファイル構成整理計画

## 現在の問題点
1. realtime-to-mcp-repoなど外部リポジトリが混在
2. 相対パスが深く複雑（../../../など）
3. 同じ機能のコードが複数箇所に分散
4. テストファイルがルートディレクトリに散在

## 目標とする構成

```
anicca-project/
├── src/
│   ├── main/                    # エントリーポイント
│   │   ├── main-voice-simple.ts # 現在のメイン（Realtime API版）
│   │   └── main-voice.ts        # Whisper版（保持）
│   │
│   ├── voice/                   # 音声関連を統合
│   │   ├── server/              # サーバー関連
│   │   │   └── voice-server.ts  # 統合されたボイスサーバー
│   │   ├── realtime/            # Realtime API関連
│   │   └── whisper/             # Whisper関連
│   │
│   ├── services/                # すべてのサービス
│   │   ├── claude/              # Claude関連
│   │   ├── database/            # データベース関連
│   │   └── encryption/          # 暗号化関連
│   │
│   └── utils/                   # 共通ユーティリティ
│
├── config/                      # 設定ファイル
│   ├── electron-builder-voice.yml
│   └── tsconfig.voice.json
│
├── tests/                       # テストファイル（移動）
│   ├── test-voice-interaction.js
│   └── ...
│
├── assets/                      # アセット
│   ├── icons/
│   └── certificates/
│
└── archive/                     # アーカイブ（削除予定を一時保管）
    ├── anicca-claude-sdk/       # 旧画面分析版
    ├── alice-repo/              # 別プロジェクト
    └── old-mains/               # 使わないmainファイル
```

## 実施手順

### Phase 1: ディレクトリ構造の作成
1. src/main/, src/voice/, src/voice/server/ などを作成
2. config/, tests/, archive/ ディレクトリを作成

### Phase 2: realtime-to-mcp-repoの統合
1. server-simple.tsの内容をsrc/voice/server/voice-server.tsに統合
2. VoiceServerServiceと重複部分を整理
3. 相対パスを修正

### Phase 3: ファイルの移動と整理
1. main-voice-simple.ts → src/main/
2. main-voice.ts → src/main/
3. テストファイル → tests/
4. 設定ファイル → config/

### Phase 4: 不要ファイルのアーカイブ
1. 使用しないファイルをarchive/に移動
2. 動作確認後、archive/を削除

### Phase 5: import文の修正
1. すべてのimport文を新しいパスに更新
2. 相対パスを整理

## 期待される効果
- コードの見通しが良くなる
- 依存関係が明確になる
- ウェブアプリ化がスムーズに進む
- 新規開発者にも理解しやすい構造