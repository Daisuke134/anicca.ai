import fs from 'fs';
import os from 'os';
import path from 'path';

const homeDir = os.homedir();
const baseDir = path.join(homeDir, '.anicca');
const aniccaPath = path.join(baseDir, 'anicca.md');
const tasksPath = path.join(baseDir, 'tasks.md');
const scheduledPath = path.join(baseDir, 'scheduled_tasks.json');
const todaySchedulePath = path.join(baseDir, 'today_schedule.json');

const ONBOARDING_TEMPLATES = {
  Japanese: `# ユーザー情報
- 呼び名:
- タイムゾーン: {{TIMEZONE}}
- 言語: 日本語
- 起床トーン:
- 就寝場所:
`,
  English: `# USER PROFILE
- Name:
- Timezone: {{TIMEZONE}}
- Language: English
- Wake Tone:
- Sleep Location:
`,
};

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

export function resolveGroundedLanguageLabel(): 'Japanese' | 'English' {
  try {
    const profile = fs.readFileSync(aniccaPath, 'utf8');
    const languageMatch = profile.match(/-\s*(?:言語|Language):\s*([^\r\n]+)/);
    if (languageMatch) {
      const normalized = languageMatch[1].trim().toLowerCase();
      if (normalized.startsWith('日') || normalized.startsWith('japanese')) {
        return 'Japanese';
      }
      if (normalized.startsWith('英') || normalized.startsWith('english')) {
        return 'English';
      }
    }
    const tzMatch = profile.match(/-\s*(?:タイムゾーン|Timezone):\s*([^\r\n]+)/);
    const tz = tzMatch ? tzMatch[1].trim() : '';
    return tz === 'Asia/Tokyo' ? 'Japanese' : 'English';
  } catch {
    return 'English';
  }
}

export function resolveLanguageAssets() {
  const label = resolveGroundedLanguageLabel();
  if (label === 'Japanese') {
    return {
      languageLabel: 'Japanese',
      languageLine: '- 言語: 日本語',
      speakOnlyLine: '今後は必ず日本語で書き、話します。',
      wakeDescription: '起床',
      sleepPrepDescription: '就寝準備',
      profileTemplate: ONBOARDING_TEMPLATES.Japanese,
      timezoneLinePrefix: '- タイムゾーン:',
    };
  }
  return {
    languageLabel: 'English',
    languageLine: '- Language: English',
    speakOnlyLine: 'From now on I will write and speak only in English.',
    wakeDescription: 'Wake up',
    sleepPrepDescription: 'Bedtime prep',
    profileTemplate: ONBOARDING_TEMPLATES.English,
    timezoneLinePrefix: '- Timezone:',
  };
}

export async function ensureBaselineFiles(): Promise<void> {
  ensureDir();
  ensureJson(scheduledPath, { tasks: [] });
  ensureJson(todaySchedulePath, []);
  const assets = resolveLanguageAssets();
  if (!fs.existsSync(aniccaPath)) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? process.env.TZ ?? '';
    const template = assets.profileTemplate.replace('{{TIMEZONE}}', tz ?? '');
    fs.writeFileSync(aniccaPath, template, { encoding: 'utf8', mode: 0o600 });
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? process.env.TZ ?? '';
  if (tz) {
    try {
      const profile = fs.readFileSync(aniccaPath, 'utf8');
      const timezoneLine = `${assets.timezoneLinePrefix} ${tz}`;
      const insertBlock = `${timezoneLine}\n${assets.languageLine}\n`;
      let updated = profile
        .replace(/^- タイムゾーン:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- Timezone:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- 言語:[^\r\n]*\r?\n?/gm, '')
        .replace(/^- Language:[^\r\n]*\r?\n?/gm, '')
        .replace(/^Language:[^\r\n]*\r?\n?/gm, '');

      if (/# ユーザー情報\r?\n/.test(updated)) {
        updated = updated.replace(/(# ユーザー情報\r?\n)/, `$1${insertBlock}`);
      } else if (/# USER PROFILE\r?\n/.test(updated)) {
        updated = updated.replace(/(# USER PROFILE\r?\n)/, `$1${insertBlock}`);
      } else {
        updated = `${insertBlock}${updated}`;
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
    const labelGroups = [
      ['- 呼び名:', '- 起床トーン:', '- 就寝場所:'],
      ['- Name:', '- Wake Tone:', '- Sleep Location:'],
    ];
    return labelGroups.some((group) =>
      group.every((label) => new RegExp(`${label}\\s*$`, 'm').test(profile))
    );
  } catch {
    return true;
  }
}

export function shouldRunOnboarding(): boolean {
  if (!fs.existsSync(aniccaPath)) {
    return true;
  }
  return isProfileEmpty();
}

export function resolveOnboardingPrompt(): string {
  const appRoot = path.resolve(__dirname, '..');
  const candidateDirs = [
    path.join(appRoot, 'prompts'),
    path.join(appRoot, '..', 'prompts'),
    path.join(process.cwd(), 'prompts')
  ];

  const promptPath = candidateDirs
    .map((dir) => path.join(dir, 'onboarding.txt'))
    .find((fullPath) => fs.existsSync(fullPath));

  if (!promptPath) {
    throw new Error(`onboarding.txt が見つかりません: ${candidateDirs.join(', ')}`);
  }

  const source = fs.readFileSync(promptPath, 'utf8');
  const assets = resolveLanguageAssets();
  return source
    .replace(/\${INTERNAL_LANGUAGE_LINE}/g, assets.speakOnlyLine)
    .replace(/\${INTERNAL_LANGUAGE_LABEL}/g, assets.languageLabel)
    .replace(/\${WAKE_TASK_DESCRIPTION}/g, assets.wakeDescription)
    .replace(/\${SLEEP_PREP_DESCRIPTION}/g, assets.sleepPrepDescription);
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
