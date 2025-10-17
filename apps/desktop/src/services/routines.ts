import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RoutineStep {
  text: string;
  tag?: string | null;
}

interface RoutineState {
  id: string;
  steps: RoutineStep[];
  currentIndex: number;
  updatedAt: string;
}

interface RoutineSnapshot {
  routineId: string;
  steps: RoutineStep[];
  currentIndex: number;
  currentStep: RoutineStep | null;
  nextStep: RoutineStep | null;
  remainingSteps: RoutineStep[];
  totalSteps: number;
  updatedAt: string;
}

interface BuildOptions {
  reset?: boolean;
}

interface AdvanceResult {
  status: 'ok' | 'done';
  routineId: string;
  acknowledgedStep: string | null;
  currentIndex: number;
  totalSteps: number;
  nextStep: string | null;
  nextStepInstructions: string | null;
  remainingSteps: string[];
  completed: boolean;
  updatedAt: string;
  allSteps: string[];
}

const routineStates = new Map<string, RoutineState>();
const ROUTINE_LABEL_MAP: Record<string, string> = {
  wake: '起床',
  sleep: '就寝',
};

const BUILTIN_ROUTINES: Record<string, RoutineStep[]> = {
  onboarding: [
    { text: 'STEP "1" — 呼び名確認' },
    { text: 'STEP "2-1" — 理想の起床時間を確認' },
    { text: 'STEP "2-2" — 起床トーンを聞く' },
    { text: 'STEP "2-3" — 朝の就寝場所を確認' },
    { text: 'STEP "2-4" — 起床後に身につけたい習慣を聞く' },
    { text: 'STEP "3-1" — 理想の就寝時間を確認' },
    { text: 'STEP "3-2" — 辞めたい習慣を聞く' },
    { text: 'STEP "3-3" — 正直さの課題を聞く' },
    { text: 'STEP "3-4" — 尊敬対象を確認' },
    { text: 'STEP "3-5" — 自己像を確認' },
    { text: 'STEP "3-6" — 外向性ヒントを聞く' },
    { text: 'STEP "4" — Google ログインを確認（完了報告を待つ）' },
    { text: 'STEP "5" — 締めの案内を行う' },
  ],
};

const TAG_TEMPLATES: Record<string, string> = {
  jihi: 'jihi_meditation.txt',
  zange: 'zange.txt',
  five: 'five.txt',
};

let cachedPromptsDir: string | null = null;

const aniccaMarkdownPath = path.join(os.homedir(), '.anicca', 'anicca.md');

export function buildRoutinePrompt(routineId: string, template: string, options: BuildOptions = {}): string {
  const steps = loadRoutineSteps(routineId);
  if (steps.length === 0) {
    throw new Error(`ルーティン "${routineId}" の手順が ~/.anicca/anicca.md に見つかりません`);
  }
  const state = ensureRoutineState(routineId, steps, options.reset ?? false);
  const snapshot = snapshotState(state);
  return applyPlaceholders(template, snapshot);
}

export function resetRoutineState(routineId: string): void {
  const steps = loadRoutineSteps(routineId);
  if (steps.length === 0) {
    throw new Error(`ルーティン "${routineId}" のステップが見つかりません`);
  }
  ensureRoutineState(routineId, steps, true);
}

export function advanceRoutineStepForTool(routineId: string, acknowledgedStep: string | null = null): AdvanceResult {
  const state = routineStates.get(routineId);
  if (!state) {
    throw new Error(`ルーティン "${routineId}" は初期化されていません`);
  }
  const steps = state.steps;
  if (steps.length === 0) {
    throw new Error(`ルーティン "${routineId}" のステップが空です`);
  }

  const previousIndex = state.currentIndex;
  const previousStep = steps[previousIndex] ?? null;

  if (state.currentIndex < steps.length) {
    state.currentIndex += 1;
  }
  state.updatedAt = new Date().toISOString();
  routineStates.set(routineId, state);

  const completed = state.currentIndex >= steps.length;
  const nextStepStep = completed ? null : steps[state.currentIndex];

  const templateText = nextStepStep ? loadTemplateForTag(nextStepStep.tag) : null;

  return {
    status: completed ? 'done' : 'ok',
    routineId,
    acknowledgedStep: acknowledgedStep ?? formatStepWithTag(previousStep),
    currentIndex: state.currentIndex,
    totalSteps: steps.length,
    nextStep: nextStepStep ? nextStepStep.text : null,
    nextStepInstructions: templateText ? templateText.trimEnd() : null,
    remainingSteps: steps.slice(state.currentIndex).map(formatStepWithTag),
    completed,
    updatedAt: state.updatedAt,
    allSteps: steps.map(formatStepWithTag),
  };
}

function loadRoutineSteps(routineId: string): RoutineStep[] {
  const builtin = BUILTIN_ROUTINES[routineId];
  if (builtin) {
    return builtin.map((step) => ({ ...step }));
  }
  if (!fs.existsSync(aniccaMarkdownPath)) {
    throw new Error('~/.anicca/anicca.md が存在しません');
  }
  const markdown = fs.readFileSync(aniccaMarkdownPath, 'utf8');
  const label = ROUTINE_LABEL_MAP[routineId] ?? routineId;
  return parseRoutineSteps(markdown, label);
}

