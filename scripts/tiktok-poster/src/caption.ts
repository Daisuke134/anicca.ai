import type { Language } from './types.js';

interface CaptionInput {
  cardId: string;
  language: Language;
  problemType: string;
}

const HASHTAGS: Record<Language, string> = {
  en: '#mentalhealth #habits #selfimprovement #anicca',
  ja: '#メンタルヘルス #習慣 #自己改善 #anicca',
};

const CTA: Record<Language, string> = {
  en: 'Download Anicca - the app that understands your struggles.',
  ja: 'Anicca - あなたの「苦しみ」に寄り添うアプリ',
};

/** Generate a TikTok caption with deterministic card_key for reconciliation */
export function generateCaption(input: CaptionInput): string {
  const { cardId, language, problemType } = input;
  const cardKey = `${cardId}_${language}`;
  const tag = problemType.replace(/_/g, '');

  return [
    `#${tag}`,
    CTA[language],
    HASHTAGS[language],
    `[${cardKey}]`,
  ].join('\n\n');
}
