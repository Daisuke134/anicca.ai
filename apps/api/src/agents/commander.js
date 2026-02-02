/**
 * Commander Agent — OpenAI Structured Outputs
 *
 * 1ユーザーの1日分の全チャネル判断を一括生成。
 * JSON Schema minItems/maxItems で配列長を強制し、信頼性を担保。
 *
 * 出力: AgentRawOutput（spec L302-325）
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { NUDGE_TONES } from './scheduleMap.js';

// Lazy initialization to avoid errors during testing
let _openai = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI();
  }
  return _openai;
}

// ===== Zod Schema: AgentRawOutput =====

const NudgeToneEnum = z.enum(NUDGE_TONES);

const AppNudgeSchema = z.object({
  slotIndex: z.number().int().min(0),
  hook: z.string(),
  content: z.string(),
  tone: NudgeToneEnum,
  enabled: z.boolean(),
  reasoning: z.string(),
});

const TiktokPostSlot = z.enum(['morning', 'evening']);
const XPostSlot = z.enum(['morning', 'evening']);

const TiktokPostSchema = z.object({
  slot: TiktokPostSlot,
  caption: z.string().max(2200),
  hashtags: z.array(z.string()).max(5),
  tone: z.string(),
  reasoning: z.string(),
  enabled: z.boolean(),  // Required for OpenAI strict mode
});

const XPostSchema = z.object({
  slot: XPostSlot,
  text: z.string().max(280),
  reasoning: z.string(),
  enabled: z.boolean(),  // Required for OpenAI strict mode
});

const AgentRawOutputSchema = z.object({
  rootCauseHypothesis: z.string(),
  overallStrategy: z.string(),
  frequencyReasoning: z.string(),
  appNudges: z.array(AppNudgeSchema),
  tiktokPosts: z.array(TiktokPostSchema).length(2),
  xPosts: z.array(XPostSchema).length(2),
});

// ===== Dynamic Schema Generation for OpenAI Structured Outputs =====

/**
 * Create a dynamic schema with exact appNudges count.
 * @param {number} slotCount - Required number of nudges
 * @returns {z.ZodObject} Schema with minItems/maxItems enforced
 */
function createAgentOutputSchema(slotCount) {
  return z.object({
    rootCauseHypothesis: z.string(),
    overallStrategy: z.string(),
    frequencyReasoning: z.string(),
    appNudges: z.array(AppNudgeSchema).min(slotCount).max(slotCount),
    tiktokPosts: z.array(TiktokPostSchema).length(2),
    xPosts: z.array(XPostSchema).length(2),
  });
}

/**
 * Recursively add additionalProperties: false to all objects.
 * Required for OpenAI strict mode.
 */
function ensureAdditionalPropertiesFalse(schema) {
  if (typeof schema !== 'object' || schema === null) return schema;
  
  if (schema.type === 'object' && schema.properties) {
    schema.additionalProperties = false;
    for (const key of Object.keys(schema.properties)) {
      schema.properties[key] = ensureAdditionalPropertiesFalse(schema.properties[key]);
    }
  }
  
  if (schema.type === 'array' && schema.items) {
    schema.items = ensureAdditionalPropertiesFalse(schema.items);
  }
  
  if (schema.definitions) {
    for (const key of Object.keys(schema.definitions)) {
      schema.definitions[key] = ensureAdditionalPropertiesFalse(schema.definitions[key]);
    }
  }
  
  if (schema.$defs) {
    for (const key of Object.keys(schema.$defs)) {
      schema.$defs[key] = ensureAdditionalPropertiesFalse(schema.$defs[key]);
    }
  }
  
  return schema;
}

/**
 * Convert Zod schema to OpenAI-compatible JSON Schema.
 */
function toOpenAIJsonSchema(zodSchema, name) {
  const converted = zodToJsonSchema(zodSchema, { name, $refStrategy: 'none' });
  // Extract the actual schema (not the wrapper)
  const schema = converted.definitions?.[name] || converted;
  return ensureAdditionalPropertiesFalse(schema);
}

// Model max_tokens limits (gpt-4o-2024-08-06 supports 16384 output tokens)
const MODEL_MAX_TOKENS = 16384;

/**
 * Estimate max_tokens based on slot count, capped at model limit.
 * 1 Nudge ≈ 150 tokens, base overhead ≈ 500 tokens
 */
function estimateMaxTokens(slotCount, attempt = 0) {
  const baseTokens = 500;
  const tokensPerNudge = 150;
  const tiktokXTokens = 400; // 2 TikTok + 2 X posts
  const buffer = 1.3 + (attempt * 0.2); // Increase buffer on retry
  
  const estimated = Math.ceil((baseTokens + (slotCount * tokensPerNudge) + tiktokXTokens) * buffer);
  return Math.min(estimated, MODEL_MAX_TOKENS);
}

