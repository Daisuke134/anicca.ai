# Claude Skills 分析レポート - Anicca向け

## 📚 Claude Skillsとは？

**Claude Skills**は、Claudeに特定のタスクの実行方法を教えるカスタマイズ可能なワークフローです。

### 基本的な仕組み

1. **スキル = フォルダ + SKILL.md**
   - 各スキルはフォルダで構成される
   - `SKILL.md`に指示とメタデータが書かれている
   - 必要に応じてスクリプトやリソースを含む

2. **自動的に読み込まれる**
   - Claudeがタスクに応じて関連スキルを自動検出
   - 必要な時だけ読み込む（効率的）
   - 複数のスキルを組み合わせて使える

3. **クロスプラットフォーム**
   - Claude.ai（Web）
   - Claude Code（ローカル開発環境）
   - Claude API
   - すべて同じフォーマットで動作

### スキルの構造

```
skill-name/
├── SKILL.md          # 必須: スキルの指示とメタデータ
├── scripts/          # オプション: ヘルパースクリプト
├── templates/        # オプション: ドキュメントテンプレート
└── resources/        # オプション: リファレンスファイル
```

---

## 📦 クローンしたリポジトリの内容

### 1. awesome-claude-skills（ComposioHQ）
**場所**: `.cursor/plans/awesome-claude-skills/`

**特徴**: 実用的なスキルが豊富に揃っている（30+スキル）

**カテゴリ別スキル一覧**:

#### 📄 Document Processing（文書処理）
- `docx` - Word文書の作成・編集
- `pdf` - PDFの抽出・マージ・注釈
- `pptx` - PowerPointスライドの生成
- `xlsx` - Excelスプレッドシート操作

#### 💻 Development & Code Tools（開発・コードツール）
- `artifacts-builder` - HTMLアーティファクト作成（React, Tailwind）
- `changelog-generator` - Gitコミットから変更履歴生成 ⭐
- `mcp-builder` - MCPサーバー作成ガイド
- `skill-creator` - スキル作成支援
- `webapp-testing` - Playwrightを使ったWebアプリテスト

#### 📊 Data & Analysis（データ・分析）
- `postgres` - PostgreSQLクエリ実行

#### 💼 Business & Marketing（ビジネス・マーケティング）
- `brand-guidelines` - ブランドガイドライン適用
- `competitive-ads-extractor` - 競合広告の抽出・分析 ⭐⭐⭐
- `domain-name-brainstormer` - ドメイン名のブレインストーミング
- `internal-comms` - 社内コミュニケーション作成
- `lead-research-assistant` - リードリサーチ支援 ⭐⭐⭐

#### ✍️ Communication & Writing（コミュニケーション・ライティング）
- `content-research-writer` - 高品質コンテンツ作成支援 ⭐⭐
- `meeting-insights-analyzer` - 会議トランスクリプト分析 ⭐⭐
- `article-extractor` - 記事テキスト抽出

#### 🎨 Creative & Media（クリエイティブ・メディア）
- `canvas-design` - ビジュアルアート作成
- `image-enhancer` - 画像品質向上
- `slack-gif-creator` - Slack用GIF作成
- `theme-factory` - プロフェッショナルなテーマ適用
- `video-downloader` - YouTube動画ダウンロード

#### 📁 Productivity & Organization（生産性・整理）
- `file-organizer` - ファイル整理
- `invoice-organizer` - 請求書整理

### 2. skills（Anthropics公式）
**場所**: `.cursor/plans/skills/`

**特徴**: Anthropic公式のスキル例（より基本的なスキル）

**主なスキル**:
- `docx`, `pdf`, `pptx`, `xlsx` - 文書処理
- `canvas-design` - デザイン作成
- `frontend-design` - フロントエンドデザイン
- `mcp-builder` - MCPサーバー作成
- `skill-creator` - スキル作成支援
- `web-artifacts-builder` - Webアーティファクト作成

---

## 🎯 Aniccaで使えそうなスキル（優先度順）

### ⭐⭐⭐ 最優先（すぐに使える）

#### 1. **lead-research-assistant**
**用途**: Aniccaの潜在顧客をリサーチ
- 音声対話アプリのターゲット企業を特定
- 習慣形成アプリの競合分析
- B2B向け営業リスト作成

**使い方**:
```
Aniccaは音声対話で生活リズムと習慣を整えるiOSアプリです。
習慣形成や行動変容に興味がある企業を10社見つけて。
```

