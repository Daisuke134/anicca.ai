import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';
import { ensureBaselineFiles, resolveLanguageAssets, syncTodayTasksFromMarkdown } from './onboardingBootstrap';

const homeDir = os.homedir();
const baseDir = path.join(homeDir, '.anicca');
const aniccaPath = path.join(baseDir, 'anicca.md');
const scheduledPath = path.join(baseDir, 'scheduled_tasks.json');
const promptsDir = path.join(baseDir, 'prompts');
const groundedPromptPath = path.join(promptsDir, 'common.txt');

export interface OnboardingPayload {
  wake: { enabled: boolean; time: string; location?: string };
  sleep: { enabled: boolean; time: string; location?: string };
  profile: { name: string; language?: 'Japanese' | 'English' };
}

function normalizeTime(time: string): string {
  // HH:MM形式に正規化（例: "6:00" -> "06:00", "06:00" -> "06:00"）
  const parts = time.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid time format: ${time}`);
  }
  const hours = parts[0]!.padStart(2, '0');
  const minutes = parts[1]!.padStart(2, '0');
  return `${hours}:${minutes}`;
}

function timeToCron(time: string): string {
  // HH:MM -> MM HH * * *
  const [hours, minutes] = time.split(':');
  return `${minutes} ${hours} * * *`;
}

function timeToCronSleep(time: string): string {
  // 就寝時間の10分前のcronを生成
  const [hours, minutes] = time.split(':');
  let sleepHour = parseInt(hours!, 10);
  let sleepMinute = parseInt(minutes!, 10) - 10;
  if (sleepMinute < 0) {
    sleepMinute += 60;
    sleepHour -= 1;
    if (sleepHour < 0) {
      sleepHour += 24;
    }
  }
  return `${sleepMinute.toString().padStart(2, '0')} ${sleepHour.toString().padStart(2, '0')} * * *`;
}

async function updateProfile(payload: OnboardingPayload): Promise<void> {
  await ensureBaselineFiles();
  const assets = resolveLanguageAssets();
  
  let profile = fs.readFileSync(aniccaPath, 'utf8');
  
  // Name行を更新（より厳密な処理）
  const nameLabel = assets.languageLabel === 'Japanese' ? '- 呼び名:' : '- Name:';
  const nameRegex = new RegExp(`^-\\s*(?:呼び名|Name):\\s*[^\\r\\n]*`, 'm');
  // 修正: payload.profile.name が空でないことを確認
  const nameValue = payload.profile.name && payload.profile.name.trim() ? payload.profile.name.trim() : '';
  if (nameValue) {
    const nameLine = `${nameLabel} ${nameValue}`;
    if (nameRegex.test(profile)) {
      profile = profile.replace(nameRegex, nameLine);
    } else {
      // 見つからない場合は適切な位置に挿入
      const headerRegex = assets.languageLabel === 'Japanese' ? /(# ユーザー情報\r?\n)/ : /(# USER PROFILE\r?\n)/;
      if (headerRegex.test(profile)) {
        profile = profile.replace(headerRegex, `$1${nameLine}\n`);
      } else {
        profile = `${nameLine}\n${profile}`;
      }
    }
  }
  
  // Language行を更新
  if (payload.profile.language) {
    const languageLabel = payload.profile.language === 'Japanese' ? '- 言語:' : '- Language:';
    const languageValue = payload.profile.language === 'Japanese' ? '日本語' : 'English';
    const languageLine = `${languageLabel} ${languageValue}`;
    const languageRegex = new RegExp(`^-\\s*(?:言語|Language):\\s*[^\\r\\n]*`, 'm');
    
    if (languageRegex.test(profile)) {
      profile = profile.replace(languageRegex, languageLine);
    } else {
      // 見つからない場合は適切な位置に挿入
      const headerRegex = payload.profile.language === 'Japanese' ? /(# ユーザー情報\r?\n)/ : /(# USER PROFILE\r?\n)/;
      if (headerRegex.test(profile)) {
        profile = profile.replace(headerRegex, `$1${languageLine}\n`);
      } else {
        profile = `${languageLine}\n${profile}`;
      }
    }
  }
  
  // sleep place行を更新
  const sleepPlaceLabel = assets.languageLabel === 'Japanese' ? '- 寝る場所:' : '- sleep place:';
  const sleepPlaceRegex = new RegExp(`^-\\s*(?:寝る場所|sleep place):\\s*[^\\r\\n]*`, 'm');
  
  let sleepPlaceValue = '';
  if (payload.wake.enabled && payload.wake.location) {
    sleepPlaceValue = payload.wake.location.trim();
  } else if (payload.sleep.enabled && payload.sleep.location) {
    sleepPlaceValue = payload.sleep.location.trim();
  }
  
  if (sleepPlaceValue) {
    const sleepPlaceLine = `${sleepPlaceLabel} ${sleepPlaceValue}`;
    if (sleepPlaceRegex.test(profile)) {
      profile = profile.replace(sleepPlaceRegex, sleepPlaceLine);
    } else {
      // 見つからない場合は適切な位置に挿入
      const headerRegex = assets.languageLabel === 'Japanese' ? /(# ユーザー情報\r?\n)/ : /(# USER PROFILE\r?\n)/;
      if (headerRegex.test(profile)) {
        profile = profile.replace(headerRegex, `$1${sleepPlaceLine}\n`);
      } else {
        profile = `${sleepPlaceLine}\n${profile}`;
      }
    }
  }
  
  // Wake/Sleepブロックは既存のまま維持（ensureBaselineFilesで既に確保されている）
  // ここでは既存ブロックをそのまま保持する
  
  fs.writeFileSync(aniccaPath, profile, { encoding: 'utf8', mode: 0o600 });
}

async function updateScheduledTasks(payload: OnboardingPayload): Promise<void> {
  let scheduled: { tasks: Array<{ id: string; schedule: string; description: string }> };
  
  try {
    scheduled = JSON.parse(fs.readFileSync(scheduledPath, 'utf8'));
  } catch {
    scheduled = { tasks: [] };
  }
  
  if (!Array.isArray(scheduled.tasks)) {
    scheduled.tasks = [];
  }
  
  // 既存のwake/sleepタスクを削除
  scheduled.tasks = scheduled.tasks.filter(
    (task) => !task.id.startsWith('wake_up__') && !task.id.startsWith('sleep__')
  );
  
  const assets = resolveLanguageAssets();
  
  // Wakeタスクを追加
  if (payload.wake.enabled) {
    const normalizedTime = normalizeTime(payload.wake.time);
    const [hours, minutes] = normalizedTime.split(':');
    const taskId = `wake_up__${hours}${minutes}`;
    scheduled.tasks.push({
      id: taskId,
      schedule: timeToCron(normalizedTime),
      description: assets.wakeDescription,
    });
  }
  
  // Sleepタスクを追加（10分前）
  if (payload.sleep.enabled) {
    const normalizedTime = normalizeTime(payload.sleep.time);
    const [hours, minutes] = normalizedTime.split(':');
    const taskId = `sleep__${hours}${minutes}`;
    scheduled.tasks.push({
      id: taskId,
      schedule: timeToCronSleep(normalizedTime),
      description: assets.sleepPrepDescription,
    });
  }
  
  fs.writeFileSync(scheduledPath, JSON.stringify(scheduled, null, 2), { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(scheduledPath, 0o600);
  } catch {}
}

export async function applyOnboardingData(payload: OnboardingPayload): Promise<void> {
  await ensureBaselineFiles();
  await updateProfile(payload);
  await updateScheduledTasks(payload);
  await writeGroundedPrompt(payload);
  syncTodayTasksFromMarkdown();
}

export async function loadSettingsFromFiles(): Promise<OnboardingPayload> {
  await ensureBaselineFiles();
  const assets = resolveLanguageAssets();
  
  let profile = fs.readFileSync(aniccaPath, 'utf8');
  const nameLabel = assets.languageLabel === 'Japanese' ? '- 呼び名:' : '- Name:';
  // 修正: 値のみをキャプチャする正規表現（\s+ は改行文字にもマッチするため、スペースのみをマッチ）
  const nameRegex = new RegExp(`^-\\s*(?:呼び名|Name): +([^\\r\\n]+)`, 'm');
  const nameMatch = profile.match(nameRegex);
  // 修正: マッチした値が空文字列や空白のみでないことを確認
  const userName = nameMatch && nameMatch[1] && nameMatch[1].trim() ? nameMatch[1].trim() : '';
  
  const sleepPlaceLabel = assets.languageLabel === 'Japanese' ? '- 寝る場所:' : '- sleep place:';
  // 修正: 値のみをキャプチャする正規表現（\s+ は改行文字にもマッチするため、スペースのみをマッチ）
  const sleepPlaceRegex = new RegExp(`^-\\s*(?:寝る場所|sleep place): +([^\\r\\n]+)`, 'm');
  const sleepPlaceMatch = profile.match(sleepPlaceRegex);
  // 修正: マッチした値が空文字列や空白のみでないことを確認
  const sleepPlace = sleepPlaceMatch && sleepPlaceMatch[1] && sleepPlaceMatch[1].trim() ? sleepPlaceMatch[1].trim() : '';
  
  // Language行を読み取る
  const languageRegex = new RegExp(`^-\\s*(?:言語|Language): +([^\\r\\n]+)`, 'm');
  const languageMatch = profile.match(languageRegex);
  let language: 'Japanese' | 'English' | undefined = undefined;
  if (languageMatch && languageMatch[1]) {
    const normalized = languageMatch[1].trim().toLowerCase();
    if (normalized.startsWith('日') || normalized.startsWith('japanese')) {
      language = 'Japanese';
    } else if (normalized.startsWith('英') || normalized.startsWith('english')) {
      language = 'English';
    }
  }
  
  let scheduled: { tasks: Array<{ id: string; schedule: string; description: string }> };
  try {
    scheduled = JSON.parse(fs.readFileSync(scheduledPath, 'utf8'));
  } catch {
    scheduled = { tasks: [] };
  }
  
  const wakeTask = scheduled.tasks.find(t => t.id.startsWith('wake_up__'));
  const sleepTask = scheduled.tasks.find(t => t.id.startsWith('sleep__'));
  
  const wakeTime = wakeTask ? extractTimeFromCron(wakeTask.schedule) : '06:00';
  const sleepTime = sleepTask ? extractTimeFromCronSleep(sleepTask.schedule) : '23:00';
  
  return {
    wake: {
      enabled: !!wakeTask,
      time: wakeTime,
      location: sleepPlace
    },
    sleep: {
      enabled: !!sleepTask,
      time: sleepTime,
      location: sleepPlace
    },
    profile: {
      name: userName,
      language: language
    }
  };
}

function extractTimeFromCron(cron: string): string {
  // MM HH * * * -> HH:MM
  const parts = cron.split(' ');
  if (parts.length >= 2) {
    return `${parts[1]!.padStart(2, '0')}:${parts[0]!.padStart(2, '0')}`;
  }
  return '06:00';
}

function extractTimeFromCronSleep(cron: string): string {
  // 就寝10分前のcronから就寝時間を逆算
  const parts = cron.split(' ');
  if (parts.length >= 2) {
    let hour = parseInt(parts[1]!, 10);
    let minute = parseInt(parts[0]!, 10) + 10;
    if (minute >= 60) {
      minute -= 60;
      hour = (hour + 1) % 24;
    }
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }
  return '23:00';
}

async function writeGroundedPrompt(payload: OnboardingPayload): Promise<void> {
  try {
    // テンプレートファイルのパスを解決（__dirname は dist/services/ なので、../../prompts/common.txt で apps/desktop/prompts/common.txt にアクセス）
    const templatePath = path.join(__dirname, '..', '..', 'prompts', 'common.txt');
    const template = fs.readFileSync(templatePath, 'utf8');

    // プレースホルダを実際の値で置換（値がない場合は空文字）
    const resolved = template
      .replace(/\$\{USER_NAME\}/g, payload.profile.name || '')
      .replace(/\$\{WAKE_TIME\}/g, payload.wake.enabled && payload.wake.time ? normalizeTime(payload.wake.time) : '')
      .replace(/\$\{WAKE_LOCATION\}/g, payload.wake.enabled && payload.wake.location ? payload.wake.location : '')
      .replace(/\$\{SLEEP_TIME\}/g, payload.sleep.enabled && payload.sleep.time ? normalizeTime(payload.sleep.time) : '')
      .replace(/\$\{SLEEP_LOCATION\}/g, payload.sleep.enabled && payload.sleep.location ? payload.sleep.location : '');

    // ユーザーディレクトリにグラウンディング済みプロンプトを保存
    fs.mkdirSync(promptsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(groundedPromptPath, resolved, { encoding: 'utf8', mode: 0o600 });
    console.log('✅ Grounded prompt written to:', groundedPromptPath);
  } catch (err) {
    console.warn('⚠️ Failed to write grounded prompt, continuing:', err);
  }
}

