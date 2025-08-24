import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Serenaのセットアップと初期化
 */
export async function setupSerenaEnvironment(): Promise<void> {
  const homeDir = os.homedir();
  const aniccaDir = path.join(homeDir, '.anicca');
  const serenaConfigDir = path.join(homeDir, '.serena');
  const serenaConfigFile = path.join(serenaConfigDir, 'serena_config.yml');
  
  // 1. ~/.aniccaディレクトリが存在しない場合は作成
  if (!fs.existsSync(aniccaDir)) {
    fs.mkdirSync(aniccaDir, { recursive: true });
    console.log(`Created ~/.anicca directory`);
  }
  
  // 2. ダミーのTypeScriptファイルを作成（Serenaがプロジェクトとして認識するため）
  const dummyTsFile = path.join(aniccaDir, 'anicca-serena-init.ts');
  if (!fs.existsSync(dummyTsFile)) {
    const dummyContent = `// This file is auto-generated for Serena integration
// It ensures Serena recognizes ~/.anicca as a valid TypeScript project
export const ANICCA_VERSION = '1.0.0';
export const SERENA_INTEGRATION = true;

// Placeholder for user data management
export interface UserData {
  name?: string;
  preferences?: Record<string, any>;
  lastUpdated?: Date;
}
`;
    fs.writeFileSync(dummyTsFile, dummyContent);
    console.log(`Created dummy TypeScript file for Serena`);
  }
  
  // 3. ~/.serenaディレクトリが存在しない場合は作成
  if (!fs.existsSync(serenaConfigDir)) {
    fs.mkdirSync(serenaConfigDir, { recursive: true });
    console.log(`Created ~/.serena directory`);
  }
  
  // 4. serena_config.ymlの設定（web_dashboardを無効化）
  let configContent = '';
  if (fs.existsSync(serenaConfigFile)) {
    configContent = fs.readFileSync(serenaConfigFile, 'utf-8');
  }
  
  // web_dashboardがtrueになっている場合はfalseに変更
  if (configContent.includes('web_dashboard: true')) {
    configContent = configContent.replace('web_dashboard: true', 'web_dashboard: false');
    fs.writeFileSync(serenaConfigFile, configContent);
    console.log(`Updated web_dashboard to false in serena_config.yml`);
  } else if (!configContent.includes('web_dashboard:')) {
    // web_dashboard設定が存在しない場合は追加
    const defaultConfig = `gui_log_window: false
web_dashboard: false
web_dashboard_open_on_launch: false
log_level: 20
trace_lsp_communication: false
tool_timeout: 240
excluded_tools: []
included_optional_tools: []
jetbrains: false
record_tool_usage_stats: false
token_count_estimator: TIKTOKEN_GPT4O

# Projects will be added automatically by Serena
projects: []
`;
    fs.writeFileSync(serenaConfigFile, defaultConfig);
    console.log(`Created serena_config.yml with web_dashboard disabled`);
  }
  
  // 5. ~/.anicca/.serenaディレクトリを作成（プロジェクト設定用）
  const projectSerenaDir = path.join(aniccaDir, '.serena');
  if (!fs.existsSync(projectSerenaDir)) {
    fs.mkdirSync(projectSerenaDir, { recursive: true });
  }
  
  // 6. project.ymlを作成
  const projectYmlPath = path.join(projectSerenaDir, 'project.yml');
  if (!fs.existsSync(projectYmlPath)) {
    const projectYml = `language: typescript
ignore_all_files_in_gitignore: false
ignored_paths: []
read_only: false
excluded_tools: []
project_name: "anicca-user-data"
initial_prompt: "This is the user data directory for Anicca AI assistant. It stores user preferences, memories, and configurations."
`;
    fs.writeFileSync(projectYmlPath, projectYml);
    console.log(`Created project.yml for Serena`);
  }
  
  // 7. memoriesディレクトリを作成
  const memoriesDir = path.join(projectSerenaDir, 'memories');
  if (!fs.existsSync(memoriesDir)) {
    fs.mkdirSync(memoriesDir, { recursive: true });
    console.log(`Created memories directory`);
  }
}