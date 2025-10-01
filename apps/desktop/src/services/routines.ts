import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface RoutineState {
  id: string;
  steps: string[];
  currentIndex: number;
  updatedAt: string;
}

interface RoutineSnapshot {
  routineId: string;
  steps: string[];
  currentIndex: number;
  currentStep: string | null;
  nextStep: string | null;
  remainingSteps: string[];
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
  remainingSteps: string[];
  completed: boolean;
  updatedAt: string;
  allSteps: string[];
}

const routineStates = new Map<string, RoutineState>();
const ROUTINE_LABEL_MAP: Record<string, string> = {
  sleep: '就寝',
};

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
  const nextStep = completed ? null : steps[state.currentIndex];

  return {
    status: completed ? 'done' : 'ok',
    routineId,
    acknowledgedStep: acknowledgedStep ?? previousStep,
    currentIndex: state.currentIndex,
    totalSteps: steps.length,
    nextStep,
    remainingSteps: steps.slice(state.currentIndex),
    completed,
    updatedAt: state.updatedAt,
    allSteps: steps.slice(),
  };
}

function loadRoutineSteps(routineId: string): string[] {
  if (!fs.existsSync(aniccaMarkdownPath)) {
    throw new Error('~/.anicca/anicca.md が存在しません');
  }
  const markdown = fs.readFileSync(aniccaMarkdownPath, 'utf8');
  const label = ROUTINE_LABEL_MAP[routineId] ?? routineId;
  return parseRoutineSteps(markdown, label);
}

function parseRoutineSteps(markdown: string, label: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const anchor = lines.findIndex((line) => line.trim().startsWith(`- ${label}:`));
  if (anchor === -1) return [];

  const steps: string[] = [];
  for (let i = anchor + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (/^\s*-\s+[^\d]/.test(line) || /^\s*#/.test(line)) break;
    const match = line.match(/^\s*\d+\)\s*(.+)\s*$/);
    if (match) {
      steps.push(match[1].trim());
    } else if (line.trim().length === 0) {
      continue;
    } else if (!line.startsWith(' ')) {
      break;
    }
  }
  return steps;
}

function ensureRoutineState(routineId: string, steps: string[], reset: boolean): RoutineState {
  const snapshotSteps = steps.slice();
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
    steps: state.steps.slice(),
    currentIndex: state.currentIndex,
    currentStep,
    nextStep,
    remainingSteps: state.steps.slice(state.currentIndex),
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
    '{{CURRENT_STEP_TEXT}}': snapshot.currentStep ?? '',
    '{{NEXT_STEP_TEXT}}': snapshot.nextStep ?? '',
    '{{REMAINING_STEPS_MARKDOWN}}': formatStepsList(snapshot.remainingSteps),
    '{{TOTAL_STEPS}}': String(snapshot.totalSteps),
    '{{UPDATED_AT}}': snapshot.updatedAt,
  };
  return Object.entries(replacements).reduce(
    (acc, [token, value]) => acc.split(token).join(value),
    template,
  );
}

function formatStepsList(steps: string[]): string {
  if (steps.length === 0) return '(残りなし)';
  return steps
    .map((step, index) => `  ${index + 1}) ${step}`)
    .join('\n');
}
