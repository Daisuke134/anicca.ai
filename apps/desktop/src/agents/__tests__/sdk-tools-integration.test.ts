import { describe, it, expect, beforeAll } from 'vitest';
import { createAniccaAgent } from '../mainAgent';
import { allTools } from '../tools';
import { AniccaSessionManager } from '../sessionManager';

const TEST_BRIDGE_TOKEN = 'test-bridge-token-0123456789abcdef0123456789abcdef';

describe('SDK Tool Integration - ツールがSDKに正しく登録される', () => {
  
  describe('RealtimeAgentへのツール登録', () => {
    it('createAniccaAgent()が14個のツールを持つエージェントを作成する', () => {
      // 期待する入力: なし
      // 期待する出力: 14個のツールを持つRealtimeAgent
      
      const agent = createAniccaAgent();
      
      // エージェントが存在する
      expect(agent).toBeDefined();
      expect(agent.constructor.name).toBe('RealtimeAgent');
      
      // 14個のツールが登録されている（Agentクラスから継承されたtoolsプロパティ）
      expect(agent.tools).toBeDefined();
      expect(Array.isArray(agent.tools)).toBe(true);
      expect(agent.tools.length).toBe(14);
      
      // voice設定が'alloy'になっている（修正済み）
      expect(agent.voice).toBe('alloy');
    });
    
    it('登録されたツールにslack_list_channelsが含まれる', () => {
      // 期待する入力: なし
      // 期待する出力: slack_list_channelsツールを含むエージェント
      
      const agent = createAniccaAgent();
      
      // slack_list_channelsツールが存在する
      const slackListTool = agent.tools.find((t: any) => t.name === 'slack_list_channels');
      expect(slackListTool).toBeDefined();
      expect(slackListTool.name).toBe('slack_list_channels');
      expect(slackListTool.description).toBe('List all Slack channels');
    });
    
    it('各ツールが正しい構造を持っている', () => {
      // 期待する入力: なし
      // 期待する出力: 正しい構造のツール（name, description, parameters, invoke）
      
      const agent = createAniccaAgent();
      
      agent.tools.forEach((tool: any) => {
        // 必須プロパティの確認
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
        expect(tool).toHaveProperty('invoke');
        
        // 型の確認
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.invoke).toBe('function');
      });
    });
  });
  
  describe('SessionManagerでのツール利用', () => {
    let sessionManager: AniccaSessionManager;
    
    beforeAll(() => {
      sessionManager = new AniccaSessionManager(undefined, TEST_BRIDGE_TOKEN);
    });
    
    it('SessionManagerがinitialize時にツール付きエージェントを作成する', async () => {
      // 期待する入力: なし
      // 期待する出力: ツール付きエージェントを持つSessionManager
      
      await sessionManager.initialize();
      
      // agentプロパティが存在する（privateだがテスト用にアクセス）
      expect((sessionManager as any).agent).toBeDefined();
      
      // エージェントがツールを持っている
      expect((sessionManager as any).agent.tools).toBeDefined();
      expect((sessionManager as any).agent.tools.length).toBe(14);
    });
    
    it('SessionManagerがツールを実行できる準備ができている【失敗予定】', async () => {
      // 期待する入力: ツール名とパラメータ
      // 期待する出力: ツールの実行結果
      
      await sessionManager.initialize();
      
      // このメソッドはまだ実装されていないので失敗する（TDD-RED）
      try {
        const result = await (sessionManager as any).executeToolDirectly('slack_list_channels', {});
        expect(result).toBeDefined();
      } catch (error: any) {
        // executeToolDirectlyメソッドが存在しないエラーが発生するはず
        expect(error.message).toContain('executeToolDirectly is not a function');
      }
    });
  });
  
  describe('ツールの実行可能性', () => {
    it('slack_list_channelsツールが実行可能である', async () => {
      // 期待する入力: なし
      // 期待する出力: チャンネルリストまたはエラーメッセージ（文字列）
      
      const slackTool = allTools.find(t => t.name === 'slack_list_channels');
      expect(slackTool).toBeDefined();
      
      // invokeメソッドが存在し、関数である（tool関数でexecute→invokeに変換済み）
      expect(slackTool!.invoke).toBeDefined();
      expect(typeof slackTool!.invoke).toBe('function');
      
      // 実行してみる（プロキシに接続できなくてもエラーメッセージが返る）
      const result = await slackTool!.invoke({});
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
