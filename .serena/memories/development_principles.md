# 開発原則 - 絶対に守るべきルール

作成日: 2025-08-21  
重要度: **最高**

## 🚨 絶対原則 - この世で一番大事なこと

### 1. 想像でコードを絶対に書かない

**絶対禁止**：
- 「たぶんこうだろう」でコードを書く
- 「きっとこれで動くはず」で実装する
- 「以前こうだったから」で判断する
- ドキュメントを確認せずに推測する

**必須行動**：
- **元のリポジトリを必ず確認**
- **公式ドキュメントを必ず読む**
- **実際のコード例を確認**
- **不明点を0にしてから実装**

### 2. 情報源の優先順位

1. **公式ドキュメント**（最優先）
2. **元のリポジトリのコード例**
3. **公式のサンプルコード**
4. **GitHub Issuesでの議論**
5. **型定義ファイル**

推測や記憶は情報源ではない。

### 3. 実装前の必須チェック

```markdown
□ 公式ドキュメントを確認した
□ 関連するコード例を見つけた
□ 型定義を確認した
□ 使用するAPIの正確な仕様を理解した
□ 不明点がゼロになった
```

**全てにチェックが入るまで実装開始禁止**

## 💡 具体的な実践方法

### APIを使う時

```typescript
// ❌ ダメな例（想像）
const server = new MCPServerStdio({
  command: 'some-command'  // 推測で書いた
});

// ✅ 良い例（確認済み）
// openai-agents-js/examples/mcp/filesystem-example.tsで確認
const server = new MCPServerStdio({
  fullCommand: 'npx -y @modelcontextprotocol/server-filesystem'  // 公式例から確認
});
```

### TypeScriptエラーが出た時

```typescript
// ❌ ダメな例（適当に修正）
const servers = [];  // エラーが出るけど無視

// ✅ 良い例（型定義を確認）
// @openai/agents-core/dist/index.d.tsで型を確認
const servers: MCPServerStdio[] = [];
```

### パッケージを使う時

1. **package.json確認**
2. **node_modules内の型定義確認**
3. **公式examplesフォルダ確認**
4. **README.md確認**

## 📚 今回の教訓（mcpServers.ts実装）

### 何が起きたか
1. 想像でElevenLabsのコードを書いた
2. 配列の型宣言を忘れた
3. 戻り値の型を間違えた

### 正しい方法だったら
1. `openai-agents-js/examples/mcp/`を最初に確認
2. 型定義ファイルで正確な型を確認
3. 一つずつ確認しながら実装

### 結果の違い
- **想像**: 数時間のデバッグ、複数のエラー
- **確認**: 10分で正確な実装完了

## 🔧 便利なコマンド（確認用）

### 型定義の確認
```bash
# パッケージ内の型定義を見る
find node_modules/@openai/agents -name "*.d.ts" | head -5

# 具体的な型を確認
cat node_modules/@openai/agents-core/dist/index.d.ts | grep -A5 "MCPServerStdio"
```

### サンプルコードの確認
```bash
# examplesフォルダを探す
find . -name "examples" -type d

# 特定のAPIの使用例を探す
grep -r "MCPServerStdio" examples/ --include="*.ts"
```

### 公式ドキュメントの確認
```bash
# READMEを確認
find . -name "README.md" | xargs grep -l "MCP"
```

## 🚨 緊急時の行動指針

### エラーが出た時
1. **絶対に推測で修正しない**
2. エラーメッセージを完全に読む
3. 関連する公式ドキュメント/コードを探す
4. 正確に理解してから修正

### 新しい機能を追加する時
1. **絶対に想像で書かない**
2. 同じ機能の既存実装を探す
3. 公式の推奨方法を確認
4. 段階的に実装してテスト

### 時間がない時でも
- **確認を省略しない**
- **推測で書かない**
- **急がば回れが結果的に最速**

## 📖 参考にすべきリポジトリ

### OpenAI Agents JS
- リポジトリ: `/Users/cbns03/Downloads/anicca-project/openai-agents-js/`
- 特に重要: `examples/` フォルダ
- 型定義: `node_modules/@openai/agents*/dist/*.d.ts`

### Serena
- リポジトリ: `https://github.com/oraios/serena`
- 使用例: `examples/` 各種ファイル
- ツール定義: `src/serena/tools/`

## 🎯 今後の改善

1. **実装前チェックリストの徹底使用**
2. **不明点があったら即座に調査**
3. **推測を排除した開発習慣**
4. **確認作業を効率化**

---

## まとめ

**この世で一番大事なこと**：
```
想像でコードを書くな
必ず元のリポジトリ・ドキュメントを確認しろ
不明点を0にしてから実装しろ
```

これを守ることで：
- ✅ 高品質なコード
- ✅ 短時間での実装
- ✅ エラーの大幅削減
- ✅ 確実な動作保証

**誠実に、正確に、確実に開発する**

---
*このドキュメントは開発の基本原則をまとめたものです。*  
*全ての実装でこの原則を徹底してください。*