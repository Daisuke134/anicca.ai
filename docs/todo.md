

ーーー
```markdown
# 🎯 9月のゴール別タスク整理

法人向け行動変容エージェントの開発
## 会社 🏢 ９月ゴール: **契約を取って来れる行動変容エージェント開発**


---

## 大学院 🎓 ９月ゴール: **修論を終わらせる**　
- 修士論文執筆（毎週木曜日に進捗確認）  
- 大学院の授業申請（9/7）  
- コロキアム参加（対面）  

## Anicca 🚀 ９月ゴール: **利益を出す**

・自律行動（こんなニュース・イベントあったけど〜しませんか？→やっておきました）  →ユーザーがより仏教に近づける。
- 自律行動（こんなニュース・イベントあったけど〜しませんか？→やっておきました）  →ユーザーを引っ張ってくれる。
- 作業時の後回し解決（日中は画面情報ストリーム）→常にTODO通りにタスクができているように。

水曜日
- Anicca記事・スライド作成：AIのもたらす行動変容の未来について
- Promo動画撮影→Product Hunt/Xリリース　→収益を得る。
- Aniccaスライド発表（Youtube・AI会） →自分の考えを整理する。
- YC・Solo Founder応募 →考えの整理
- Slack mcp（チュートリアル→こう返信しますか？）→Slackからの連絡を全て把握・返信できる。
- Gmail mcp（チュートリアル→こう返信しますか？）→メールを全て把握・返信できる。
- exa mcp→最適なニュースをXから毎日教えてくれる＋技術調査＋ダンマパダの一節の読み上げ
- 記憶改善　→今日の予定くらいはいつでも完全に把握できているように。
- スマホ対応（起床声掛け）  
- 心理学における声掛けについて学ぶ
- ブラウザmcp →　瞑想会の申し込みも全部やってくれる。
- 決済mcp　→　寄付の最後までできるように。
- 音声でログイン・課金・起動制御（kamui参考） →トレイ不要に。
- ユーザー名修正。





ーーー
- アファメーション  （I Am AGI・自責）-> 僕だけように。
- 瞑想ガイド→瞑想をやりやすくする。
- 動画・画像・要件定義生成（kamui mcp）  
- 音声駆動開発（ai sdk） →スマホから音声だけでanicca開発
- イレブンmcp　→　慈悲の瞑想読み上げ
```

     - push 前の最新コミット: dcce9580bf8dc5e87e00ef727b57d577c006f6a0
  - 今回追加した最新コミット: b5cbfd553eaae5b08d5b968791c9855a9147fec5




> ノイズリダクション自動切替（最小構成）

  - 目的: macOS で「外部出力が接続されているか」をシステム設定から取得し、near / far を自動で切り替える。ユー
  ザーの入力もキーワード判定も不要。
  - 実装場所: すべてメインプロセス。新規ファイルは不要。system_profiler と
  systemPreferences.subscribeNotification を利用する。

  変更箇所

  1. apps/desktop/src/agents/sessionManager.ts
      - クラスフィールドに private currentNoiseProfile: 'near_field' | 'far_field' = 'near_field'; を追加。
      - setMode('conversation') 内の updateSessionConfig を下記へ差し替え。

        this.session?.transport?.updateSessionConfig({
          audio: {
            input: {
              turnDetection: {
                type: 'server_vad',
                threshold: 0.5,
                prefixPaddingMs: 300,
                silenceDurationMs: 500
              },
              noiseReduction: { type: this.currentNoiseProfile }
            }
          }
        });
      - クラス末尾付近へメソッドを追加。

        public updateNoiseProfile(next: 'near_field' | 'far_field') {
          if (this.currentNoiseProfile === next) return;
          this.currentNoiseProfile = next;
          if (this.mode === 'conversation' && this.session) {
            this.session.transport.updateSessionConfig({
              audio: { input: { noiseReduction: { type: next } } }
            });
          }
        }
  2. apps/desktop/src/main-voice-simple.ts
      - import に ipcMain, systemPreferences、promisify、execFile を追加。
      - sessionManager 生成直後に sessionManager.updateNoiseProfile('near_field'); を一度呼ぶ。
      - initializeApp() の終盤（日常初期化後）に以下を挿入。

        const execFileAsync = promisify(execFile);

        async function detectNoiseProfile(): Promise<'near_field' | 'far_field'> {
          if (process.platform !== 'darwin') return 'near_field';
          const { stdout } = await execFileAsync('system_profiler', ['-json', 'SPAudioDataType']);
          const data = JSON.parse(stdout);
          const items = data?.SPAudioDataType?.[0]?._items ?? [];
          const defaultDevice = items.find(
            (item: any) => item.coreaudio_default_audio_output_device === 'spaudio_yes'
          );
          const outputSource = defaultDevice?.coreaudio_output_source || '';
          return outputSource === 'Headphones' ? 'near_field' : 'far_field';
        }

        async function refreshNoiseProfile() {
          const profile = await detectNoiseProfile().catch(() => 'near_field');
          sessionManager?.updateNoiseProfile(profile);
        }

        if (process.platform === 'darwin') {
          systemPreferences.subscribeNotification('com.apple.audio.systemoutputchanged', () => {
            void refreshNoiseProfile();
          });
          void refreshNoiseProfile();
        }
      - これで macOS がデフォルト出力を「ヘッドフォン」と判定した瞬間 near、それ以外（内蔵スピーカー等）は far
  に切り替わる。system_profiler の coreaudio_output_source は Apple が定義しており、「Headphones」「Internal
  Speakers」などの定型文字列なので冗長な名前判定は不要。
  3. 他プラットフォーム
      - 上記コードは macOS 以外では簡潔に near_field 固定。Windows 等へ展開する場合は同関数内に OS 依存処理を追
  加する（指示があれば対応）。

  オンボーディング状態ファイル

  - 初期値: {"current_step":"1","completed":false}。
  - ステップ完了ごとに current_step を "2-1"→"2-2"→…"6" と進め、締めで {"current_step":"done","completed":true}。
  - 途中で中断しても read_file ~/.anicca/onboarding_state.json により必ず未完ステップだけが走る。
  - 各ステップで曖昧返答があれば「もう一度お願いできますか？」→部分確認→解決後に edit_file で進める。質問のやり
  直しでも current_step は維持するため順番は乱れない。

  修正版 apps/desktop/prompts/onboarding.txt
  （前回提示した全文のとおり。再掲の必要があれば指示してください。）

  以上が冗長性を排除した最小構成の手順です。必要な列挙は Apple が提供する coreaudio_output_source の値
  （Headphones / Internal Speakers 等）だけであり、ユーザー名や機器名には依存しません。