#### 2. **competitive-ads-extractor**
**用途**: 競合アプリの広告戦略分析
- 習慣形成アプリの広告メッセージ分析
- 音声アプリの訴求ポイント調査
- マーケティング戦略の参考

**使い方**:
```
習慣形成アプリの競合（例: Streaks, Habitica）の
Facebook広告を抽出して、どんなメッセージが効いているか分析して。
```

### ⭐⭐ 高優先度（マーケティング・コンテンツ）

#### 3. **content-research-writer**
**用途**: ブログ記事・マーケティングコンテンツ作成
- Aniccaの機能紹介記事
- 習慣形成に関する教育コンテンツ
- アプリストア説明文の改善

**使い方**:
```
Aniccaの新機能について、ユーザー向けのブログ記事を書いて。
音声対話で習慣を整えるメリットを説明して。
```

#### 4. **meeting-insights-analyzer**
**用途**: ユーザーインタビューや会議の分析
- ユーザーフィードバックの分析
- チームミーティングの改善
- カスタマーサポート品質向上

**使い方**:
```
ユーザーインタビューのトランスクリプトを分析して、
Aniccaの改善点を特定して。
```

#### 5. **changelog-generator**
**用途**: リリースノートの自動生成
- App Store向け更新履歴
- ユーザー向け変更ログ
- 開発チーム向けリリースノート

**使い方**:
```
過去1週間のGitコミットから、ユーザー向けの変更履歴を作成して。
```

### ⭐ 中優先度（開発・デザイン）

#### 6. **brand-guidelines**
**用途**: Aniccaブランドの一貫性維持
- マーケティング資料のデザイン統一
- アプリストアスクリーンショット作成
- プレゼン資料作成

#### 7. **canvas-design**
**用途**: マーケティング画像・ポスター作成
- SNS投稿用画像
- プレゼン資料
- マーケティング素材

#### 8. **mcp-builder**
**用途**: Anicca用MCPサーバー開発
- 既存のMCPサーバー拡張
- 新しい統合の開発

#### 9. **webapp-testing**
**用途**: ランディングページのテスト
- `apps/landing`のテスト自動化
- UI動作確認

---

## 🚀 Anicca専用スキルを作るなら

### 提案1: **anicca-user-research**
**目的**: Aniccaユーザーの行動パターン分析
- 音声セッションのログ分析
- 習慣達成率の分析
- ユーザージャーニー分析

### 提案2: **anicca-content-generator**
**目的**: Anicca向けコンテンツ自動生成
- 習慣タイプ別プロンプト生成
- ユーザー向けメッセージ作成
- 通知メッセージ最適化

### 提案3: **anicca-app-store-optimizer**
**目的**: App Store最適化
- アプリ説明文の改善
- キーワード最適化
- スクリーンショット提案

---

## 📖 スキルの使い方

### Claude Codeで使う場合

1. **スキルを配置**:
```bash
mkdir -p ~/.config/claude-code/skills/
cp -r awesome-claude-skills/lead-research-assistant ~/.config/claude-code/skills/
```

2. **Claude Code起動**:
```bash
claude
```

3. **自動的に読み込まれる**:
- 関連するタスクを話しかけると自動的にスキルが有効化される

### Claude.aiで使う場合

1. スキルアイコン（🧩）をクリック
2. マーケットプレイスから追加、またはカスタムスキルをアップロード
3. Claudeが自動的に関連スキルを使用

---

## 💡 次のステップ

1. **すぐに試す**: `lead-research-assistant`でAniccaの潜在顧客をリサーチ
2. **マーケティング強化**: `competitive-ads-extractor`で競合分析
3. **コンテンツ作成**: `content-research-writer`でブログ記事作成
4. **カスタムスキル作成**: `skill-creator`を使ってAnicca専用スキルを作る

---

## 📚 参考リンク

- [Claude Skills公式ブログ](https://claude.com/ja-jp/blog/skills)
- [Skills API Documentation](https://docs.claude.com/en/api/skills-guide)
- [Creating Custom Skills](https://support.claude.com/en/articles/12512198-creating-custom-skills)
- [Awesome Claude Skills](https://github.com/ComposioHQ/awesome-claude-skills)
- [Anthropic Skills Repository](https://github.com/anthropics/skills)

---

**作成日**: 2025-01-XX
**目的**: AniccaプロジェクトでのClaude Skills活用ガイド





