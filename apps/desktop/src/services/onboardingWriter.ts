import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ensureBaselineFiles, resolveLanguageAssets, syncTodayTasksFromMarkdown } from './onboardingBootstrap';

const homeDir = os.homedir();
const baseDir = path.join(homeDir, '.anicca');
const aniccaPath = path.join(baseDir, 'anicca.md');
const scheduledPath = path.join(baseDir, 'scheduled_tasks.json');

export interface OnboardingPayload {
  wake: { enabled: boolean; time: string; location?: string };
  sleep: { enabled: boolean; time: string; location?: string };
  profile: { name: string };
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
  
  // Name行を更新
  const nameLabel = assets.languageLabel === 'Japanese' ? '- 呼び名:' : '- Name:';
  const nameRegex = new RegExp(`^-\\s*(?:呼び名|Name):\\s*[^\\r\\n]*`, 'm');
  const nameLine = `${nameLabel} ${payload.profile.name}`;
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
  
  // sleep place行を更新
  const sleepPlaceLabel = assets.languageLabel === 'Japanese' ? '- 寝る場所:' : '- sleep place:';
  const sleepPlaceRegex = new RegExp(`^-\\s*(?:寝る場所|sleep place):\\s*[^\\r\\n]*`, 'm');
  
  let sleepPlaceValue = '';
  if (payload.wake.enabled && payload.wake.location) {
    sleepPlaceValue = payload.wake.location;
  } else if (payload.sleep.enabled && payload.sleep.location) {
    sleepPlaceValue = payload.sleep.location;
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
  syncTodayTasksFromMarkdown();
}