function parseRoutineSteps(markdown: string, label: string): RoutineStep[] {
  const lines = markdown.split(/\r?\n/);
  const anchor = lines.findIndex((line) => line.trim().startsWith(`- ${label}:`));
  if (anchor === -1) return [];

  const steps: RoutineStep[] = [];
  for (let i = anchor + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*-\s+[^\d]/.test(line) || /^\s*#/.test(line)) break;
    const match = line.match(/^\s*\d+\)\s*(.+?)(?:\s*\[([A-Za-z0-9_-]+)\])?\s*$/);
    if (match) {
      const text = match[1]?.trim() ?? '';
      const tag = match[2] ? match[2].trim() : undefined;
      steps.push({ text, tag });
    } else if (line.trim().length === 0) {
      continue;
    } else if (!line.startsWith(' ')) {
      break;
    }
  }
  return steps;
}

function ensureRoutineState(routineId: string, steps: RoutineStep[], reset: boolean): RoutineState {
  const snapshotSteps = steps.map((step) => ({ ...step }));
  let state = routineStates.get(routineId);
  if (!state || reset) {
    state = {
      id: routineId,
      steps: snapshotSteps,
      currentIndex: 0,
      updatedAt: new Date().toISOString(),
    };
    routineStates.set(routineId, state);
    return state;
  }
  state.steps = snapshotSteps;
  if (state.currentIndex > state.steps.length) {
    state.currentIndex = state.steps.length;
  }
  state.updatedAt = new Date().toISOString();
  routineStates.set(routineId, state);
  return state;
}

function snapshotState(state: RoutineState): RoutineSnapshot {
  const currentStep = state.steps[state.currentIndex] ?? null;
  const nextStep = state.steps[state.currentIndex + 1] ?? null;
  return {
    routineId: state.id,
    steps: state.steps.map((step) => ({ ...step })),
    currentIndex: state.currentIndex,
    currentStep: currentStep ? { ...currentStep } : null,
    nextStep: nextStep ? { ...nextStep } : null,
    remainingSteps: state.steps.slice(state.currentIndex).map((step) => ({ ...step })),
    totalSteps: state.steps.length,
    updatedAt: state.updatedAt,
  };
}

function applyPlaceholders(template: string, snapshot: RoutineSnapshot): string {
  const replacements: Record<string, string> = {
    '{{ROUTINE_ID}}': snapshot.routineId,
    '{{ROUTINE_STEPS_JSON}}': JSON.stringify(snapshot.steps),
    '{{ROUTINE_STEPS_MARKDOWN}}': formatStepsList(snapshot.steps),
    '{{CURRENT_STEP_INDEX}}': String(snapshot.currentIndex),
    '{{CURRENT_STEP_NUMBER}}': String(snapshot.currentIndex + 1),
    '{{CURRENT_STEP_TEXT}}': formatStepWithTag(snapshot.currentStep),
    '{{NEXT_STEP_TEXT}}': formatStepWithTag(snapshot.nextStep),
    '{{REMAINING_STEPS_MARKDOWN}}': formatStepsList(snapshot.remainingSteps),
    '{{TOTAL_STEPS}}': String(snapshot.totalSteps),
    '{{UPDATED_AT}}': snapshot.updatedAt,
  };
  return Object.entries(replacements).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    template,
  );
}

function formatStepsList(steps: RoutineStep[]): string {
  if (steps.length === 0) return '(残りなし)';
  return steps
    .map((step, index) => `  ${index + 1}) ${formatStepWithTag(step)}`)
    .join('\n');
}

function formatStepWithTag(step?: RoutineStep | null): string {
  if (!step) return '';
  if (step.tag) {
    return `${step.text} [${step.tag}]`;
  }
  return step.text;
}

function loadTemplateForTag(tag?: string | null): string | null {
  if (!tag) return null;
  const filename = TAG_TEMPLATES[tag];
  if (!filename) return null;
  const promptsDir = resolvePromptsDir();
  if (!promptsDir) return null;
  const filePath = path.join(promptsDir, filename);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function resolvePromptsDir(): string | null {
  if (cachedPromptsDir !== null) {
    return cachedPromptsDir;
  }
  const appRoot = path.resolve(__dirname, '..');
  const envPromptsDir = process.env.ANICCA_PROMPTS_DIR;
  const projectRoot = path.resolve(appRoot, '..');
  const cwdPrompts = path.join(process.cwd(), 'prompts');
  const parentCwdPrompts = path.join(process.cwd(), '..', 'prompts');

  const requiredFiles = Array.from(new Set(Object.values(TAG_TEMPLATES)));
  const candidates = [
    envPromptsDir,
    path.join(appRoot, 'prompts'),
    path.join(projectRoot, 'prompts'),
    fs.existsSync(cwdPrompts) ? cwdPrompts : null,
    fs.existsSync(parentCwdPrompts) ? parentCwdPrompts : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'prompts') : null,
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        continue;
      }
      const hasTemplate = requiredFiles.some((file) => fs.existsSync(path.join(dir, file)));
      if (hasTemplate) {
        cachedPromptsDir = dir;
        return dir;
      }
    } catch {
      // ignore
    }
  }
  cachedPromptsDir = null;
  return null;
}
