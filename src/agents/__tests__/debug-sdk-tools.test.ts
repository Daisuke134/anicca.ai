import { describe, it, expect } from 'vitest';
import { createAniccaAgent } from '../mainAgent';
import { allTools } from '../tools';

// デバッグ用テスト：SDKがツールをどう変換するか確認
describe('デバッグ：SDKのツール変換確認', () => {
  it('SDKがツールをどう変換するかを確認する', () => {
    const agent = createAniccaAgent();
    
    console.log('=== Original allTools ===');
    console.log('First tool:', allTools[0]);
    console.log('Properties:', Object.keys(allTools[0]));
    
    console.log('=== Agent.tools (SDK transformed) ===');
    console.log('First tool:', agent.tools[0]);
    console.log('Properties:', Object.keys(agent.tools[0]));
    
    // slack_list_channelsを詳しく確認
    const originalSlackTool = allTools.find(t => t.name === 'slack_list_channels');
    const sdkSlackTool = agent.tools.find((t: any) => t.name === 'slack_list_channels');
    
    console.log('=== slack_list_channels 比較 ===');
    console.log('Original:', originalSlackTool);
    console.log('SDK transformed:', sdkSlackTool);
    
    // この情報を使ってテストを修正する
    expect(true).toBe(true); // 一旦成功させて情報収集
  });
});