---
name: Mixpanel朝会レポートシステム実装計画
overview: ""
todos: []
isProject: false
---

# Mixpanel朝会レポートシステム実装計画

## 概要

ユーザーが「朝会を開始」と入力すると、Mixpanelから前日のデータを自動取得してレポートを生成し、対話形式でメトリクスを確認できるシステムを構築します。

## アーキテクチャ

```
ユーザー入力「朝会を開始」
  ↓
Mixpanel MCP経由でデータ取得
  ↓
レポート生成（Markdown形式）
  ↓
レポートを表示して対話開始
  ↓
ユーザーとAIが対話しながらデータを確認
```

## 必要なファイル構成

### 1. レポート生成スクリプト

**ファイル**: `scripts/daily-standup/generate-report.js`

- Mixpanel MCP経由でデータ取得
- データ分析とレポート生成
- Markdownファイルとして保存
- 実行方法: `node scripts/daily-standup/generate-report.js`

### 2. レポート保存ディレクトリ

**ディレクトリ**: `docs/daily-standup/`

- 日付ごとのレポートを保存（例: `2025-01-03.md`）
- 必要に応じてサブディレクトリを作成

### 3. 設定ファイル

**ファイル**: `scripts/daily-standup/config.json`

- MixpanelプロジェクトID: 3970220
- 分析対象のイベント名
- 比較期間の設定（前日、前週、前月）

### 4. ユーティリティ関数

**ファイル**: `scripts/daily-standup/utils.js`

- データ取得のヘルパー関数
- レポート生成のヘルパー関数
- 日付処理のヘルパー関数

### 5. README

**ファイル**: `scripts/daily-standup/README.md`

- 使い方の説明
- 必要な設定の説明
- トラブルシューティング

### 6. package.json（必要に応じて）

**ファイル**: `scripts/daily-standup/package.json`

- 必要な依存関係（Mixpanel SDKなど、MCP経由の場合は不要かも）

## 実装に必要な要素

### 1. レポート生成機能

**場所**: `scripts/daily-standup/generate-report.js`（新規作成）

**機能**:

- Mixpanel MCP経由で前日のデータを取得
- 以下のメトリクスを分析：
  - インストール数（前日、前週、前月比較）
  - コンバージョン率（オンボーディング完了率）
  - DAU/MAU（日次/月次アクティブユーザー）
  - チャーン率（離脱率）
  - プロモーション動画の効果（UTMパラメータ別）
  - CPA/CPI（顧客獲得単価/インストール単価）

**データ取得方法**:

- `mcp_mixpanel_get_events`: イベント一覧取得
- `mcp_mixpanel_run_segmentation_query`: セグメンテーション分析
- `mcp_mixpanel_run_funnels_query`: ファネル分析
- `mcp_mixpanel_run_retention_query`: リテンション分析

### 2. レポート保存機能

**場所**: `docs/daily-standup/YYYY-MM-DD.md`（日付ごとに保存）

**形式**: Markdown形式で以下の構造：

```markdown
# 朝会レポート - 2025-01-03

## 前日（2025-01-02）のサマリー

### インストール数
- 前日: 15件（前日比 +3件、+25%）
- 前週平均: 12件
- 前月平均: 10件

### コンバージョン率
- オンボーディング完了率: 60%
- 前日比: +5%

### アクティブユーザー
- DAU: 42人（前日比 +5人）
- MAU: 180人

### チャーン率
- 前日: 2.3%（前日比 -0.5%）

### プロモーション動画の効果
- 「Anicca紹介動画」: インストール8件、コンバージョン率75%、CPA ¥450、CPI ¥300
```

### 3. 対話機能

**実装方法**: Cursorのチャット機能を使用

**フロー**:

1. ユーザーが「朝会を開始」と入力
2. AIが最新のレポートを読み込む（なければ生成）
3. AIがレポートのサマリーを表示
4. ユーザーとAIが対話しながらデータを確認
5. 必要に応じて追加の分析を実行

### 4. 必要な設定

**MixpanelプロジェクトID**: 3970220（既に確認済み）

**必要なMixpanelイベント**:

- `app_installed`: アプリインストール
- `onboarding_completed`: オンボーディング完了
- `session_started`: セッション開始
- `subscription_purchased`: サブスクリプション購入
- `video_viewed`: 動画視聴（UTMパラメータ付き）

## 実装ステップ

1. **ディレクトリ構造の作成**

   - `scripts/daily-standup/` ディレクトリを作成
   - `docs/daily-standup/` ディレクトリを作成

2. **設定ファイルの作成**

   - `config.json` にMixpanelプロジェクトIDとイベント設定を記述

3. **ユーティリティ関数の作成**

   - データ取得、分析、レポート生成のヘルパー関数を実装

4. **レポート生成スクリプトの作成**

   - Mixpanel MCP経由でデータ取得
   - データ分析とレポート生成
   - Markdownファイルとして保存

5. **対話機能の実装**

   - Cursorチャットで「朝会を開始」と入力した時にレポートを読み込む
   - レポートのサマリーを表示
   - 対話的なデータ確認機能

6. **テストと改善**

   - レポート生成のテスト
   - 対話フローのテスト
   - ユーザーフィードバックに基づく改善

## 使用技術

- **Mixpanel MCP**: データ取得（既に設定済み）
- **Node.js**: レポート生成スクリプト
- **Markdown**: レポート形式
- **Cursor Chat**: 対話機能

## 注意点

- Mixpanelのイベントが正しく設定されている必要がある
- UTMパラメータが正しく送信されている必要がある
- レポート生成は手動実行（ユーザーが「朝会を開始」と入力した時）