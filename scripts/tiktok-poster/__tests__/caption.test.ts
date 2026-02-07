import { describe, it, expect } from 'vitest';
import { generateCaption } from '../src/caption.js';

describe('Caption', () => {
  // ─────────────────────────────────────────────
  // Test #12: caption includes problemType and CTA
  // ─────────────────────────────────────────────
  it('test_caption_generation_includes_problemType_and_cta', () => {
    const caption = generateCaption({
      cardId: 'staying_up_late_0',
      language: 'en',
      problemType: 'staying_up_late',
    });

    expect(caption).toContain('staying_up_late');
    expect(caption).toContain('anicca'); // CTA / brand mention
  });

  // ─────────────────────────────────────────────
  // Test #28: caption includes deterministic card_key
  // ─────────────────────────────────────────────
  it('test_caption_includes_card_key', () => {
    const caption = generateCaption({
      cardId: 'staying_up_late_0',
      language: 'en',
      problemType: 'staying_up_late',
    });

    // Must contain [card_key] where card_key = {card_id}_{language}
    expect(caption).toContain('[staying_up_late_0_en]');
  });

  it('test_caption_card_key_for_ja', () => {
    const caption = generateCaption({
      cardId: 'cant_wake_up_3',
      language: 'ja',
      problemType: 'cant_wake_up',
    });

    expect(caption).toContain('[cant_wake_up_3_ja]');
  });
});
