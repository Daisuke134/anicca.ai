let wakeLocked = false;
let wakeRoutineActive = false;

export function lockWakeAdvance(reason: string) {
  wakeLocked = true;
  console.log('[WAKE_ADVANCE_LOCK]', { reason });
}

export function unlockWakeAdvance(reason: string) {
  if (!wakeLocked) return;
  wakeLocked = false;
  console.log('[WAKE_ADVANCE_UNLOCK]', { reason });
}

export function ensureWakeAdvanceAllowed(routineId: string) {
  if (routineId !== 'wake') return;
  if (wakeLocked) {
    throw new Error('advance_routine_step denied: wake routine requires user audio before advancing');
  }
}

export function markWakeRoutineActive(reason: string) {
  wakeRoutineActive = true;
  console.log('[WAKE_ROUTINE_ACTIVE]', { reason });
}

export function markWakeRoutineInactive(reason: string) {
  if (!wakeRoutineActive) return;
  wakeRoutineActive = false;
  console.log('[WAKE_ROUTINE_INACTIVE]', { reason });
}

export function isWakeRoutineActive(): boolean {
  return wakeRoutineActive;
}