Text-to-Speech 削除のための変更箇所
3. apps/desktop/src/agents/tools.ts

- 行 295-350 の text_to_speech ツール定義ブロックを削除。
- 行 544-562 の allTools 配列から text_to_speech を除去。
- 削除後、余った連番コメントを整える。

4. apps/desktop/src/agents/sessionManager.ts
    - 行 52-58 の ElevenLabs 用メンバ変数を削除し、関連する import もないか確認。
    - 行 633-646 の /elevenlabs/status ルートを削除。
    - 行 684-744 付近の WebSocket 処理から this.isElevenLabsPlaying での送信抑止や慈悲タスク特別処理ログを削除。
    - 行 1008-1216 周辺の “ElevenLabs 再生中” 分岐、クールダウン管理、agent_tool_start/agent_tool_end でのブロッ
ク／elevenlabs_audio ブロードキャスト処理を全て除去。
    - agent_tool_end 内の this.broadcast({ type: 'elevenlabs_audio', ... }) を削除し、跡に残るコメント・カンマを
調整。
    - 残る isElevenLabsPlaying 参照がないことを確認し、関連ログも消す。
5. apps/desktop/src/main-voice-simple.ts 前半の埋め込みブラウザスクリプト
    - 行 401 のコメントから ElevenLabs 記述を削除し、不要変数（isSystemPlaying, micPaused の用途が Elevent限定な
ら整理）を見直す。
    - 行 598-700 の message.type === 'elevenlabs_audio' ブロック全体と fetch('/elevenlabs/status', ...) 呼び出し
を削除。
    - これに伴い、audio.onerror など ElevenLabs 固有処理も除去し、残った処理が破綻しないよう audioQueue 再生部分
だけ残す。
6. apps/desktop/src/agents/mainAgent.ts
    - 行 92, 97, 102 の “text_to_speech” 関連文を削除または「自分の声のみで読み上げる」旨に一本化。
    - 行 120-128 の「【音声合成（text_to_speech）】」セクションを丸ごと削除。
    - ツールリストから text_to_speech を削除し、番号を詰めて再表記。
    - apps/api/package-lock.json 内の該当ノードを手で除外（node_modules/@elevenlabs/elevenlabs-js など）。
    - apps/api/src/api/mcp/config.js が参照していた環境変数のドキュメントがあれば更新。
13. 残存確認
    - rg "elevenlabs" / rg "text_to_speech" で再チェックし、上記以外のハードコードが残っていないことを確認。
    - Electron 側で ElevenLabs 再生状態通知を送っていた箇所がなくなるため、tray や UI に影響がないかログコメント
を差し替える。