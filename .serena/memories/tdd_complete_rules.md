# TDD実践規約

## 正本
テスト方針の詳細は `.claude/rules/testing-strategy.md` を参照（単一正本）。

## TDDサイクル
1. **RED** — 失敗するテストを書く（入出力ペアを明確化）
2. **GREEN** — テストを通す最小実装
3. **REFACTOR** — リファクタリング（テストが通る状態を維持）

## テストツール
| レイヤー | ツール | 比率 |
|---------|--------|------|
| Unit | Swift Testing (#expect) / XCTest | 70% |
| Integration | XCTest + Mock | 20% |
| E2E | Maestro | 10% |

## 実行コマンド
```bash
cd aniccaios && fastlane test  # Unit/Integration
maestro test maestro/           # E2E
```
xcodebuild直接実行は禁止。

## 意思決定ルール
- 選択肢提示禁止。最適解を自分で決める
- テストは変更した部分のみ（リグレッションテスト不要）
- カバレッジ目標: 80%

## Serena活用
- コード読み取り: `mcp__serena__find_symbol`, `get_symbols_overview`
- コード編集: `mcp__serena__replace_symbol_body`, `insert_after_symbol`