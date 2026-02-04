import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * generateNudges.js は直接実行スクリプト（export なし）。
 * runGenerateNudges() 内で runCrossPlatformSync が呼ばれることを検証する。
 *
 * 戦略: ソースコードを静的解析 + syncCrossPlatform.js のユニットテストでカバー。
 */

const generaTeNudgesSource = readFileSync(
  resolve(import.meta.dirname, '../../jobs/generateNudges.js'),
  'utf-8'
);

describe('generateNudges integration', () => {
  it('imports and calls runCrossPlatformSync (#16)', () => {
    // Verify import statement
    expect(generaTeNudgesSource).toContain(
      "import { runCrossPlatformSync } from './syncCrossPlatform.js'"
    );
    // Verify it's called within runGenerateNudges
    expect(generaTeNudgesSource).toContain('await runCrossPlatformSync(query)');
  });

  it('wraps runCrossPlatformSync in try/catch for graceful degradation (#24)', () => {
    // Verify try/catch around the sync call
    const syncCallIndex = generaTeNudgesSource.indexOf('await runCrossPlatformSync(query)');
    expect(syncCallIndex).toBeGreaterThan(0);

    // Find the nearest preceding "try" block
    const beforeSync = generaTeNudgesSource.substring(0, syncCallIndex);
    const lastTry = beforeSync.lastIndexOf('try {');
    expect(lastTry).toBeGreaterThan(0);

    // Find catch after the sync call
    const afterSync = generaTeNudgesSource.substring(syncCallIndex);
    const catchIndex = afterSync.indexOf('catch');
    expect(catchIndex).toBeGreaterThan(0);

    // Verify it's a non-fatal handler (console.warn, not throw)
    const catchBlock = afterSync.substring(catchIndex, catchIndex + 200);
    expect(catchBlock).toContain('warn');
  });

  it('imports and calls runAggregateTypeStats', () => {
    expect(generaTeNudgesSource).toContain(
      "import { runAggregateTypeStats } from './aggregateTypeStats.js'"
    );
    expect(generaTeNudgesSource).toContain('await runAggregateTypeStats(query)');
  });

  it('wraps runAggregateTypeStats in try/catch for graceful degradation', () => {
    const syncCallIndex = generaTeNudgesSource.indexOf('await runAggregateTypeStats(query)');
    expect(syncCallIndex).toBeGreaterThan(0);

    const beforeSync = generaTeNudgesSource.substring(0, syncCallIndex);
    const lastTry = beforeSync.lastIndexOf('try {');
    expect(lastTry).toBeGreaterThan(0);

    const afterSync = generaTeNudgesSource.substring(syncCallIndex);
    const catchIndex = afterSync.indexOf('catch');
    expect(catchIndex).toBeGreaterThan(0);

    const catchBlock = afterSync.substring(catchIndex, catchIndex + 200);
    expect(catchBlock).toContain('warn');
  });
});
