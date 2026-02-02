# デプロイルール

## 1. 実機デプロイ自動化

**テスト完了後、Xcode を開かずに実機にデプロイする。**

### 前提条件

```bash
# ios-deploy インストール（初回のみ）
brew install ios-deploy

# 動作確認
ios-deploy --detect  # 接続中の iPhone を検出
```

### 自動デプロイコマンド

```bash
# ステージングスキームで実機にインストール
cd aniccaios && fastlane build_for_device

# 実機未接続でエラーの場合 → シミュレータで確認
cd aniccaios && fastlane build_for_simulator
# シミュレータで起動後、ユーザーに確認依頼
```

### ワークフロー

```
Unit Tests PASS
    ↓
Integration Tests PASS
    ↓
Maestro E2E Tests PASS（シミュレータ）
    ↓
「全テスト PASS しました。実機/シミュレータにインストールしますか？」
    ↓
【ユーザーが選択】
  - 実機にインストール
  - シミュレータで確認
  - 今はスキップ
    ↓
【実機選択 & 未接続の場合】→ シミュレータにフォールバック提案
    ↓
ビルド & インストール実行
    ↓
ユーザーに報告 + チェックリスト提示
    ↓
ユーザーが確認 →「OK」
    ↓
dev にマージ
```

### デプロイ前の確認（必須）

**エージェントはテスト完了後、必ずユーザーに確認を取ってからデプロイする。**

なぜ確認が必要か:
- 他のブランチ/Worktree で作業中の可能性
- ビルドに 2-3 分かかる（待ち時間の無駄を避ける）
- デバイスが接続されていない可能性

確認メッセージの例:
```
全テスト PASS しました。

実機にインストールしますか？
- 実機にインストール（接続済み: iPhone 15 Pro）
- シミュレータで確認
- 今はスキップ（後で /deploy で実行可能）
```

**重要**:
- エージェントが自分でコマンドを実行する（ユーザーに実行させない）
- **デプロイ前に必ず確認を取る**（勝手にビルド開始しない）
- 実機未接続 → シミュレータにフォールバック提案
- 実機必須の機能（通知タップ、センサー等）の場合のみ実機を強く推奨
- TestFlightは最終確認・配布用。開発中は build_for_device または build_for_simulator

---

## 2. Landing Page (Netlify) デプロイルール

**確認前に dev にマージ/push するのは禁止。**

### 重要: dev push = 自動デプロイ

**dev ブランチに push すれば Netlify は自動でビルド・デプロイする。**

| やること | 結果 |
|---------|------|
| dev に push | 自動でビルド・デプロイ |
| `netlify status` で確認 | 無駄（push すれば動く） |
| API で deploy 状態確認 | 無駄（push すれば動く） |

**エージェントがやるべきこと:**
1. `apps/landing/` 内のファイルを変更
2. commit & push to dev
3. 完了。それだけ。

### ワークツリーでの作業フロー

```
1. ワークツリー作成: git worktree add ../anicca-landing -b feature/landing-xxx
2. 変更完了 → cd apps/landing && npx netlify deploy --build（プレビュー）
3. プレビュー URL で確認
4. OK → ユーザー確認 → dev にマージ
5. dev push → 本番自動デプロイ
```

### Netlify CLI 必須

| コマンド | 用途 |
|---------|------|
| `npx netlify deploy --build` | プレビューデプロイ（確認用） |
| `npx netlify deploy --build --prod` | 本番デプロイ |

**理由:** CLI を使わないとビルドエラーが見えない。push だけだとユーザーがログを確認する手間がかかる。

### Netlify ビルドエラー時

| エラー | 原因 | 解決策 |
|--------|------|--------|
| `No url found for submodule` | 壊れた submodule 参照 | `git rm --cached <path>` + `.gitignore` 追加 |
| `Canceled: no content change` | landing 内容が変わってない | 正常。ファイル変更して再 push |

---

## 3. App Store リンクルール

**直接 URL ではなくリダイレクト URL を使う。**

| パターン | 判定 |
|---------|------|
| `https://apps.apple.com/us/app/xxx/id123` | NG |
| `https://aniccaai.com/app` | OK |

**理由:** アプリ名が変わっても URL が壊れない。`/app` ルートがリダイレクトを担当。

---

## 4. リリース手順（完全自動化）

ユーザーが「X.Y.Z をリリースして」と言ったら、エージェントが以下を実行:

```bash
# 1. main を最新にして release ブランチ作成
git checkout main && git pull origin main
git checkout -b release/X.Y.Z

# 2. バージョン更新（必須: 忘れると Apple Validation エラー）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane set_version version:X.Y.Z

# 3. コミット & プッシュ
cd .. && git add -A && git commit -m "chore: bump version to X.Y.Z

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
git push -u origin release/X.Y.Z

# 4. 全自動リリース（Archive → Upload → 処理待ち → 審査提出）
cd aniccaios && FASTLANE_SKIP_UPDATE_CHECK=1 FASTLANE_OPT_OUT_CRASH_REPORTING=1 fastlane full_release

# 5. 結果報告
# 「Build #XX (vX.Y.Z) が審査に提出されました。Waiting for Review です。」

# 6. release → dev にマージ（バージョン更新を同期）
cd .. && git checkout dev && git merge release/X.Y.Z && git push origin dev
```

### リリースエラー時のリカバリ

| エラー | 原因 | 対処 |
|--------|------|------|
| `Invalid Pre-Release Train` | バージョンが古い/閉じている | `fastlane set_version version:正しいバージョン` で修正 |
| `CFBundleShortVersionString must be higher` | バージョンが前回以下 | バージョン番号を上げて再実行 |
| build 失敗 | コンパイルエラー | Fastlane CLI 出力を読んで修正 → `fastlane full_release` 再実行 |
| upload 失敗 | ネットワーク/認証 | `cd aniccaios && fastlane upload` を再実行 |
| processing タイムアウト | Apple 側の遅延 | ASC で確認 → `fastlane submit_review` を個別実行 |
| submit 失敗 | コンプライアンス問題 | ASC で確認 → Fastfile の `submission_information` 修正 |

### ロールバック手順

```bash
git checkout dev
git branch -D release/X.Y.Z
git push origin --delete release/X.Y.Z
```
