# Anicca OpenClaw Setup - Status Quo

**最終更新**: 2026-02-05 20:20
**ステータス**: 設定完了、RC/Mixpanel問題調査中

---

## 1. OpenClaw Gateway

| 項目 | 値 |
|------|-----|
| **バージョン** | 2026.2.2-3 |
| **ポート** | 18789 |
| **起動方法** | LaunchAgent (`~/Library/LaunchAgents/ai.openclaw.gateway.plist`) |
| **接続モード** | Socket Mode |

### 起動コマンド

```bash
# 起動
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist

# 再起動
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

# ステータス確認
openclaw status
```

---

## 2. Slack連携

### チャンネル設定

| チャンネル | ID | 用途 | requireMention |
|-----------|-----|------|----------------|
| #metrics | C091G3PKHL2 | 日次メトリクス投稿 | true |
| #ai | C08RZ98SBUL | 開発・テスト | true |

### Slack Manifest必須設定（重要！）

**Event Subscriptions** が必要。これがないと @mention が動作しない。

```yaml
# Slack App Manifest
event_subscriptions:
  bot_events:
    - app_mention
    - message.channels
    - message.groups
    - message.im
    - message.mpim
```

### トークン

| トークン | 場所 |
|---------|------|
| Bot Token (`xoxb-...`) | `~/.openclaw/openclaw.json` → `channels.slack.botToken` |
| App Token (`xapp-...`) | `~/.openclaw/openclaw.json` → `channels.slack.appToken` |

---

## 3. 環境変数

### 設定場所

`~/Library/LaunchAgents/ai.openclaw.gateway.plist` の `EnvironmentVariables` セクション

### 必要な環境変数

| 変数 | 用途 | 設定状態 |
|------|------|---------|
| `OPENAI_API_KEY` | OpenAI API | ✅ 設定済み |
| `MIXPANEL_PROJECT_ID` | Mixpanel プロジェクト (3970220) | ✅ 設定済み |
| `MIXPANEL_API_SECRET` | Mixpanel API Secret | ✅ 設定済み |
| `REVENUECAT_V2_SECRET_KEY` | RevenueCat V2 API Secret | ✅ 設定済み |

### 環境変数診断コマンド

```bash
# Gatewayプロセスに環境変数が渡っているか確認
launchctl print gui/$(id -u)/ai.openclaw.gateway | grep -E "REVENUECAT|MIXPANEL|OPENAI"
```

---

## 4. エージェント設定

```json
{
  "agents": {
    "list": [{
      "id": "anicca",
      "default": true,
      "name": "Anicca Bot",
      "identity": {
        "name": "Anicca",
        "emoji": "🧘"
      },
      "groupChat": {
        "mentionPatterns": ["@anicca", "anicca", "Anicca", "@Anicca"]
      }
    }]
  }
}
```

---

## 5. スキル

### 有効なスキル

| スキル | パス | 状態 |
|--------|------|------|
| daily-metrics-reporter | bundled (`/opt/homebrew/lib/node_modules/openclaw/skills/`) | ✅ 有効 |

### 重要: スキルバージョン問題

**ユーザー版スキル（`~/.openclaw/workspace/skills/daily-metrics-reporter/`）は削除すること！**

理由: ユーザー版にはRevenueCat Part 2が欠落している。OpenClaw bundled版を使用する。

```bash
# ユーザー版スキルを削除
rm -rf ~/.openclaw/workspace/skills/daily-metrics-reporter
```

---

## 6. Cronジョブ

| ジョブ | スケジュール | タイムゾーン | 内容 |
|--------|------------|------------|------|
| daily-metrics-reporter | 0 9 * * * | Asia/Tokyo | 毎朝9時にSlack #metricsに投稿 |

---

## 7. 既知の問題と解決策

### 問題1: RC/Mixpanel APIが動作しない

**根本原因（調査結果）:**
1. 環境変数がGatewayプロセスに渡っていない可能性
2. ユーザー版スキルにRevenueCat Part 2が欠落
3. レート制限（RevenueCat: 5 req/min）

**解決策:**
1. `launchctl print`で環境変数を診断
2. ユーザー版スキルを削除
3. Gateway再起動

### 問題2: @mention が動作しない

**原因:** Slack App ManifestにEvent Subscriptionsがない

**解決策:** Slack API ConsoleでEvent Subscriptionsを追加

---

## 8. 推奨設定（ベストプラクティス）

```json
{
  "session": {
    "dmScope": "per-channel-peer",
    "reset": { "idle": 60 }
  },
  "logging": {
    "redactSensitive": "tools"
  },
  "channels": {
    "slack": {
      "historyLimit": 25
    }
  }
}
```

| 設定 | 値 | 理由 |
|------|-----|------|
| dmScope | per-channel-peer | プライバシー保護 |
| session.reset | idle: 60 | 60分idle後リセット（公式推奨） |
| logging.redactSensitive | tools | APIキーがログに漏れない |
| historyLimit | 25 | トークンコスト削減 |

---

## 9. テストコマンド

```bash
# Slack @mention テスト
# Slack #metricsで: @Anicca MRRを教えて

# API直接テスト（環境変数経由）
curl -s "https://api.revenuecat.com/v2/projects/projbb7b9d1b/metrics/overview" \
  -H "Authorization: Bearer $REVENUECAT_V2_SECRET_KEY"

curl -s "https://mixpanel.com/api/2.0/events?project_id=$MIXPANEL_PROJECT_ID&event=%5B%22first_app_opened%22%5D&from_date=$(date -v-7d +%Y-%m-%d)&to_date=$(date +%Y-%m-%d)&unit=day" \
  --user "$MIXPANEL_API_SECRET:"
```

---

## 10. 次のステップ

1. [ ] 環境変数診断（Step 2.1）
2. [ ] ユーザー版スキル削除（Step 2.0）
3. [ ] ベストプラクティス設定適用（Step 3）
4. [ ] Gmail統合（Step 5）
5. [ ] LINE統合（Step 6）
