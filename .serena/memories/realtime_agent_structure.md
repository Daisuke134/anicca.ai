# RealtimeAgent 構造メモ

## クラス継承
- RealtimeAgent extends Agent<TContext, TextOutput>
- Agent クラスが tools プロパティを持つ

## プロパティ
- tools: Tool<TContext>[] - 親クラスAgentから継承
- voice: string - RealtimeAgent固有、デフォルト'ash'
- name: string - 必須
- instructions: string - システムプロンプト

## ツール管理
- config.tools で渡されたツール配列が this.tools に設定される
- getAllTools() メソッドでMCPツールと合わせて取得可能