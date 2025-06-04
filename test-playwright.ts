import { CommandExecutor } from './src/services/commandExecutor';

async function test() {
  const executor = new CommandExecutor();
  
  try {
    await executor.initialize();
    console.log('✅ Playwright initialized');
    
    // YouTubeを開く
    await executor.execute({
      type: 'navigate',
      target: 'https://www.youtube.com'
    });
    
    // 5秒待つ
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // タブを閉じる
    await executor.execute({
      type: 'close_tab',
      target: 'youtube.com'
    });
    
    console.log('✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await executor.cleanup();
  }
}

test();