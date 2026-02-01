/**
 * scheduleMap — ProblemType ごとの固定時刻スロット
 * iOS ProblemType.swift:notificationSchedule と完全一致（Single Source of Truth）
 *
 * 日付境界ルール: 00:00-05:59 は「翌日」扱い（sortKey = hour + 24）
 */

export const SCHEDULE_MAP = {
  staying_up_late:     ['20:00', '21:00', '22:00', '23:00', '00:00', '01:00'],
  cant_wake_up:        ['06:00', '06:15', '06:30', '08:00', '22:15'],
  self_loathing:       ['07:00', '12:00', '14:45', '17:00', '19:00'],
  rumination:          ['08:30', '18:00', '19:30', '21:15', '22:45'],
  procrastination:     ['09:00', '11:00', '13:00', '15:00', '18:30'],
  anxiety:             ['07:30', '10:00', '14:00', '17:30', '20:45'],
  lying:               ['08:15', '11:30', '14:30', '16:30', '19:15'],
  bad_mouthing:        ['08:45', '12:30', '15:15', '17:15', '20:30'],
  porn_addiction:       ['21:30', '22:30', '23:30', '00:30', '01:30'],
  alcohol_dependency:  ['17:45', '19:45', '21:45', '23:15', '00:15'],
  anger:               ['07:45', '10:30', '13:30', '16:00', '18:45'],
  obsessive:           ['08:00', '11:15', '14:15', '16:45', '20:15'],
  loneliness:          ['07:15', '12:15', '18:15', '20:00', '22:00'],
};

/** 5 tones used by Commander Agent */
export const NUDGE_TONES = ['strict', 'gentle', 'empathetic', 'analytical', 'playful'];

/**
 * Parse "HH:MM" → { hour, minute }
 */
export function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return { hour: h, minute: m };
}

/**
 * Sort key for date-boundary-aware sorting.
 * 00:00-05:59 → +24h offset (treated as next day).
 */
export function timeSortKey(timeStr) {
  const { hour, minute } = parseTime(timeStr);
  const adjustedHour = hour < 6 ? hour + 24 : hour;
  return adjustedHour * 60 + minute;
}

/**
 * Build flattenedSlotTable from user's selected problem types.
 * Sorted by: time ascending (with date boundary) → alphabetical problemType for ties.
 *
 * @param {string[]} problemTypes - User's selected problem types
 * @returns {Array<{slotIndex: number, problemType: string, scheduledTime: string, scheduledHour: number, scheduledMinute: number}>}
 */
export function buildFlattenedSlotTable(problemTypes) {
  const slots = [];

  for (const pt of problemTypes) {
    const times = SCHEDULE_MAP[pt];
    if (!times) continue;
    for (const time of times) {
      const { hour, minute } = parseTime(time);
      slots.push({
        problemType: pt,
        scheduledTime: time,
        scheduledHour: hour,
        scheduledMinute: minute,
        _sortKey: timeSortKey(time),
      });
    }
  }

  // Sort: time ascending → alphabetical problemType for ties
  slots.sort((a, b) => {
    if (a._sortKey !== b._sortKey) return a._sortKey - b._sortKey;
    return a.problemType.localeCompare(b.problemType);
  });

  // Assign slotIndex and remove _sortKey
  return slots.map((slot, i) => ({
    slotIndex: i,
    problemType: slot.problemType,
    scheduledTime: slot.scheduledTime,
    scheduledHour: slot.scheduledHour,
    scheduledMinute: slot.scheduledMinute,
  }));
}

/**
 * Trim slots to maxSlots using equal distribution.
 * Algorithm: floor(maxSlots / problemCount) per problem, extra to first alphabetical problems.
 *
 * @param {Array} allSlots - Full flattenedSlotTable (pre-sorted)
 * @param {string[]} problemTypes - User's selected problem types
 * @param {number} maxSlots - Maximum slots (default 32)
 * @returns {Array} Trimmed flattenedSlotTable with re-assigned slotIndex
 */
export function trimSlots(allSlots, problemTypes, maxSlots = 32) {
  if (allSlots.length <= maxSlots) return allSlots;

  const sortedProblems = [...problemTypes].sort();
  const base = Math.floor(maxSlots / sortedProblems.length);
  const extra = maxSlots - (base * sortedProblems.length);

  // Build per-problem allocation
  const allocation = {};
  sortedProblems.forEach((pt, i) => {
    allocation[pt] = base + (i < extra ? 1 : 0);
  });

  // Select slots: for each problem, take first N slots (by time order)
  const perProblem = {};
  for (const slot of allSlots) {
    if (!perProblem[slot.problemType]) perProblem[slot.problemType] = [];
    perProblem[slot.problemType].push(slot);
  }

  const selected = [];
  for (const pt of sortedProblems) {
    const slots = perProblem[pt] || [];
    const count = allocation[pt] || 0;
    selected.push(...slots.slice(0, count));
  }

  // Re-sort by time and re-assign slotIndex
  selected.sort((a, b) => {
    const aKey = timeSortKey(a.scheduledTime);
    const bKey = timeSortKey(b.scheduledTime);
    if (aKey !== bKey) return aKey - bKey;
    return a.problemType.localeCompare(b.problemType);
  });

  return selected.map((slot, i) => ({
    ...slot,
    slotIndex: i,
  }));
}
