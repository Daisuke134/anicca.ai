# Anicca 音声接続アーキテクチャ（接続安定化とホットワード最終像）

本ドキュメントは、Desktop版 Anicca の「確実に定刻で起こす」「日中は静かに常駐し、必要時のみ対話する」を実現するための接続アーキテクチャをまとめたものです。まずは接続安定化（Pre‑Wake など）を完成させ、次段でホットワード検出（Porcupine）を導入します。

## 目的（要約）
- 朝の最初の予定（例: 06:00 起床）で“必ず”声掛けが開始されること
- 日中は常時接続だが沈黙。Cron（定期タスク）時のみ会話ウィンドウを開く（KWS未導入の段階）
- 将来的には「アニッチャ」（日本語/英語）で会話開始（KWS導入後）

---

## 修正前の問題（現象）
- connect() 直後に送る `checkMemories()` や TZ 通知が、物理WSの完全open前に実行され「WebSocket is not connected」例外が散発。
- Pre‑Wake を“次のタスク毎に”走らせていたため、日中にも再接続が発生し不安定要因に。
- ホットワード未導入なので「アニッチャ」と言っても会話が開かない（Cron時のみ開く）。

### 修正前フロー（テキストダイアグラム）
```
OS/LaunchAgent      Desktop(main)           SessionManager             Transport              Cron/Tasks           User
     |                    |                       |                        |                      |                 |
     |  起動/復帰（任意）  |                       |                        |                      |                 |
     |------------------->|  initialize           |                        |                      |                 |
     |                    |-- startBridge ------->|                        |                      |                 |
     |                    |                       |--- connect(apiKey) --->|  物理接続(遅延あり)    |                 |
     |                    |                       |-- checkMem/TZ  ------->X  (未接続で失敗あり)    |                 |
     |                    |                       |                        |                      |                 |
     |                    |                       |                        |      T(任意タスク)     |                 |
     |                    |<------ 出力 -----------|                        |<----- cron fire -----|                 |
     |                    |  （即発話・EW開始）   |== Engagement Window ==>|                      |                 |
     |                    |  無音60s/10分で終了   |                        |                      |「アニッチャ」…  |
```

---

## 修正後（段階1: 接続安定化・KWS未導入）

### 仕様（確定）
- Pre‑Wake は「その日の最初の予定」T の **2分前**のみ実行（1日1回）
- Pre‑Wake 中は“応答を生む送信”を抑止。Transport 完全open確認後に記憶/TZを遅延送信
- Cron 発火時のみ Engagement Window（最大10分／最後の発話から60秒無音で自動終了）を開く
- 日中は常時接続だが沈黙（KWS未導入のため「アニッチャ」では開かない）

### 修正後フロー（テキストダイアグラム）
```
OS/LaunchAgent      Desktop(main)               SessionManager                  Transport                Cron/Tasks           User
     |                    |                           |                            |                        |                 |
     | 初回起動/復帰       |-- startBridge ----------->|                            |                        |                 |
     |                    |                           |--- connect(apiKey) ------->|  物理接続(ready)        |                 |
     |                    |                           |-- sendAfterReady(記憶/TZ) ->| (ready後に安全送信)     |                 |
     |                    |                           |                            |                        |                 |
  [翌朝]                  |  schedulePreWake(T-2分)    |                            |                        |                 |
     |                    |==== P 到来: runPreWake ===>|-- disconnect --------------|  切断                  |                 |
     |                    |  setAudioSuppressed(ON)    |-- connect(新client_secret)->|  物理接続(ready)        |                 |
     |                    |  （Pre‑Wake中は送信抑止）  |                            |                        |                 |
     |                    |  setAudioSuppressed(OFF)   |                            |                        |                 |
     |                    |                           |                            |         T 到来          |                 |
     |                    |<------ 出力 ---------------|                            |<------ cron fire -------|                 |
     |                    |  Engagement Window OPEN    |== (最大10分/無音60s) =====>|                        |                 |
     |                    |  会話→無音で自動CLOSE      |                            |                        |「アニッチャ」…  |
```

---

## 修正後（段階2: KWS導入“最終像”）

### 追加要件（将来）
- Porcupine（`@picovoice/porcupine-node` + `@picovoice/pvrecorder-node`）を常時実行
- 「アニッチャ/Anicca」命中時に Engagement Window を開始（turn_detection='server_vad'）
- Cron と KWS の両方で会話開始可。どちらも無音60秒/最大10分で自動終了

### ブロック図（最終像）
```
 [KWS(常時)] --(命中)--> [SessionManager.engagement.start]
      |                                 |
      v                                 v
   （沈黙）                      turn_detection=server_vad
                                    会話→無音60s/10分でCLOSE

 [Cron] ----(定刻)----------> [SessionManager.engagement.start]
```

