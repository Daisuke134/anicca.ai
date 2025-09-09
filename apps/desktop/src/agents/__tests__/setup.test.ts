import { describe, it, expect, beforeAll } from 'vitest';

describe('テスト環境セットアップ確認', () => {
  beforeAll(() => {
    console.log('🧪 Vitest環境でテストを開始します');
  });

  it('Vitestが正常に動作している', () => {
    expect(true).toBe(true);
  });

  it('TypeScriptの型チェックが動作している', () => {
    const testValue: number = 42;
    expect(typeof testValue).toBe('number');
    expect(testValue).toBe(42);
  });

  it('非同期テストが動作している', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 100);
    });
    
    const result = await promise;
    expect(result).toBe('success');
  });

  it('OpenAI Agents SDKがインポートできる', async () => {
    try {
      const { RealtimeAgent } = await import('@openai/agents/realtime');
      expect(RealtimeAgent).toBeDefined();
      expect(typeof RealtimeAgent).toBe('function');
    } catch (error) {
      console.log('OpenAI SDK インポートエラー:', error);
      throw error;
    }
  });

  it('プロジェクトのツールモジュールがインポートできる', async () => {
    try {
      const { allTools } = await import('../tools');
      expect(allTools).toBeDefined();
      expect(Array.isArray(allTools)).toBe(true);
      expect(allTools.length).toBeGreaterThan(0);
      
      console.log(`✅ ${allTools.length}個のツールが登録されています`);
      allTools.forEach((tool, index) => {
        console.log(`  ${index + 1}. ${tool.name}`);
      });
    } catch (error) {
      console.log('ツールモジュール インポートエラー:', error);
      throw error;
    }
  });
});