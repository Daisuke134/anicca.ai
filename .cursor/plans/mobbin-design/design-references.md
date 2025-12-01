# Mobbin Design References - デザイン参考資料

## 概要

このドキュメントには、Mobbin CommunityのFigmaデザインから取得した参考資料をまとめています。
Anicca iOSアプリのUI改善時に参考にするためのデザイン情報です。

**Figmaファイル**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?m=dev

---

## デザイン1: 画像背景 (Node ID: 2:11)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=2-11&m=dev

**説明**: 
- 単色の背景画像
- 上部から下部へ微妙なピーチ色のグラデーション
- 暖かく柔らかいオレンジがかった色合い

**用途**: 
- 背景デザインの参考
- カラーパレットの参考

---

## デザイン2: 習慣設定画面 - ライトテーマ (Node ID: 6:2)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-2&m=dev

**画面構成**:

### ヘッダー
- 時刻表示: "9:41" (左上)
- iOSステータスバーアイコン (右上)
- ナビゲーションバー: 戻るボタン ← | "HABIT SETTINGS" | 閉じるボタン X

### 習慣の説明文
- テキスト: "I will walk for 15mins, every day at 6pm so that I can become a more fit and healthy individual"
- 一部のテキストが下線付き（編集可能なフィールドを示唆）

### Repeat（繰り返し）セクション
- ラベル: "Repeat" (左)
- 指示: "Choose at least 1 day" (右)
- 曜日ボタン: S, M, T, W, T, F, S (7つの円形ボタン)
  - 未選択: 薄いグレー背景、濃いグレーテキスト
  - 選択: 白背景、濃いグレーテキスト、4pxボーダー

### Habit Time（習慣時刻）セクション
- ラベル: "Habit time" (左)
- 時刻ボタン: "12:30PM" (角丸の矩形ボタン)
- 追加ボタン: "+" アイコン + "Add" テキスト

### Send Reminder（リマインダー送信）セクション
- ラベル: "Send reminder" (左)
- トグルスイッチ: 緑色、ON状態
- 設定ボタン: "At the habit time" + 右矢印アイコン

### Create Habit（習慣作成）ボタン
- 大型の角丸矩形ボタン
- テキスト: "Create habit"
- 背景色: #dddcd6 (薄いベージュ)
- ボーダー: #c8c6bf (3px)
- テキスト色: #898783 (グレー)

### フッター
- ダークグレーのバー
- 左: "Atoms" ロゴ
- 右: "curated by Mobbin" + Mobbinロゴ

**デザインの特徴**:
- 背景色: #f8f5ed (オフホワイト/ベージュ)
- クリーンでミニマルなデザイン
- 明確な階層構造

---

## デザイン3: 習慣設定画面 - スクリーンショット (Node ID: 6:86)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-86&m=dev

**説明**: 
- 実際のアプリスクリーンショット
- デザイン2の実装例

---

## デザイン4: 習慣設定画面 - ダークテーマ (Node ID: 6:84)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-84&m=dev

**画面構成**:

### ヘッダー
- 時刻表示: "9:41"
- iOSステータスバー
- ナビゲーションバー: ← | "HABIT SETTINGS" | X

### 習慣の説明文
- "I will walk for 15mins, every day at 6pm so that I can become a more fit and healthy individual"
- 一部のテキストが下線付き（編集可能フィールド）

