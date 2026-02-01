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

  it('allows optional tiktokPost and xPosts', () => {
    const withOptionals = {
      rootCauseHypothesis: 'test',
      overallStrategy: 'test',
      frequencyReasoning: 'test',
      appNudges: [],
      tiktokPost: { hook: 'h', caption: 'c', tone: 't', reasoning: 'r' },
      xPosts: [{ text: 'tweet', reasoning: 'r' }],
    };
    expect(() => AgentRawOutputSchema.parse(withOptionals)).not.toThrow();
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
    };
    const slotTable = [
      { slotIndex: 0, problemType: 'p', scheduledTime: '09:00', scheduledHour: 9, scheduledMinute: 0 },
      { slotIndex: 1, problemType: 'p', scheduledTime: '11:00', scheduledHour: 11, scheduledMinute: 0 },
      { slotIndex: 2, problemType: 'p', scheduledTime: '13:00', scheduledHour: 13, scheduledMinute: 0 },
    ];

    const decision = normalizeToDecision(agentOutput, slotTable, 'u');

    expect(decision.frequencyDecision.count).toBe(2);
    expect(decision.frequencyDecision.reasoning).toBe('f');
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
    expect(decision.appNudges[1].enabled).toBe(false);
    expect(decision.appNudges[1].problemType).toBe('procrastination');
    expect(decision.appNudges[2].enabled).toBe(false);
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

  it('passes through tiktokPost and xPosts', () => {
    const agentOutput = {
      rootCauseHypothesis: 'h',
      overallStrategy: 's',
      frequencyReasoning: 'f',
      appNudges: [],
      tiktokPost: { hook: 'tk', caption: 'cap', tone: 't', reasoning: 'r' },
      xPosts: [{ text: 'tweet', reasoning: 'r' }],
    };

    const decision = normalizeToDecision(agentOutput, [], 'u');

    expect(decision.tiktokPost.hook).toBe('tk');
    expect(decision.xPosts[0].text).toBe('tweet');
  });
});
