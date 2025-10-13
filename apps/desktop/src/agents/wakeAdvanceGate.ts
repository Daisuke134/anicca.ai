let wakeLocked = false;

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
