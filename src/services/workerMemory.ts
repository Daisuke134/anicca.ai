import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * CLAUDE.mdのパスを取得
 */
function getClaudeMdPath(userId: string, agentName: string): string {
  const aniccaDir = path.join(os.homedir(), 'Desktop', 'anicca-agent-workspace', userId, agentName);
  return path.join(aniccaDir, 'CLAUDE.md');
}

/**
 * CLAUDE.mdを読み込む
 */
export async function loadClaudeMd(userId: string, agentName: string): Promise<string> {
  const claudeMdPath = getClaudeMdPath(userId, agentName);
  
  try {
    const content = await fs.readFile(claudeMdPath, 'utf-8');
    return content;
  } catch (error) {
    // ファイルが存在しない場合は空文字を返す
    if ((error as any).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * CLAUDE.mdを保存
 */
export async function saveClaudeMd(userId: string, agentName: string, content: string): Promise<void> {
  const claudeMdPath = getClaudeMdPath(userId, agentName);
  const dir = path.dirname(claudeMdPath);
  
  // ディレクトリが存在しない場合は作成
  await fs.mkdir(dir, { recursive: true });
  
  // CLAUDE.mdを保存
  await fs.writeFile(claudeMdPath, content, 'utf-8');
}

/**
 * 学習内容を追記
 */
export async function appendLearning(userId: string, agentName: string, learning: string): Promise<void> {
  const currentContent = await loadClaudeMd(userId, agentName);
  
  // 初回の場合はテンプレートを作成
  if (!currentContent) {
    const template = `# ${agentName} - CLAUDE.md

## 専門分野
- まだ専門分野は決まっていません

## 学習内容

## 完了タスク履歴

## ユーザーについて学んだこと

---
このファイルは自動的に更新されます。
`;
    await saveClaudeMd(userId, agentName, template);
  }
  
  // 学習内容を追記
  const updatedContent = await loadClaudeMd(userId, agentName);
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD形式
  
  // 学習内容セクションを更新
  const learningSection = `\n## ${now}\n- ${learning}\n`;
  
  // 学習内容の後に追記
  const newContent = updatedContent.replace(
    /## 学習内容\n/,
    `## 学習内容\n${learningSection}`
  );
  
  await saveClaudeMd(userId, agentName, newContent);
}