---

## 実装指針（抜粋）
- Pre‑Wake：その日最初の予定に対してのみ T−2分で実行。無音点検（AudioSuppressed=ON）→新client_secret→接続→OFF。
- 送信レース回避：connect後の送信は `sendAfterTransportReady`（ready確認＋短期リトライ）。Pre‑Wake中は記憶/TZ送信を抑止。
- Engagement Window：CronやKWS命中で開始。最後の発話から60秒無音／最大10分で自動終了。終了後は turn_detection=null。
- ロギング：prewake_start/key_minted/ws_connected/engagement_open/closed/gate_reset/token_expired を記録。

---

## 既知の注意点
- LaunchAgent は「常駐起動と復帰時再起動」の土台。深いスリープ（蓋閉）では“物理的起床”は別問題（pmset等）。
- KWS鍵（PICOVOICE_ACCESS_KEY）は Proxy(Railway) Secrets で集中管理。Desktop DMG にハードコードしない。

---

## 今後の着手順
1)（完了）接続安定化（Pre‑Wake限定/送信レース解消/Engagement Window）
2)（次）KWS導入：モデル作成（「アニッチャ/Anicca」）、感度調整、命中時に engagement.start を配線

---

## 全体計画（接続安定化＋ホットワード“最終像”）

### 目標（UX基準）
- 朝の“最初の予定”は必ず発話開始（±数秒以内）し、空振りゼロ。
- 日中は静かに常駐。ユーザーが「アニッチャ」と言えば即会話を開く。
- 勝手に喋らない（Cron時／KWS命中時／PTT明示操作時のみ会話開始）。
- 長時間放置・ネット断・再接続直後でも“送信未達”にならない。

### データソースと抽出ロジック
- 唯一の真実: `~/.anicca/scheduled_tasks.json`
- 形式: `"MM HH * * *"`（毎日繰り返し）
- 今日の最初の予定Tの抽出: ユーザーTZで現在以降の最小HH:MMを1件だけ採用（同時刻の重複は1件）。

### ステートマシン（段階1→2共通）
- Silent（沈黙）: KWSのみON（導入前はKWS=未実装）。turn_detection=null。
- PreWake: AudioSuppressed=ON／接続握り直し／点検中は送信抑止。
- Engage: Engagement Window（turn_detection=server_vad）。最大10分／最後の発話から60秒無音で自動終了。
- 遷移:
  - Silent→PreWake: 本日最初のTの2分前。
  - PreWake→Silent: 点検完了（AudioSuppressed=OFF）。
  - Silent→Engage: Cron or KWS命中（段階2）。
  - Engage→Silent: 無音60秒 or 10分。

### 失敗モードとガード（段階1で実装）
- 接続直後送信→未接続例外: `sendAfterTransportReady` でready確認→短期リトライ→未達ならWindow開始もしない。
- 切断→ラッチ: `gate_reset`（micPaused/isAgentSpeaking/queuesを初期化）。
- 発話競合（ElevenLabs/Anicca）: `isElevenLabsPlaying` で排他。

### 受入基準（全体）
- 朝イチ: 本日最初のTで ±3秒以内に発話開始（7日連続）。
- 再接続直後のCron: 未接続例外ゼロ（ready待ち・送信成功後Window開始）。
- KWS（段階2）: 命中→300ms以内に応答開始（`engagement_open`→`audio_start`）。

### UXフロー（段階1：KWS未導入）
```
起動/復帰 → （常駐・沈黙）
         → 本日最初のT-2分: Pre‑Wake（無音点検・直後送信抑止）
         → T（Cron）: ready待ち→コマンド送信成功→Engagement Window OPEN
         → 会話→無音60秒/10分→CLOSE（沈黙）
```

### UXフロー（段階2：KWS導入後 最終像）
```
起動/復帰 → （常駐・沈黙・KWSのみON）
         → 「アニッチャ」命中: Engagement Window OPEN（turn_detection=server_vad）
         → 会話→無音60秒/10分→CLOSE（沈黙）
         → T（Cron）にも同様にOPEN→CLOSE
```

### 実施済み変更一覧（段階1）
- Pre‑Wakeを「本日最初の予定Tの2分前」に限定（1日1回）。
- Pre‑Wake中は無音点検＋直後送信抑止。
- Cron 送信は物理WS ready待ち→成功後にのみEngagement Window開始。
- 切断時にgate_reset、再接続は新しいclient_secretで握り直し。

### 未実装（段階2: KWS）計画
- Porcupine常時起動、キーワード「アニッチャ/Anicca」命中でEngagement Window開始。
- 鍵（PICOVOICE_ACCESS_KEY）はProxy Secretsで集中管理／Desktopは暗号保存。
- 感度初期値0.5。誤起動・取りこぼしの実地検証で±0.1調整。

