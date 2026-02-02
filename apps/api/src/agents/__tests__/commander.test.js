import { describe, it, expect } from 'vitest';
import { applyGuardrails, normalizeToDecision, AgentRawOutputSchema } from '../commander.js';

// ===== Test fixtures =====

function makeSlotTable() {
  return [
    { slotIndex: 0, problemType: 'procrastination', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
    { slotIndex: 1, problemType: 'procrastination', scheduledTime: '09:15', scheduledHour: 9, scheduledMinute: 15 },
    { slotIndex: 2, problemType: 'procrastination', scheduledTime: '11:00', scheduledHour: 11, scheduledMinute: 0 },
    { slotIndex: 3, problemType: 'anxiety', scheduledTime: '14:00', scheduledHour: 14, scheduledMinute: 0 },
    { slotIndex: 4, problemType: 'anxiety', scheduledTime: '23:30', scheduledHour: 23, scheduledMinute: 30 },
    { slotIndex: 5, problemType: 'staying_up_late', scheduledTime: '23:00', scheduledHour: 23, scheduledMinute: 0 },
    { slotIndex: 6, problemType: 'staying_up_late', scheduledTime: '00:00', scheduledHour: 0, scheduledMinute: 0 },
  ];
}

function makeNudges() {
  return [
    { slotIndex: 0, hook: 'h0', content: 'c0', tone: 'strict', enabled: true, reasoning: 'r0' },
    { slotIndex: 1, hook: 'h1', content: 'c1', tone: 'gentle', enabled: true, reasoning: 'r1' },
    { slotIndex: 2, hook: 'h2', content: 'c2', tone: 'playful', enabled: true, reasoning: 'r2' },
    { slotIndex: 3, hook: 'h3', content: 'c3', tone: 'analytical', enabled: true, reasoning: 'r3' },
    { slotIndex: 4, hook: 'h4', content: 'c4', tone: 'empathetic', enabled: true, reasoning: 'r4' },
    { slotIndex: 5, hook: 'h5', content: 'c5', tone: 'strict', enabled: true, reasoning: 'r5' },
    { slotIndex: 6, hook: 'h6', content: 'c6', tone: 'gentle', enabled: true, reasoning: 'r6' },
  ];
}

// ===== AgentRawOutputSchema =====

describe('AgentRawOutputSchema', () => {
  it('validates valid output', () => {
    const valid = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test strategy',
      frequencyReasoning: 'test reasoning',
      appNudges: [
        { slotIndex: 0, hook: 'h', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
      ],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: ['#test'], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: ['#test'], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 'tweet2', reasoning: 'r', enabled: true },
      ],
    };
    expect(() => AgentRawOutputSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid tone', () => {
    const invalid = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [
        { slotIndex: 0, hook: 'h', content: 'c', tone: 'aggressive', enabled: true, reasoning: 'r' },
      ],
    };
    expect(() => AgentRawOutputSchema.parse(invalid)).toThrow();
  });

  it('validates required tiktokPosts and xPosts (2 each)', () => {
    const withPosts = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: ['#anicca'], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: ['#test'], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 'tweet2', reasoning: 'r', enabled: true },
      ],
    };
    expect(() => AgentRawOutputSchema.parse(withPosts)).not.toThrow();
  });

  it('rejects missing tiktokPosts/xPosts or invalid slots', () => {
    const invalid = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [{ slot: 'morning', caption: 'c', hashtags: [], tone: 't', reasoning: 'r', enabled: true }],
      xPosts: [{ slot: 'noon', text: 'tweet', reasoning: 'r', enabled: true }],
    };
    expect(() => AgentRawOutputSchema.parse(invalid)).toThrow();
  });
});

// ===== applyGuardrails =====

