import { describe, it, expect } from 'vitest';
import { formatDailyTimetable, buildSlackNudgeSummary } from '../reasoningLogger.js';

function makeDecision(overrides = {}) {
  return {
    overallStrategy: 'Focus on strict tone, reduce frequency',
    frequencyDecision: { count: 3, reasoning: 'tapRate 15%, moderate engagement' },
    appNudges: [
      { slotIndex: 0, enabled: true, problemType: 'procrastination', scheduledTime: '09:00', tone: 'strict', hook: 'やめよう', content: 'content1' },
      { slotIndex: 1, enabled: true, problemType: 'anxiety', scheduledTime: '14:00', tone: 'analytical', hook: '深呼吸してみ', content: 'content2' },
      { slotIndex: 2, enabled: false, problemType: 'staying_up_late', scheduledTime: '23:00', tone: 'gentle', hook: 'もう寝よ', content: 'content3' },
    ],
    ...overrides,
  };
}

describe('formatDailyTimetable', () => {
  it('includes user ID prefix', () => {
    const result = formatDailyTimetable('abcdefgh-1234-5678-9012-abcdefghijkl', makeDecision(), 'llm', 'ja');
    expect(result).toContain('User: abcdefgh');
  });

  it('includes mode and language', () => {
    const result = formatDailyTimetable('abc', makeDecision(), 'llm', 'ja');
    expect(result).toContain('llm');
    expect(result).toContain('ja');
  });

  it('shows enabled/total count', () => {
    const result = formatDailyTimetable('abc', makeDecision(), 'llm', 'ja');
    expect(result).toContain('2 nudges (enabled) / 3 slots');
  });

  it('marks disabled slots with [OFF]', () => {
    const result = formatDailyTimetable('abc', makeDecision(), 'llm', 'ja');
    expect(result).toContain('[OFF]');
  });

  it('includes strategy', () => {
    const result = formatDailyTimetable('abc', makeDecision(), 'llm', 'ja');
    expect(result).toContain('Focus on strict tone');
  });

  it('includes frequency count', () => {
    const result = formatDailyTimetable('abc', makeDecision(), 'llm', 'ja');
    expect(result).toContain('Frequency: 3');
  });

  it('handles empty nudges', () => {
    const result = formatDailyTimetable('abc', makeDecision({ appNudges: [] }), 'rule', 'en');
    expect(result).toContain('0 nudges (enabled) / 0 slots');
  });
});

describe('buildSlackNudgeSummary', () => {
  it('builds summary with user counts', () => {
    const results = [
      { userId: 'a', decision: makeDecision(), mode: 'llm' },
      { userId: 'b', decision: makeDecision(), mode: 'rule' },
    ];
    const payload = buildSlackNudgeSummary(results);
    expect(payload.text).toContain('Users processed: 2');
    expect(payload.text).toContain('LLM: 1');
    expect(payload.text).toContain('Rule: 1');
  });

  it('calculates total nudges (enabled only)', () => {
    const results = [
      { userId: 'a', decision: makeDecision(), mode: 'llm' },
    ];
    const payload = buildSlackNudgeSummary(results);
    expect(payload.text).toContain('Total nudges scheduled: 2');
  });

  it('handles empty results', () => {
    const payload = buildSlackNudgeSummary([]);
    expect(payload.text).toContain('Users processed: 0');
  });

  it('includes top strategies', () => {
    const results = [
      { userId: 'a', decision: makeDecision(), mode: 'llm' },
    ];
    const payload = buildSlackNudgeSummary(results);
    expect(payload.text).toContain('Focus on strict tone');
  });
});