### Repeat（繰り返し）セクション
- ラベル: "Repeat" (左)
- テキスト: "Daily" (右) - 全曜日選択時
- 曜日ボタン: S, M, T, W, T, F, S
  - **選択状態**: ダークグレー背景 (#222222)、白テキスト、ボーダーあり

### Habit Time（習慣時刻）セクション
- ラベル: "Habit time"
- 時刻ボタン: "6:00PM"
- 追加ボタン: "+" + "Add"

### Send Reminder（リマインダー送信）セクション
- ラベル: "Send reminder"
- トグルスイッチ: 緑色、ON
- 設定ボタン: "At the habit time" + 右矢印

### Create Habit（習慣作成）ボタン
- 大型の角丸矩形ボタン
- テキスト: "Create habit"
- **背景色: #222121 (ダークグレー)**
- **テキスト色: #e1e1e1 (ライトグレー)**

### フッター
- ダークグレーのバー
- "Atoms" + "curated by Mobbin"

**デザインの特徴**:
- 背景色: rgba(246,245,236,0.99) (薄いベージュ)
- ダークテーマのボタンとコントロール
- コントラストが高い

---

## デザイン5: 習慣設定画面 - リマインダー設定ドロップダウン (Node ID: 6:162)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-162&m=dev

**画面構成**:

### リマインダー設定ドロップダウン（開いた状態）
- 選択中: "At the habit time" (チェックマーク付き)
- オプション:
  - "5 minutes before"
  - "10 minutes before"
  - "15 minutes before"
  - "30 minutes before"

**その他の要素**:
- 習慣設定画面の基本レイアウトはデザイン4と同様
- ドロップダウンメニューのデザインパターンが参考になる

---

## デザイン6: Streaks画面 - スクリーンショット (Node ID: 6:249)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-249&m=dev

**説明**: 
- Streaks画面の実装例スクリーンショット

---

## デザイン7: Streaks画面 - 詳細デザイン (Node ID: 6:247)

**Figma URL**: https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?node-id=6-247&m=dev

**画面構成**:

### ヘッダー
- ステータスバー: "NO" "9:41" | "YES" + アイコン
- タイトル: "Streaks"
- Shareボタン: 上矢印アイコン + "Share" テキスト

### Streaksサマリー
- 大きな数字: "3" (現在のストリーク数)
- テキスト: "My best streak is 3 days on walk for 15mins"
- 一部のテキストが下線付き（編集可能フィールド）

### 個別のストリークリスト

各ストリーク項目の構成:
- **左側**: グラデーションアイコン（炎のような形状）
  - オレンジ→黄色
  - 水色→青
  - 緑→黄緑
  - オレンジ→赤
- **右側**: 
  - 太字: "X days in a row!" (ストリーク日数)
  - 通常: 習慣の説明文

**例**:
1. "3 days in a row!" / "Walk for 15mins" (オレンジ→黄色)
2. "2 days in a row!" / "Write one sentence" (水色→青)
3. "2 days in a row!" / "Take a deep breath" (緑→黄緑)
4. "1 day in a row!" / "Read 20 pages" (オレンジ→赤)

### 下部ナビゲーションバー
- **Home**: 家アイコン + "Home" (非選択)
- **Progress**: 棒グラフアイコン + "Progress" (選択中、黒い下線)
- **Mindset**: 本アイコン + "Mindset" (非選択、通知バッジ "1" 付き)

### フッター
- ダークグレーのバー
- "Atoms" + "curated by Mobbin"

**デザインの特徴**:
- カードベースのレイアウト
- グラデーションアイコンで視覚的な魅力を追加
- 明確な情報階層
- ストリーク数の強調表示

---

## デザイン要素のまとめ

### カラーパレット

**ライトテーマ**:
- 背景: #f8f5ed, rgba(246,245,236,0.99)
- ボタン背景（未選択）: #e9e6e0, #fcfcfc
- ボタン背景（選択）: #222222, #222121
- テキスト（通常）: #393634, #3e3c39, #373532
- テキスト（ボタン）: #898783, #e1e1e1
- ボーダー: #c8c6bf, #f2f0ed

**ダークテーマ**:
- ボタン背景: #222222, #222121
- テキスト: #e1e1e1, #e6e6e6, #e0e0e0
- ボーダー: #757370, #787673, #7c7a77

### タイポグラフィ

**フォント**: Inter
- Bold: 見出し、強調テキスト
- Semi_Bold: サブ見出し、ラベル
- Regular: 本文
- Medium: ナビゲーションラベル

**フォントサイズ例**:
- タイトル: 44.7px - 50.3px
- 見出し: 42.8px - 49.8px
- 本文: 37.8px - 48.8px
- ラベル: 29.4px - 30.9px

### コンポーネントパターン

1. **角丸ボタン**
   - 角丸半径: 36px - 76px
   - パディング: 適切な余白

2. **曜日選択ボタン**
   - 円形: 145px × 145px
   - ボーダー: 4px
   - 選択状態で色が変わる

3. **カードレイアウト**
   - 角丸: 37px - 87px
   - 背景色: #fdfcfc, #fcfcfb
   - 影: 適切なシャドウ

4. **グラデーションアイコン**
   - 炎のような形状
   - カラフルなグラデーション
   - ストリークの視覚的表現

### レイアウトパターン

1. **セクション構造**
   - ラベル（左）+ コントロール（右）
   - 明確な視覚的階層

2. **リスト表示**
   - カードベース
   - アイコン + テキストの組み合わせ
   - 適切な間隔

3. **ナビゲーション**
   - タブバー（下部）
   - 選択状態の視覚的フィードバック
   - 通知バッジのサポート

---

## Anicca iOSアプリへの適用可能性

### 適用可能な要素

1. **習慣設定画面の改善**
   - より洗練されたレイアウト
   - 曜日選択UIの改善
   - 時刻選択UIの改善

2. **Streaks機能の追加**
   - ストリーク表示画面
   - グラデーションアイコン
   - カードベースのリスト表示

3. **ナビゲーションの改善**
   - タブバーのデザイン
   - 選択状態の視覚的フィードバック

4. **カラーパレットの統一**
   - ライト/ダークテーマのサポート
   - 一貫したカラースキーム

5. **タイポグラフィの改善**
   - Interフォントの使用検討
   - フォントサイズの階層化

### 注意点

- 既存のAniccaのブランドアイデンティティを維持
- 機能要件に合わせた適応が必要
- 実装前にデザインシステムの検討が必要

---

## 参考リンク

- [Figmaデザイン](https://www.figma.com/design/ofMTWHWaKsIFuuAP1vhvoT/Mobbin--Community-?m=dev)
- [Mobbin Community](https://mobbin.com/)

---

**最終更新**: 2025-01-XX
**メンテナー**: Anicca開発チーム

