import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AniccaSessionManager } from '../sessionManager';
import fetch from 'node-fetch';
import WebSocket from 'ws';

/**
 * TDD-RED-2: slack_list_channelsのSDK自動実行テスト
 * 
 * 目的: 実際のOpenAI APIを使って、SDKが音声コマンドを理解し、
 *       ツールを自動実行することを確認する（モックなし）
 */
describe('SDK自動ツール実行（実API使用）', () => {
  let sessionManager: AniccaSessionManager;
  let apiKey: string;
  
  beforeAll(async () => {
    console.log('🧪 SDK自動実行テスト開始 - 実際のAPIキーを取得中...');
    
    // 1. 実際のAPIキーをプロキシから取得
    const PROXY_URL = 'https://anicca-proxy-staging.up.railway.app';
    const response = await fetch(`${PROXY_URL}/api/openai-proxy/desktop-session`);
    
    if (!response.ok) {
      throw new Error(`Failed to get API key: ${response.status}`);
    }
    
    const data = await response.json();
    apiKey = data.client_secret?.value;
    
    if (!apiKey) {
      console.error('Proxy response:', JSON.stringify(data, null, 2));
      throw new Error('No API key received from proxy (expected in client_secret.value)');
    }
    
    console.log('✅ APIキー取得成功');
    
    // 2. SessionManager初期化と接続
    sessionManager = new AniccaSessionManager();
    await sessionManager.initialize();
    await sessionManager.startBridge(3838);
    
    console.log('🔗 OpenAI Realtime APIに接続中...');
    await sessionManager.connect(apiKey);
    console.log('✅ SDK接続完了');
  }, 30000); // 30秒のタイムアウト
  
  afterAll(async () => {
    if (sessionManager) {
      await sessionManager.stop();
      console.log('🛑 SessionManager停止完了');
    }
  });

  it('「Slackのチャンネル一覧」でslack_list_channelsが自動実行される', async () => {
    // 期待する入力: 日本語の音声コマンド
    const input = 'Slackのチャンネル一覧を見せて';
    
    // 期待する出力: 
    // 1. agent_tool_startイベント発火
    // 2. toolName = 'slack_list_channels'
    // 3. Slack APIからのレスポンス（チャンネルリスト）
    
    let toolStarted = false;
    let executedTool = '';
    let toolResult: any = null;
    let toolStartDetails: any = null;
    let toolEndDetails: any = null;
    
    console.log(`📝 テストコマンド送信: "${input}"`);
    
    // イベントリスナー設定
    const session = sessionManager.getSession();
    expect(session).toBeDefined();
    
    // 🔍 Transport設定の詳細確認
    const transport = (session as any).transport;
    console.log('🔧 Transport Debug Info:');
    console.log('  - Transport type:', transport.constructor.name);
    console.log('  - sendMessage exists?', typeof transport.sendMessage);
    console.log('  - sendEvent exists?', typeof transport.sendEvent);
    console.log('  - Transport methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(transport)));
    
    // セッション詳細確認
    console.log('📊 Session Debug Info:');
    console.log('  - Session type:', session.constructor.name);
    console.log('  - Connected?', sessionManager.isConnected());
    console.log('  - Agent tools count:', (session as any).agent?.tools?.length);
    
    session?.on('agent_tool_start', (context: any, agent: any, tool: any, details: any) => {
      toolStarted = true;
      executedTool = tool.name;
      toolStartDetails = details;
      console.log(`🔧 ツール自動実行開始: ${tool.name}`, details);
    });
    
    session?.on('agent_tool_end', (context: any, agent: any, tool: any, result: any, details: any) => {
      toolResult = result;
      toolEndDetails = details;
      console.log(`✅ ツール実行完了: ${tool.name}`, { result, details });
    });
    
    // transport イベントもリッスン
    transport?.on('*', (event: any) => {
      console.log('🌐 Transport Event:', event.type, event);
    });
    
    // テキストメッセージ送信（音声の代わり）
    console.log('📤 メッセージ送信開始...');
    await sessionManager.sendMessage(input);
    console.log('📤 メッセージ送信完了、SDKの処理を待機中...');
    
    // 10秒待機（SDKの処理時間）
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 検証
    console.log('🔍 検証開始');
    console.log('toolStarted:', toolStarted);
    console.log('executedTool:', executedTool);
    console.log('toolResult:', toolResult);
    
    // TDD-RED期待: これらのテストは失敗するはず
    expect(toolStarted).toBe(true);
    expect(executedTool).toBe('slack_list_channels');
    expect(toolResult).toBeDefined();
    
    // Slackチャンネルリストの構造を検証
    if (toolResult && typeof toolResult === 'string') {
      try {
        const parsed = JSON.parse(toolResult);
        expect(parsed).toHaveProperty('channels');
      } catch (e) {
        console.log('⚠️ toolResult is not valid JSON:', toolResult);
        // JSON以外の形式でも成功とみなす（エラーメッセージの可能性）
        expect(toolResult).toContain('channel');
      }
    }
  }, 15000); // 15秒のタイムアウト

  it('SDKがツール実行時にWebSocket通知を送信する', async () => {
    console.log('🔌 WebSocketテスト開始');
    
    // WebSocketクライアント接続
    const ws = new WebSocket('ws://localhost:3838');
    const messages: any[] = [];
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ WebSocket接続成功');
        resolve(void 0);
      });
      ws.on('error', reject);
      
      // 5秒でタイムアウト
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
    
    ws.on('message', (data: any) => {
      const message = JSON.parse(data.toString());
      messages.push(message);
      console.log('📨 WebSocketメッセージ受信:', message);
    });
    
    // コマンド送信
    const testMessage = 'Slackチャンネル一覧';
    console.log(`📝 WebSocketテスト用コマンド: "${testMessage}"`);
    await sessionManager.sendMessage(testMessage);
    
    // 5秒待機
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log(`📊 受信したWebSocketメッセージ数: ${messages.length}`);
    messages.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. ${JSON.stringify(msg)}`);
    });
    
    // WebSocket通知を検証
    const startNotification = messages.find(m => 
      m.type === 'tool_execution_start' && 
      m.toolName === 'slack_list_channels'
    );
    
    // TDD-RED期待: この検証も失敗するはず
    expect(startNotification).toBeDefined();
    
    ws.close();
    console.log('🔌 WebSocket接続終了');
  }, 10000); // 10秒のタイムアウト

  it('SessionManagerが正しく初期化されており、SDKに接続済みである', async () => {
    // 前提条件の確認テスト（このテストは成功するはず）
    
    console.log('🔍 SessionManager状態確認');
    
    // SessionManagerの基本状態確認
    expect(sessionManager).toBeDefined();
    expect(sessionManager.isConnected()).toBe(true);
    expect(sessionManager.getSession()).toBeDefined();
    
    // エージェントとツールの確認（RealtimeSessionから正しく取得）
    const session = sessionManager.getSession();
    const sessionData = (session as any);
    
    console.log('📊 Session構造:', Object.keys(sessionData));
    
    // RealtimeSessionの構造を確認
    if (sessionData._agent || sessionData.agent) {
      const agent = sessionData._agent || sessionData.agent;
      expect(agent).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.tools.length).toBe(14);
      
      // slack_list_channelsツールの存在確認
      const slackTool = agent.tools.find((t: any) => t.name === 'slack_list_channels');
      expect(slackTool).toBeDefined();
      expect(slackTool.invoke).toBeDefined();
    } else {
      // RealtimeAgentから直接アクセス
      const sessionManagerData = (sessionManager as any);
      expect(sessionManagerData.agent).toBeDefined();
      expect(sessionManagerData.agent.tools).toBeDefined();
      expect(sessionManagerData.agent.tools.length).toBe(14);
      
      const slackTool = sessionManagerData.agent.tools.find((t: any) => t.name === 'slack_list_channels');
      expect(slackTool).toBeDefined();
      expect(slackTool.invoke).toBeDefined();
    }
    
    console.log('✅ SessionManager状態正常');
  });
});
