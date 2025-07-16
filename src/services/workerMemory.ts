import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Worker用のCLAUDE.mdファイルを読み込む
 */
export async function loadClaudeMd(userId: string, agentName: string): Promise<string | null> {
  try {
    const workspaceRoot = path.join(os.homedir(), 'Desktop', 'anicca-agent-workspace', agentName.toLowerCase());
    const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
    
    if (fs.existsSync(claudeMdPath)) {
      return fs.readFileSync(claudeMdPath, 'utf-8');
    }
    return null;
  } catch (error) {
    console.error(`Failed to load CLAUDE.md for ${agentName}:`, error);
    return null;
  }
}

/**
 * Worker用のCLAUDE.mdファイルを保存する
 */
export async function saveClaudeMd(userId: string, agentName: string, content: string): Promise<void> {
  try {
    const workspaceRoot = path.join(os.homedir(), 'Desktop', 'anicca-agent-workspace', agentName.toLowerCase());
    const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(workspaceRoot)) {
      fs.mkdirSync(workspaceRoot, { recursive: true });
    }
    
    fs.writeFileSync(claudeMdPath, content, 'utf-8');
  } catch (error) {
    console.error(`Failed to save CLAUDE.md for ${agentName}:`, error);
  }
}

/**
 * Worker用のCLAUDE.mdに学習内容を追記する
 */
export async function appendLearning(userId: string, agentName: string, learning: string): Promise<void> {
  try {
    const existing = await loadClaudeMd(userId, agentName) || `# ${agentName} - CLAUDE.md\n\n## 専門分野\n- まだ専門分野は決まっていません\n\n## 学習内容\n\n## 完了タスク履歴\n\n## ユーザーについて学んだこと\n\n`;
    
    // 学習内容セクションに追記
    const date = new Date().toISOString().split('T')[0];
    const learningEntry = `\n## ${date}\n- ${learning}\n`;
    
    const updatedContent = existing.replace('## 学習内容\n', `## 学習内容\n${learningEntry}`);
    
    await saveClaudeMd(userId, agentName, updatedContent);
  } catch (error) {
    console.error(`Failed to append learning for ${agentName}:`, error);
  }
}