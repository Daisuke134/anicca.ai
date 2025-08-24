import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // テスト環境をNode.jsに設定（Electronプロジェクトに適している）
    environment: 'node',
    
    // テストファイルの場所
    include: [
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts'
    ],
    
    // テストから除外するファイル
    exclude: [
      'node_modules',
      'dist',
      '**/*.d.ts'
    ],
    
    // タイムアウト設定（OpenAI SDKのAPIコール用）
    testTimeout: 30000,
    
    // グローバル設定（describe, it, expect等を自動でインポート）
    globals: true,
    
    // カバレッジ設定
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/agents/**/*.ts'
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.test.ts',
        'src/**/*.d.ts'
      ]
    },
    
    // テスト実行の詳細情報を表示
    reporter: ['verbose']
  },
  
  // TypeScriptの設定
  esbuild: {
    target: 'node18',
    format: 'esm'
  },
  
  // パスエイリアスの設定
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});