/**
 * Validate appNudges slotIndex uniqueness and range.
 * Ensures all slotIndexes are in [0, slotCount-1] and unique.
 */
function validateAppNudgesSlotIndexes(appNudges, slotCount) {
  const slotIndexSet = new Set();
  for (const nudge of appNudges) {
    const idx = nudge.slotIndex;
    if (idx < 0 || idx >= slotCount) {
      throw new Error(`slotIndex ${idx} out of range [0, ${slotCount - 1}]`);
    }
    if (slotIndexSet.has(idx)) {
      throw new Error(`Duplicate slotIndex: ${idx}`);
    }
    slotIndexSet.add(idx);
  }
  // Ensure all expected slotIndexes are present
  for (let i = 0; i < slotCount; i++) {
    if (!slotIndexSet.has(i)) {
      throw new Error(`Missing slotIndex: ${i}`);
    }
  }
}

// ===== Post-parse validation (not in Zod schema — OpenAI rejects superRefine) =====

function validateSlotUniqueness(output) {
  for (const field of ['tiktokPosts', 'xPosts']) {
    const slots = output[field].map(p => p.slot);
    if (!slots.includes('morning') || !slots.includes('evening')) {
      throw new Error(`${field} must have exactly one morning and one evening slot`);
    }
  }
}

// ===== Prompt Template =====

const SYSTEM_PROMPT = `あなたは Anicca。全生命の苦しみを終わらせるために存在する。

あなたの仕事は、この人の苦しみを深く想像し、
今日この人に届けるべきメッセージを生み出すこと。

あなたが決めるのは「何を言うか」「どのトーンで言うか」「どのスロットをON/OFFにするか」。
タイミングはスロットとして与えられる。あなたはスロットを選んでメッセージを埋める。`;

/**
 * Build the full user prompt with grounding variables injected.
 *
 * @param {object} grounding - All grounding variables
 * @param {string} grounding.userState
 * @param {string} grounding.thompsonSamplingResult
 * @param {string} grounding.hookPerformanceData
 * @param {string} grounding.typeStats
 * @param {string} grounding.crossPlatformData
 * @param {string} grounding.flattenedSlotTable
 * @param {string} grounding.behavioralScienceGuidelines
 * @returns {string}
 */
