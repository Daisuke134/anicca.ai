import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_MAP,
  NUDGE_TONES,
  parseTime,
  timeSortKey,
  buildFlattenedSlotTable,
  trimSlots,
} from '../scheduleMap.js';

// ===== SCHEDULE_MAP =====

describe('SCHEDULE_MAP', () => {
  it('has 13 problem types', () => {
    expect(Object.keys(SCHEDULE_MAP)).toHaveLength(13);
  });

  it('each problem has 5-6 time slots', () => {
    for (const [pt, times] of Object.entries(SCHEDULE_MAP)) {
      expect(times.length).toBeGreaterThanOrEqual(5);
      expect(times.length).toBeLessThanOrEqual(6);
    }
  });

  it('all time strings match HH:MM format', () => {
    for (const times of Object.values(SCHEDULE_MAP)) {
      for (const t of times) {
        expect(t).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });
});

// ===== NUDGE_TONES =====

describe('NUDGE_TONES', () => {
  it('has 5 tones', () => {
    expect(NUDGE_TONES).toHaveLength(5);
  });

  it('includes strict, gentle, empathetic, analytical, playful', () => {
    expect(NUDGE_TONES).toEqual(['strict', 'gentle', 'empathetic', 'analytical', 'playful']);
  });
});

// ===== parseTime =====

describe('parseTime', () => {
  it('parses "09:00" correctly', () => {
    expect(parseTime('09:00')).toEqual({ hour: 9, minute: 0 });
  });

  it('parses "22:30" correctly', () => {
    expect(parseTime('22:30')).toEqual({ hour: 22, minute: 30 });
  });

  it('parses "00:15" correctly', () => {
    expect(parseTime('00:15')).toEqual({ hour: 0, minute: 15 });
  });
});

// ===== timeSortKey =====

describe('timeSortKey', () => {
  it('normal hours return hour*60+minute', () => {
    expect(timeSortKey('09:00')).toBe(9 * 60);
    expect(timeSortKey('22:30')).toBe(22 * 60 + 30);
  });

  it('00:00-05:59 get +24h offset (date boundary rule)', () => {
    expect(timeSortKey('00:00')).toBe(24 * 60);
    expect(timeSortKey('01:30')).toBe(25 * 60 + 30);
    expect(timeSortKey('05:59')).toBe(29 * 60 + 59);
  });

  it('06:00 does NOT get offset', () => {
    expect(timeSortKey('06:00')).toBe(6 * 60);
  });

  it('23:00 < 00:00 in sort order (date boundary)', () => {
    expect(timeSortKey('23:00')).toBeLessThan(timeSortKey('00:00'));
  });

  it('00:00 < 01:00 in sort order', () => {
    expect(timeSortKey('00:00')).toBeLessThan(timeSortKey('01:00'));
  });
});

// ===== buildFlattenedSlotTable =====

describe('buildFlattenedSlotTable', () => {
  it('returns empty array for empty problems', () => {
    expect(buildFlattenedSlotTable([])).toEqual([]);
  });

  it('returns empty for unknown problem type', () => {
    expect(buildFlattenedSlotTable(['unknown_type'])).toEqual([]);
  });

  it('single problem returns sorted slots with sequential slotIndex', () => {
    const slots = buildFlattenedSlotTable(['procrastination']);
    expect(slots).toHaveLength(5);
    expect(slots[0].slotIndex).toBe(0);
    expect(slots[4].slotIndex).toBe(4);
    // All should be procrastination
    for (const s of slots) {
      expect(s.problemType).toBe('procrastination');
    }
  });

  it('two problems are sorted by time then alphabetical', () => {
    const slots = buildFlattenedSlotTable(['staying_up_late', 'procrastination']);
    // First slot should be earliest time
    expect(slots[0].scheduledTime).toBe('09:00');
    expect(slots[0].problemType).toBe('procrastination');

    // slotIndex is sequential
    for (let i = 0; i < slots.length; i++) {
      expect(slots[i].slotIndex).toBe(i);
    }
  });

  it('date boundary: staying_up_late 23:00 < 00:00 < 01:00', () => {
    const slots = buildFlattenedSlotTable(['staying_up_late']);
    const times = slots.map(s => s.scheduledTime);
    // Should be: 20:00, 21:00, 22:00, 23:00, 00:00, 01:00
    expect(times).toEqual(['20:00', '21:00', '22:00', '23:00', '00:00', '01:00']);
  });

  it('same-time slots are alphabetically ordered by problemType', () => {
    // obsessive has 08:00, cant_wake_up has 08:00
    const slots = buildFlattenedSlotTable(['obsessive', 'cant_wake_up']);
    const at0800 = slots.filter(s => s.scheduledTime === '08:00');
    expect(at0800).toHaveLength(2);
    expect(at0800[0].problemType).toBe('cant_wake_up'); // alphabetical
    expect(at0800[1].problemType).toBe('obsessive');
  });
});

// ===== trimSlots =====

describe('trimSlots', () => {
  it('returns all slots when under maxSlots', () => {
    const slots = buildFlattenedSlotTable(['procrastination']);
    const trimmed = trimSlots(slots, ['procrastination'], 32);
    expect(trimmed).toHaveLength(5);
  });

  it('trims to maxSlots with equal distribution', () => {
    // 13 problems × 5-6 slots = 67 total > 32
    const allProblems = Object.keys(SCHEDULE_MAP);
    const slots = buildFlattenedSlotTable(allProblems);
    expect(slots.length).toBeGreaterThan(32);

    const trimmed = trimSlots(slots, allProblems, 32);
    expect(trimmed.length).toBeLessThanOrEqual(32);
  });

  it('each problem gets at least floor(max/n) slots', () => {
    const problems = ['staying_up_late', 'procrastination', 'anxiety'];
    const slots = buildFlattenedSlotTable(problems);
    const trimmed = trimSlots(slots, problems, 6);

    // floor(6/3) = 2 per problem
    for (const pt of problems) {
      const count = trimmed.filter(s => s.problemType === pt).length;
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it('re-assigns slotIndex after trimming', () => {
    const allProblems = Object.keys(SCHEDULE_MAP);
    const slots = buildFlattenedSlotTable(allProblems);
    const trimmed = trimSlots(slots, allProblems, 10);

    for (let i = 0; i < trimmed.length; i++) {
      expect(trimmed[i].slotIndex).toBe(i);
    }
  });

  it('trimmed slots are still sorted by time', () => {
    const problems = ['staying_up_late', 'procrastination', 'anxiety'];
    const slots = buildFlattenedSlotTable(problems);
    const trimmed = trimSlots(slots, problems, 9);

    for (let i = 1; i < trimmed.length; i++) {
      const prevKey = timeSortKey(trimmed[i - 1].scheduledTime);
      const currKey = timeSortKey(trimmed[i].scheduledTime);
      if (prevKey === currKey) {
        // Same time → alphabetical
        expect(trimmed[i - 1].problemType.localeCompare(trimmed[i].problemType)).toBeLessThanOrEqual(0);
      } else {
        expect(prevKey).toBeLessThan(currKey);
      }
    }
  });
});