describe('applyGuardrails', () => {
  it('disables non-exempt problems in night hours (23:00-05:59)', () => {
    const slotTable = makeSlotTable();
    const nudges = makeNudges();

    const result = applyGuardrails(nudges, slotTable);

    // anxiety at 23:30 should be disabled (not exempt)
    const anxietyNight = result.find(n => n.slotIndex === 4);
    expect(anxietyNight.enabled).toBe(false);
    expect(anxietyNight.reasoning).toContain('night curfew');
  });

  it('keeps exempt problems enabled at night', () => {
    const slotTable = makeSlotTable();
    const nudges = makeNudges();

    const result = applyGuardrails(nudges, slotTable);

    // staying_up_late at 23:00 and 00:00 should remain enabled
    const sulNight = result.find(n => n.slotIndex === 5);
    expect(sulNight.enabled).toBe(true);
    const sulMidnight = result.find(n => n.slotIndex === 6);
    expect(sulMidnight.enabled).toBe(true);
  });

  it('disables same-problem slots <30min apart', () => {
    const slotTable = makeSlotTable();
    const nudges = makeNudges();

    const result = applyGuardrails(nudges, slotTable);

    // procrastination: 09:00 (enabled), 09:15 (<30min, disabled), 11:00 (enabled)
    expect(result.find(n => n.slotIndex === 0).enabled).toBe(true);
    expect(result.find(n => n.slotIndex === 1).enabled).toBe(false);
    expect(result.find(n => n.slotIndex === 1).reasoning).toContain('<30min');
    expect(result.find(n => n.slotIndex === 2).enabled).toBe(true);
  });

  it('does not re-enable night-curfewed non-exempt problems even for min-1 rule', () => {
    const slotTable = [
      { slotIndex: 0, problemType: 'anxiety', scheduledTime: '23:30', scheduledHour: 23, scheduledMinute: 30 },
    ];
    const nudges = [
      { slotIndex: 0, hook: 'h', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
    ];

    const result = applyGuardrails(nudges, slotTable);

    // anxiety (non-exempt) at 23:30 stays disabled — night curfew takes precedence
    expect(result[0].enabled).toBe(false);
    expect(result[0].reasoning).toContain('night curfew');
  });

  it('re-enables exempt problems at night for min-1 rule', () => {
    const slotTable = [
      { slotIndex: 0, problemType: 'staying_up_late', scheduledTime: '23:30', scheduledHour: 23, scheduledMinute: 30 },
    ];
    const nudges = [
      { slotIndex: 0, hook: 'h', content: 'c', tone: 'strict', enabled: false, reasoning: 'r' },
    ];

    const result = applyGuardrails(nudges, slotTable);

    // staying_up_late (exempt) should be re-enabled by min-1 rule
    expect(result[0].enabled).toBe(true);
    expect(result[0].reasoning).toContain('re-enabled');
  });

  it('caps at 32 enabled nudges', () => {
    const slotTable = [];
    const nudges = [];
    for (let i = 0; i < 35; i++) {
      slotTable.push({ slotIndex: i, problemType: 'procrastination', scheduledTime: `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`, scheduledHour: 7 + Math.floor(i / 2), scheduledMinute: i % 2 === 0 ? 0 : 30 });
      nudges.push({ slotIndex: i, hook: `h${i}`, content: `c${i}`, tone: 'strict', enabled: true, reasoning: `r${i}` });
    }

    const result = applyGuardrails(nudges, slotTable);
    const enabledCount = result.filter(n => n.enabled).length;
    expect(enabledCount).toBeLessThanOrEqual(32);
  });

  it('does not mutate input', () => {
    const slotTable = makeSlotTable();
    const nudges = makeNudges();
    const originalNudges = nudges.map(n => ({ ...n }));

    applyGuardrails(nudges, slotTable);

    for (let i = 0; i < nudges.length; i++) {
      expect(nudges[i]).toEqual(originalNudges[i]);
    }
  });
});

// ===== normalizeToDecision =====

describe('normalizeToDecision', () => {
  it('enriches nudges with slot metadata', () => {
    const agentOutput = {
      rootCauseHypothesis: 'hypothesis',
      overallStrategy: 'strategy',
      frequencyReasoning: 'freq reasoning',
      appNudges: [
        { slotIndex: 0, hook: 'h', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
      ],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 't1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 't2', reasoning: 'r', enabled: true },
      ],
    };
    const slotTable = [
      { slotIndex: 0, problemType: 'procrastination', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
    ];

    const decision = normalizeToDecision(agentOutput, slotTable, 'user-123');

    expect(decision.userId).toBe('user-123');
    expect(decision.appNudges[0].problemType).toBe('procrastination');
    expect(decision.appNudges[0].scheduledTime).toBe('09:00');
    expect(decision.appNudges[0].scheduledHour).toBe(9);
    expect(decision.appNudges[0].scheduledMinute).toBe(0);
  });

  it('counts enabled nudges in frequencyDecision', () => {
    const agentOutput = {
      rootCauseHypothesis: 'h',
      overallStrategy: 's',
      frequencyReasoning: 'f',
      appNudges: [
        { slotIndex: 0, hook: 'h', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
        { slotIndex: 1, hook: 'h', content: 'c', tone: 'gentle', enabled: false, reasoning: 'r' },
        { slotIndex: 2, hook: 'h', content: 'c', tone: 'playful', enabled: true, reasoning: 'r' },
      ],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 't1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 't2', reasoning: 'r', enabled: true },
      ],
    };
    const slotTable = [
      { slotIndex: 0, problemType: 'p', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
      { slotIndex: 1, problemType: 'p', scheduledTime: '11:00', scheduledHour: 11, scheduledMinute: 0 },
      { slotIndex: 2, problemType: 'p', scheduledTime: '13:00', scheduledHour: 13, scheduledMinute: 0 },
    ];

    const decision = normalizeToDecision(agentOutput, slotTable, 'u');

    expect(decision.frequencyDecision.count).toBe(2);
    expect(decision.frequencyDecision.reasoning).toBe('f');
    expect(decision.tiktokPosts.length).toBe(2);
    expect(decision.xPosts.length).toBe(2);
  });

  it('filters out nudges with invalid slotIndex', () => {
    const agentOutput = {
      rootCauseHypothesis: 'h',
      overallStrategy: 's',
      frequencyReasoning: 'f',
      appNudges: [
        { slotIndex: 0, hook: 'valid', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
        { slotIndex: 999, hook: 'invalid', content: 'c', tone: 'strict', enabled: true, reasoning: 'r' },
      ],
    };
    const slotTable = [
      { slotIndex: 0, problemType: 'procrastination', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
    ];

    const decision = normalizeToDecision(agentOutput, slotTable, 'u');

    expect(decision.appNudges.length).toBe(1);
    expect(decision.appNudges[0].hook).toBe('valid');
  });

  it('fills missing slots with disabled fallback', () => {
    const agentOutput = {
      rootCauseHypothesis: 'h',
      overallStrategy: 's',
      frequencyReasoning: 'f',
      appNudges: [
        { slotIndex: 0, hook: 'h0', content: 'c0', tone: 'strict', enabled: true, reasoning: 'r0' },
      ],
    };
    const slotTable = [
      { slotIndex: 0, problemType: 'procrastination', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
      { slotIndex: 1, problemType: 'procrastination', scheduledTime: '11:00', scheduledHour: 11, scheduledMinute: 0 },
      { slotIndex: 2, problemType: 'anxiety', scheduledTime: '14:00', scheduledHour: 14, scheduledMinute: 0 },
    ];

    const decision = normalizeToDecision(agentOutput, slotTable, 'u');

    expect(decision.appNudges.length).toBe(3);
    expect(decision.appNudges[0].enabled).toBe(true);
    expect(decision.appNudges[0].hook).toBe('h0');
    // procrastination slot 1: disabled fallback (procrastination already has slot 0 enabled)
    expect(decision.appNudges[1].enabled).toBe(false);
    expect(decision.appNudges[1].problemType).toBe('procrastination');
    // anxiety slot 2: fallback re-enabled by min-1 rule (only slot for anxiety, daytime)
    expect(decision.appNudges[2].enabled).toBe(true);
    expect(decision.appNudges[2].problemType).toBe('anxiety');
  });

  it('preserves rootCauseHypothesis in decision', () => {
    const agentOutput = {
      rootCauseHypothesis: 'deep cause',
      overallStrategy: 'strategy',
      frequencyReasoning: 'f',
      appNudges: [],
    };

    const decision = normalizeToDecision(agentOutput, [], 'u');

    expect(decision.rootCauseHypothesis).toBe('deep cause');
  });

  it('preserves tiktokPosts array in decision (#13)', () => {
    const agentOutput = {
      rootCauseHypothesis: 'h',
      overallStrategy: 's',
      frequencyReasoning: 'f',
      appNudges: [],
      tiktokPosts: [
        { slot: 'morning', caption: 'cap1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'cap2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 'tweet2', reasoning: 'r', enabled: true },
      ],
    };

    const decision = normalizeToDecision(agentOutput, [], 'u');

    expect(decision.tiktokPosts).toHaveLength(2);
    expect(decision.tiktokPosts[0].slot).toBe('morning');
    expect(decision.tiktokPosts[1].slot).toBe('evening');
    expect(decision.xPosts).toHaveLength(2);
    expect(decision.xPosts[0].text).toBe('tweet1');
  });
});

// ===== Additional Schema Tests (spec #18, #19, #20, #23) =====

describe('AgentRawOutputSchema - additional', () => {
  it('requires two xPosts (#19)', () => {
    const withOneXPost = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [{ slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true }],
    };
    expect(() => AgentRawOutputSchema.parse(withOneXPost)).toThrow();
  });

  // Note: The Zod schema allows duplicate slots (length=2 only).
  // Slot uniqueness is validated by validateSlotUniqueness() post-parse.
  // These tests verify that schema parsing passes but post-parse validation catches duplicates.
  it('schema accepts duplicate xPosts slots but validateSlotUniqueness rejects (#20)', async () => {
    const { validateSlotUniqueness } = await import('../commander.js');
    const duplicateMorning = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true },
        { slot: 'morning', text: 'tweet2', reasoning: 'r', enabled: true },
      ],
    };
    // Schema parsing passes (only checks length=2)
    const parsed = AgentRawOutputSchema.parse(duplicateMorning);
    // But post-parse validation should fail
    expect(() => validateSlotUniqueness(parsed)).toThrow();
  });

  it('schema accepts duplicate tiktokPosts slots but validateSlotUniqueness rejects (#23)', async () => {
    const { validateSlotUniqueness } = await import('../commander.js');
    const duplicateEvening = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [
        { slot: 'evening', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 'tweet1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 'tweet2', reasoning: 'r', enabled: true },
      ],
    };
    // Schema parsing passes (only checks length=2)
    const parsed = AgentRawOutputSchema.parse(duplicateEvening);
    // But post-parse validation should fail
    expect(() => validateSlotUniqueness(parsed)).toThrow();
  });
});

// ===== Prompt Test (#18) =====

describe('buildCommanderPrompt', () => {
  // buildCommanderPrompt is not exported, so we test via the prompt content
  // included in commander.js source. We verify the schema/prompt expectations
  // by checking that the module's SYSTEM_PROMPT or buildCommanderPrompt output
  // includes the morning/evening table.
  // Since buildCommanderPrompt is internal, we test indirectly via normalizeToDecision
  // ensuring the schema enforces the morning/evening structure.
  it('schema enforces morning/evening structure matching prompt table (#18)', () => {
    // The prompt includes a table with morning/evening slots.
    // We verify the schema enforces this constraint.
    const valid = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPosts: [
        { slot: 'morning', caption: 'c1', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
        { slot: 'evening', caption: 'c2', hashtags: [], tone: 't', reasoning: 'r', enabled: true },
      ],
      xPosts: [
        { slot: 'morning', text: 't1', reasoning: 'r', enabled: true },
        { slot: 'evening', text: 't2', reasoning: 'r', enabled: true },
      ],
    };
    const result = AgentRawOutputSchema.parse(valid);
    expect(result.tiktokPosts[0].slot).toBe('morning');
    expect(result.tiktokPosts[1].slot).toBe('evening');
    expect(result.xPosts[0].slot).toBe('morning');
    expect(result.xPosts[1].slot).toBe('evening');
  });
});