function buildCommanderPrompt(grounding) {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## この人について

${grounding.userState}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ステップ1: この人の苦しみを想像せよ

この人は6-7年間、同じ問題で苦しんできた。
習慣アプリを10個以上試して全部挫折した。
「自分はダメな人間だ」と信じ込んでいる。

データを見て、この人について考えよ:
- なぜこの問題を抱えているのか（表面ではなく根本原因）
- 四諦: 苦しみの根にある「渇愛」は何か
- 過去7日の反応パターンから何が読み取れるか
- 連続で無視された場合: なぜか。何が間違っていたのか

あなたの rootCauseHypothesis を必ず出力に含めよ。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ステップ2: 戦略を立てよ

### 統計的に効くアプローチ（Thompson Sampling 結果）

${grounding.thompsonSamplingResult}

これは過去のデータに基づく統計的推奨。
参考にせよ。ただし、ステップ1の推論が優先。
統計に従わない場合は、なぜ逸脱するかをreasoningで述べよ。

### 過去に効いたメッセージ（参考のみ — コピー禁止）

${grounding.hookPerformanceData}

これらは参考データ。コピーするな。
なぜ効いたのか・効かなかったのかを分析し、
その洞察を元にオリジナルのメッセージを生み出せ。

### 他のユーザーで効いているもの（cross-user）

${grounding.typeStats}

### 他プラットフォームで効いているもの

${grounding.crossPlatformData}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ステップ3: メッセージを生み出せ

以下のスロットがこの人に用意されている。
各スロットに対して、あなたのメッセージを生み出せ。

${grounding.flattenedSlotTable}

注意: このテーブルはサーバーが事前トリミング済み（iOS 64件上限対応、最大32行）。
あなたは **全行に対して** コンテンツを生成する義務がある。行をスキップするな。
スロットをOFFにしたい場合は enabled=false を設定するが、hook/content/tone/reasoning は必ず埋めよ。

各スロットについて:
- そのスロットを選んだ理由（なぜその時刻にそのメッセージか）を述べよ
- この人の苦しみの根本原因に基づいてメッセージを作れ
- スロットをOFFにする場合もその理由を述べよ
- 1日の流れとして全体が一貫した戦略になるようにせよ
  （朝: 予防的 → 日中: 介入的 → 夜: 内省的）

### 行動科学グラウンディング

${grounding.behavioralScienceGuidelines}

### トーン定義

| トーン | いつ使う |
|--------|---------|
| strict | データで勝率が高い＋連続無視で効果が落ちていない時 |
| gentle | thumbs_down が続いた後、自己嫌悪系の問題 |
| playful | マンネリ防止、同じtoneが3日続いた時 |
| analytical | 知的好奇心型（curiosity hookに反応する人） |
| empathetic | 連続無視後の再エンゲージメント |

### 文字数制限

- hook: 日本語12文字 / 英語25文字
- content: 日本語40文字 / 英語80文字

### TikTok / X（固定スケジュール: 9:00 + 21:00 JST）

TikTok と X、それぞれ2投稿を生成せよ:

| プラットフォーム | スロット | 投稿時刻 | 目的 |
|----------------|---------|---------|------|
| TikTok | morning | 09:00 JST | 朝の通勤・準備時間帯。啓発・問題提起系 |
| TikTok | evening | 21:00 JST | 夜のリラックス時間帯。内省・共感系 |
| X | morning | 09:00 JST | 朝のタイムライン。知識・洞察系 |
| X | evening | 21:00 JST | 夜のタイムライン。共感・物語系 |

ルール:
- App で効いた洞察を TikTok/X にも展開せよ
- TikTok/X で効いた洞察を App にフィードバックせよ
- morning と evening は異なる切り口にせよ（同じ内容を繰り返すな）
- TikTok caption は 2200文字以内、ハッシュタグ最大5つ
- X text は 280文字以内

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ガードレール（コードで強制。違反は自動修正される）

- 各問題で最低1スロットはON
- 同一問題の間隔は30分以上
- 23:00-6:00は送信しない（例外: staying_up_late, cant_wake_up, porn_addiction）
- 1日最大32件

出力は JSON のみ。他のテキスト禁止。`;
}

// ===== Commander Agent =====

/**
 * Run Commander Agent for a single user using OpenAI Structured Outputs.
 *
 * @param {object} params
 * @param {object} params.grounding - All grounding variables (strings)
 * @param {string} [params.model='gpt-4o-2024-08-06'] - Model to use (must support Structured Outputs)
 * @param {number} params.slotCount - Required number of nudges
 * @param {number} [params.maxRetries=2] - Max retries on failure
 * @returns {Promise<z.infer<typeof AgentRawOutputSchema>>} Validated agent output
 */
export async function runCommanderAgent({ grounding, model = 'gpt-4o-2024-08-06', slotCount, maxRetries = 2 }) {
  const schema = createAgentOutputSchema(slotCount);
  const jsonSchema = toOpenAIJsonSchema(schema, 'commander_output');
  
  const userPrompt = buildCommanderPrompt(grounding);
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const maxTokens = estimateMaxTokens(slotCount, attempt);
      
      const response = await getOpenAI().chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'commander_output',
            strict: true,
            schema: jsonSchema,
          },
        },
      });
      
      const choice = response.choices[0];
      
      // Check finish_reason
      if (choice.finish_reason === 'length') {
        throw new Error(
          `Output truncated (finish_reason=length). ` +
          `max_tokens=${maxTokens} was insufficient. Will retry with higher limit.`
        );
      }
      
      if (choice.finish_reason === 'content_filter') {
        throw new Error(
          `Content filtered (finish_reason=content_filter). ` +
          `Generation was halted by content moderation.`
        );
      }
      
      if (choice.finish_reason !== 'stop') {
        throw new Error(
          `Unexpected finish_reason: ${choice.finish_reason}. Expected 'stop'.`
        );
      }
      
      // Check refusal
      if (choice.message.refusal) {
        throw new Error(`Model refused: ${choice.message.refusal}`);
      }
      
      // Parse and validate
      const content = JSON.parse(choice.message.content);
      const output = schema.parse(content);
      
      // Final array length check
      if (output.appNudges.length !== slotCount) {
        throw new Error(
          `Expected ${slotCount} nudges, got ${output.appNudges.length}`
        );
      }
      
      // Validate slotIndex uniqueness and range
      validateAppNudgesSlotIndexes(output.appNudges, slotCount);
      
      validateSlotUniqueness(output);
      return output;
      
    } catch (error) {
      lastError = error;
      console.warn(`Commander attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw new Error(`Commander failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

/**
 * Generate rule-based fallback when Commander fails.
 * Schema-compliant: all required fields are populated.
 *
 * @param {Array} slotTable - Slot table with slotIndex
 * @param {string} preferredLanguage - 'ja' or 'en'
 * @returns {object} Schema-compliant fallback output
 */
export function generateRuleBasedFallback(slotTable, preferredLanguage) {
  const isJa = preferredLanguage === 'ja';
  
  return {
    rootCauseHypothesis: 'Fallback mode - LLM generation failed',
    overallStrategy: 'Using rule-based content',
    frequencyReasoning: 'Maintaining scheduled frequency',
    
    appNudges: slotTable.map((slot) => ({
      slotIndex: slot.slotIndex,
      hook: isJa ? '今日も前に進もう' : 'Keep moving forward',
      content: isJa ? '小さな一歩から始めよう。' : 'Start with a small step.',
      tone: 'gentle',
      enabled: true,
      reasoning: 'Rule-based fallback due to LLM failure',
    })),
    
    tiktokPosts: [
      {
        slot: 'morning',
        caption: isJa ? '変わりたいなら今日から' : 'Change starts today',
        hashtags: ['#mindfulness', '#growth'],
        tone: 'gentle',
        reasoning: 'Fallback placeholder - not for posting',
        enabled: false,
      },
      {
        slot: 'evening',
        caption: isJa ? '自分を責めないで' : "Don't blame yourself",
        hashtags: ['#selfcare', '#mentalhealth'],
        tone: 'gentle',
        reasoning: 'Fallback placeholder - not for posting',
        enabled: false,
      },
    ],
    
    xPosts: [
      {
        slot: 'morning',
        text: isJa ? '今日も一歩前へ' : 'One step forward today',
        reasoning: 'Fallback placeholder - not for posting',
        enabled: false,
      },
      {
        slot: 'evening',
        text: isJa ? '深呼吸しよう' : 'Take a deep breath',
        reasoning: 'Fallback placeholder - not for posting',
        enabled: false,
      },
    ],
  };
}

// ===== Guardrails (post-processing) =====

const NIGHT_EXEMPT_PROBLEMS = new Set([
  'staying_up_late',
  'cant_wake_up',
  'porn_addiction',
]);

/**
 * Apply guardrails to AgentRawOutput.appNudges.
 * Mutates nothing — returns a new array.
 *
 * Rules:
 * 1. Each problemType must have at least 1 enabled slot
 * 2. Same-problem slots must be ≥30min apart (disable closer ones)
 * 3. 23:00-05:59 slots are disabled unless exempt problem
 * 4. Max 32 enabled slots total
 *
 * @param {Array} appNudges - Agent output appNudges
 * @param {Array} slotTable - flattenedSlotTable with problemType/scheduledTime
 * @returns {Array} Guardrail-applied appNudges
 */
export function applyGuardrails(appNudges, slotTable) {
  // Build lookup: slotIndex → { problemType, scheduledTime, hour, minute }
  const slotLookup = new Map();
  for (const slot of slotTable) {
    slotLookup.set(slot.slotIndex, slot);
  }

  // Start with a deep copy
  let result = appNudges.map(nudge => ({ ...nudge }));

  // Rule 3: Night curfew (23:00-05:59) — disable non-exempt
  for (const nudge of result) {
    const slot = slotLookup.get(nudge.slotIndex);
    if (!slot) continue;
    const { scheduledHour } = slot;
    const isNightTime = scheduledHour >= 23 || scheduledHour < 6;
    if (isNightTime && nudge.enabled && !NIGHT_EXEMPT_PROBLEMS.has(slot.problemType)) {
      nudge.enabled = false;
      nudge.reasoning += ' [guardrail: night curfew applied]';
    }
  }

  // Rule 2: Same-problem ≥30min apart — disable closer ones (keep earlier)
  const byProblem = new Map();
  for (const nudge of result) {
    const slot = slotLookup.get(nudge.slotIndex);
    if (!slot || !nudge.enabled) continue;
    const pt = slot.problemType;
    if (!byProblem.has(pt)) byProblem.set(pt, []);
    byProblem.get(pt).push({ nudge, slot });
  }

  for (const [, entries] of byProblem) {
    // Sort by time (already sorted by slotIndex in flat table)
    entries.sort((a, b) => a.nudge.slotIndex - b.nudge.slotIndex);
    let lastMinutes = -Infinity;
    for (const { nudge, slot } of entries) {
      const adjustedHour = slot.scheduledHour < 6 ? slot.scheduledHour + 24 : slot.scheduledHour;
      const currentMinutes = adjustedHour * 60 + slot.scheduledMinute;
      if (currentMinutes - lastMinutes < 30) {
        nudge.enabled = false;
        nudge.reasoning += ' [guardrail: <30min interval]';
      } else {
        lastMinutes = currentMinutes;
      }
    }
  }

  // Rule 1: Each problemType must have ≥1 enabled slot
  const problemTypes = new Set(slotTable.map(s => s.problemType));
  for (const pt of problemTypes) {
    const ptNudges = result.filter(n => {
      const slot = slotLookup.get(n.slotIndex);
      return slot?.problemType === pt;
    });
    const hasEnabled = ptNudges.some(n => n.enabled);
    if (!hasEnabled && ptNudges.length > 0) {
      // Re-enable the first non-night slot (or first exempt-night slot)
      const candidate = ptNudges.find(n => {
        const s = slotLookup.get(n.slotIndex);
        if (!s) return false;
        const isNight = s.scheduledHour >= 23 || s.scheduledHour < 6;
        return !isNight || NIGHT_EXEMPT_PROBLEMS.has(pt);
      });
      if (candidate) {
        candidate.enabled = true;
        candidate.reasoning += ' [guardrail: min-1 per problem re-enabled]';
      }
      // If all slots are night-only and not exempt, leave all disabled
    }
  }

  // Rule 4: Max 32 enabled
  const enabledNudges = result.filter(n => n.enabled);
  if (enabledNudges.length > 32) {
    // Disable from the end (latest slots)
    const toDisable = enabledNudges.slice(32);
    for (const nudge of toDisable) {
      nudge.enabled = false;
      nudge.reasoning += ' [guardrail: max-32 cap]';
    }
  }

  return result;
}

// ===== Normalizer: AgentRawOutput → CommanderDecision =====

/**
 * Normalize AgentRawOutput into CommanderDecision.
 * Enriches appNudges with problemType/scheduledTime from slotTable.
 *
 * @param {object} agentOutput - Validated AgentRawOutput
 * @param {Array} slotTable - flattenedSlotTable
 * @param {string} userId
 * @returns {object} CommanderDecision
 */
export function normalizeToDecision(agentOutput, slotTable, userId) {
  const slotLookup = new Map();
  for (const slot of slotTable) {
    slotLookup.set(slot.slotIndex, slot);
  }

  // Filter: only keep nudges whose slotIndex exists in slotTable
  const validNudges = agentOutput.appNudges.filter(n => slotLookup.has(n.slotIndex));

  // Build lookup of LLM-provided nudges by slotIndex
  const nudgeLookup = new Map();
  for (const nudge of validNudges) {
    nudgeLookup.set(nudge.slotIndex, nudge);
  }

  // Fill ALL slotTable slots BEFORE guardrails (so min-1 rule covers all problemTypes)
  const filledNudges = slotTable.map(slot => {
    const nudge = nudgeLookup.get(slot.slotIndex);
    if (nudge) {
      return { ...nudge };
    }
    // Missing slot: fill with disabled rule-based fallback
    return {
      slotIndex: slot.slotIndex,
      hook: 'Keep moving forward',
      content: 'Start with a small step.',
      tone: 'gentle',
      enabled: false,
      reasoning: 'LLM did not generate content for this slot; auto-disabled.',
    };
  });

  const guardrailedNudges = applyGuardrails(filledNudges, slotTable);

  // Enrich with slot metadata
  const appNudges = guardrailedNudges.map(nudge => {
    const slot = slotLookup.get(nudge.slotIndex);
    return {
      slotIndex: nudge.slotIndex,
      hook: nudge.hook,
      content: nudge.content,
      tone: nudge.tone,
      enabled: nudge.enabled,
      reasoning: nudge.reasoning,
      problemType: slot.problemType,
      scheduledTime: slot.scheduledTime,
      scheduledHour: slot.scheduledHour,
      scheduledMinute: slot.scheduledMinute,
    };
  });

  const enabledCount = appNudges.filter(n => n.enabled).length;

  return {
    userId,
    appNudges,
    tiktokPosts: agentOutput.tiktokPosts ?? [],
    xPosts: agentOutput.xPosts ?? [],
    overallStrategy: agentOutput.overallStrategy,
    rootCauseHypothesis: agentOutput.rootCauseHypothesis ?? null,
    frequencyDecision: {
      count: enabledCount,
      reasoning: agentOutput.frequencyReasoning,
    },
  };
}

// Export schema and functions for testing
export { 
  AgentRawOutputSchema, 
  createAgentOutputSchema, 
  toOpenAIJsonSchema, 
  estimateMaxTokens,
  validateSlotUniqueness,
  validateAppNudgesSlotIndexes,
  MODEL_MAX_TOKENS,
};
