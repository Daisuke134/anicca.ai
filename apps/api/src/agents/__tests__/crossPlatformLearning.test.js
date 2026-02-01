import { describe, it, expect, beforeEach } from 'vitest';
import {
  unifiedScore,
  zScore,
  _setBaselines,
  _getBaselines,
  X_TO_TIKTOK_THRESHOLD,
  TIKTOK_TO_APP_THRESHOLD,
  MIN_APP_SAMPLES,
  MIN_TIKTOK_SAMPLES,
  MIN_X_SAMPLES,
  W_APP,
  W_TIK,
  W_X,
} from '../crossPlatformLearning.js';

// Reset baselines before each test for determinism
beforeEach(() => {
  _setBaselines({
    appMean: 0.25, appStddev: 0.15,
    tikMean: 0.05, tikStddev: 0.03,
    xMean: 0.02, xStddev: 0.015,
  });
});

// ===== zScore =====

describe('zScore', () => {
  it('returns 0 for mean value', () => {
    expect(zScore(0.25, 0.25, 0.15)).toBe(0);
  });

  it('returns 1 for 1 stddev above mean', () => {
    expect(zScore(0.40, 0.25, 0.15)).toBeCloseTo(1.0);
  });

  it('returns -1 for 1 stddev below mean', () => {
    expect(zScore(0.10, 0.25, 0.15)).toBeCloseTo(-1.0);
  });

  it('returns 0 for zero stddev', () => {
    expect(zScore(0.5, 0.25, 0)).toBe(0);
  });
});

// ===== unifiedScore =====

describe('unifiedScore', () => {
  it('returns 0 for hook with no samples', () => {
    const hook = {
      appTapRate: 0.5, appSampleSize: 0,
      tiktokLikeRate: 0.1, tiktokSampleSize: 0,
      xEngagementRate: 0.05, xSampleSize: 0,
    };
    expect(unifiedScore(hook)).toBe(0);
  });

  it('weights app score at 50%', () => {
    const hook = {
      appTapRate: 0.40, appSampleSize: 10,  // 1 stddev above = Z=1.0
      tiktokLikeRate: 0.05, tiktokSampleSize: 0,  // no data
      xEngagementRate: 0.02, xSampleSize: 0,  // no data
    };
    const score = unifiedScore(hook);
    // Only app contributes: 0.5 * 1.0 = 0.5
    expect(score).toBeCloseTo(0.5);
  });

  it('combines all three platforms', () => {
    const hook = {
      appTapRate: 0.40, appSampleSize: 10,     // appZ = 1.0
      tiktokLikeRate: 0.08, tiktokSampleSize: 5,  // tikZ = 1.0
      xEngagementRate: 0.035, xSampleSize: 15,    // xZ = 1.0
    };
    const score = unifiedScore(hook);
    // 0.5*1.0 + 0.3*1.0 + 0.2*1.0 = 1.0
    expect(score).toBeCloseTo(1.0);
  });

  it('ignores platforms below minimum samples', () => {
    const hook = {
      appTapRate: 0.40, appSampleSize: 3,      // below MIN_APP_SAMPLES=5
      tiktokLikeRate: 0.08, tiktokSampleSize: 1,  // below MIN_TIKTOK_SAMPLES=3
      xEngagementRate: 0.05, xSampleSize: 5,      // below MIN_X_SAMPLES=10
    };
    expect(unifiedScore(hook)).toBe(0);
  });

  it('handles negative Z-scores (below average hooks)', () => {
    const hook = {
      appTapRate: 0.10, appSampleSize: 10,     // appZ = -1.0
      tiktokLikeRate: 0.02, tiktokSampleSize: 5,  // tikZ = -1.0
      xEngagementRate: 0.005, xSampleSize: 15,    // xZ = -1.0
    };
    const score = unifiedScore(hook);
    expect(score).toBeCloseTo(-1.0);
  });
});

// ===== Promotion Thresholds =====

describe('promotion thresholds', () => {
  it('X → TikTok threshold is 1.0', () => {
    expect(X_TO_TIKTOK_THRESHOLD).toBe(1.0);
  });

  it('TikTok → App threshold is 1.5', () => {
    expect(TIKTOK_TO_APP_THRESHOLD).toBe(1.5);
  });
});

// ===== Weights =====

describe('platform weights', () => {
  it('sum to 1.0', () => {
    expect(W_APP + W_TIK + W_X).toBeCloseTo(1.0);
  });

  it('App has highest weight', () => {
    expect(W_APP).toBeGreaterThan(W_TIK);
    expect(W_TIK).toBeGreaterThan(W_X);
  });
});

// ===== Baselines =====

describe('baselines', () => {
  it('can be set and retrieved', () => {
    _setBaselines({ appMean: 0.30, appStddev: 0.20 });
    const b = _getBaselines();
    expect(b.APP_MEAN).toBe(0.30);
    expect(b.APP_STDDEV).toBe(0.20);
  });

  it('partial updates preserve other values', () => {
    _setBaselines({ xMean: 0.05 });
    const b = _getBaselines();
    expect(b.X_MEAN).toBe(0.05);
    expect(b.APP_MEAN).toBe(0.25); // unchanged
  });
});
