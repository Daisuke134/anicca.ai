import fs from 'fs';
import os from 'os';
import path from 'path';

const homeDir = os.homedir();
const baseDir = path.join(homeDir, '.anicca');
const aniccaPath = path.join(baseDir, 'anicca.md');
const tasksPath = path.join(baseDir, 'tasks.md');
const scheduledPath = path.join(baseDir, 'scheduled_tasks.json');
const todaySchedulePath = path.join(baseDir, 'today_schedule.json');

const ONBOARDING_TEMPLATE = `# ユーザー情報
- 呼び名:
- タイムゾーン:
- 起床トーン:
- 就寝場所:

## ルーティン
- 起床:
  1) 
  2) 
  3) 

- 就寝:
  1) 
  2) 
  3) 
`;

function initialTasksTemplate(dateLabel: string): string {
  return `# タスク一覧

## ${dateLabel}
`;
}

function ensureDir(): void {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  }
  try {
    fs.chmodSync(baseDir, 0o700);
  } catch {}
}

function ensureJson(pathname: string, defaultValue: object): void {
  if (!fs.existsSync(pathname)) {
    fs.writeFileSync(pathname, JSON.stringify(defaultValue, null, 2), { encoding: 'utf8', mode: 0o600 });
  } else {
    try { fs.chmodSync(pathname, 0o600); } catch {}
  }
}

function ensureFile(pathname: string, template: string): void {
  if (!fs.existsSync(pathname)) {
    fs.writeFileSync(pathname, template, { encoding: 'utf8', mode: 0o600 });
  } else {
    try { fs.chmodSync(pathname, 0o600); } catch {}
  }
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function ensureBaselineFiles(): Promise<void> {
  ensureDir();
  ensureJson(scheduledPath, { tasks: [] });
  ensureJson(todaySchedulePath, []);
  if (!fs.existsSync(aniccaPath)) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? process.env.TZ ?? '';
    const template = tz
      ? ONBOARDING_TEMPLATE.replace('- タイムゾーン:', `- タイムゾーン: ${tz}`)
      : ONBOARDING_TEMPLATE;

    fs.writeFileSync(aniccaPath, template, { encoding: 'utf8', mode: 0o600 });
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? process.env.TZ ?? '';
  if (tz) {
    try {
      const profile = fs.readFileSync(aniccaPath, 'utf8');
      const line = `- タイムゾーン: ${tz}`;
      let updated = profile;

      if (profile.includes('- タイムゾーン:')) {
        updated = profile.replace(/- タイムゾーン:[^\r\n]*/, line);
      } else if (/# ユーザー情報\r?\n/.test(profile)) {
        updated = profile.replace(/(# ユーザー情報\r?\n)/, `$1${line}\n`);
      } else {
        updated = `${line}\n${profile}`;
      }

      if (updated !== profile) {
        fs.writeFileSync(aniccaPath, updated, { encoding: 'utf8', mode: 0o600 });
      }
    } catch (error) {
      console.warn('⚠️ Failed to ensure timezone in profile:', error);
    }
  }

  ensureFile(tasksPath, initialTasksTemplate(formatDate(new Date())));
}

function isProfileEmpty(): boolean {
  try {
    const profile = fs.readFileSync(aniccaPath, 'utf8');
    const labels = ['- 呼び名:', '- 起床トーン:', '- 就寝場所:'];
    return labels.every((label) => new RegExp(`${label}\s*$`, 'm').test(profile));
  } catch {
    return true;
  }
}

export function shouldRunOnboarding(): boolean {
  return isProfileEmpty();
}

export function resolveOnboardingPrompt(): string {
  const appRoot = path.resolve(__dirname, '..');
  const candidateDirs = [
    path.join(appRoot, 'prompts'),
    path.join(process.cwd(), 'prompts')
  ];
  const promptPath = candidateDirs
    .map((dir) => path.join(dir, 'onboarding.txt'))
    .find((fullPath) => fs.existsSync(fullPath));

  const fallback = path.join(process.cwd(), 'prompts', 'onboarding.txt');
  const resolved = promptPath ?? fallback;
  return fs.readFileSync(resolved, 'utf8');
}

function slugify(source: string): string {
  return source
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'task';
}

function parseSection(section: string) {
  return section
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .flatMap((line) => {
      const pattern = /^-\s+(\d{2}):(\d{2})-(\d{2}):(\d{2})\s+(.+?)（所要:([0-9.]+h)\s*\/\s*締切:(\d{4}-\d{2}-\d{2})）$/;
      const match = line.match(pattern);
      if (!match) {
        return [];
      }

      const [, startH, startM, , , description] = match;
      return [{
        startHour: startH,
        startMinute: startM,
        description
      }];
    });
}

export function syncTodayTasksFromMarkdown(): void {
  if (!fs.existsSync(tasksPath) || !fs.existsSync(scheduledPath)) {
    return;
  }

  try { fs.chmodSync(tasksPath, 0o600); } catch {}
  const markdown = fs.readFileSync(tasksPath, 'utf8');
  const sections = markdown
    .split(/\n(?=## )/)
    .filter((chunk) => chunk.startsWith('## '));

  if (sections.length === 0) {
    return;
  }

  const [first] = sections;
  const entries = parseSection(first);

  let scheduled;
  try {
    try { fs.chmodSync(scheduledPath, 0o600); } catch {}
    scheduled = JSON.parse(fs.readFileSync(scheduledPath, 'utf8'));
  } catch {
    scheduled = { tasks: [] };
  }

  if (!Array.isArray(scheduled.tasks)) {
    scheduled.tasks = [];
  }

  const withoutToday = scheduled.tasks.filter((task: any) => !String(task.id || '').endsWith('_today'));
  const mapped = entries.map((entry) => ({
    id: `${slugify(entry.description)}__${entry.startHour}${entry.startMinute}_today`,
    schedule: `${entry.startMinute} ${entry.startHour} * * *`,
    description: entry.description
  }));

  const next = { tasks: [...withoutToday, ...mapped] };
  const nextJson = JSON.stringify(next, null, 2);
  const currentJson = JSON.stringify(scheduled, null, 2);

  if (nextJson !== currentJson) {
    fs.writeFileSync(scheduledPath, nextJson, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(scheduledPath, 0o600); } catch {}
  }
}
