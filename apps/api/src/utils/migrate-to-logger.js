/**
 * console.logからloggerへの移行支援スクリプト
 * 
 * 使用方法:
 * node src/utils/migrate-to-logger.js [オプション]
 * 
 * オプション:
 * --check    : 変更対象のファイルをリストアップ（変更なし）
 * --file     : 特定のファイルのみを変換
 * --dry-run  : 変更内容をプレビュー（実際には変更しない）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 移行ルール
const MIGRATION_RULES = [
  {
    // 基本的なconsole.log
    pattern: /console\.log\(/g,
    replacement: 'logger.info(',
    importNeeded: true
  },
  {
    // console.error
    pattern: /console\.error\(/g,
    replacement: 'logger.error(',
    importNeeded: true
  },
  {
    // console.warn
    pattern: /console\.warn\(/g,
    replacement: 'logger.warn(',
    importNeeded: true
  },
  {
    // デバッグ系のログ（特定のパターン）
    pattern: /console\.log\(\s*['"`]🔍/g,
    replacement: 'logger.debug(\'🔍',
    importNeeded: true
  },
  {
    // エラー系のログ（特定のパターン）
    pattern: /console\.log\(\s*['"`]❌/g,
    replacement: 'logger.error(\'❌',
    importNeeded: true
  }
];

// 除外するディレクトリ・ファイル
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'logger.js',
  'migrate-to-logger.js',
  'errorHandler.js'
];

/**
 * ファイルがJavaScript/TypeScriptファイルかチェック
 */
function isTargetFile(filePath) {
  const ext = path.extname(filePath);
  return ['.js', '.ts', '.jsx', '.tsx', '.mjs'].includes(ext);
}

/**
 * ファイルを処理
 */
function processFile(filePath, options = {}) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let changeCount = 0;
  
  // 各ルールを適用
  MIGRATION_RULES.forEach(rule => {
    const matches = content.match(rule.pattern);
    if (matches) {
      if (!options.dryRun) {
        content = content.replace(rule.pattern, rule.replacement);
      }
      modified = true;
      changeCount += matches.length;
    }
  });
  
  if (modified && !options.checkOnly) {
    // logger importを追加（まだない場合）
    if (!content.includes('import logger') && !content.includes('from \'./utils/logger\'')) {
      const relativePathToLogger = path.relative(
        path.dirname(filePath),
        path.join(__dirname, 'logger.js')
      ).replace(/\\/g, '/');
      
      const importStatement = `import logger from '${relativePathToLogger.startsWith('.') ? relativePathToLogger : './' + relativePathToLogger}';\n`;
      
      // 既存のimport文の後に追加
      const importMatch = content.match(/^(import[\s\S]*?from\s+['"][^'"]+['"];?\s*\n)+/m);
      if (importMatch) {
        const lastImportEnd = importMatch.index + importMatch[0].length;
        content = content.slice(0, lastImportEnd) + importStatement + content.slice(lastImportEnd);
      } else {
        // import文がない場合は先頭に追加
        content = importStatement + '\n' + content;
      }
    }
    
    if (!options.dryRun) {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated ${filePath} (${changeCount} changes)`);
    } else {
      console.log(`Would update ${filePath} (${changeCount} changes)`);
    }
  }
  
  return { modified, changeCount };
}

/**
 * ディレクトリを再帰的に処理
 */
function processDirectory(dirPath, options = {}) {
  let totalFiles = 0;
  let modifiedFiles = 0;
  let totalChanges = 0;
  
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // 除外パターンをチェック
      if (EXCLUDE_PATTERNS.some(pattern => fullPath.includes(pattern))) {
        continue;
      }
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && isTargetFile(fullPath)) {
        totalFiles++;
        const result = processFile(fullPath, options);
        if (result.modified) {
          modifiedFiles++;
          totalChanges += result.changeCount;
        }
      }
    }
  }
  
  walk(dirPath);
  
  return { totalFiles, modifiedFiles, totalChanges };
}

/**
 * メイン処理
 */
function main() {
  const args = process.argv.slice(2);
  const options = {
    checkOnly: args.includes('--check'),
    dryRun: args.includes('--dry-run'),
    file: args.find(arg => arg.startsWith('--file='))?.split('=')[1]
  };
  
  console.log('🔄 Console.log to Logger Migration Tool');
  console.log('=====================================\n');
  
  if (options.file) {
    // 単一ファイル処理
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    
    const result = processFile(filePath, options);
    console.log(`\n📊 Results:`);
    console.log(`  - Changes: ${result.changeCount}`);
  } else {
    // プロジェクト全体を処理
    const projectRoot = path.join(__dirname, '..', '..');
    const results = processDirectory(projectRoot, options);
    
    console.log(`\n📊 Results:`);
    console.log(`  - Total files scanned: ${results.totalFiles}`);
    console.log(`  - Files to be modified: ${results.modifiedFiles}`);
    console.log(`  - Total changes: ${results.totalChanges}`);
  }
  
  if (options.dryRun) {
    console.log('\n⚠️  This was a dry run. No files were modified.');
    console.log('Remove --dry-run to apply changes.');
  } else if (options.checkOnly) {
    console.log('\n⚠️  Check mode: No files were modified.');
  }
}

// 実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { processFile, processDirectory };