import vi from './vi.json';
import en from './en.json';

const dictionaries = { vi, en } as const;

export type Lang = keyof typeof dictionaries;
export type TranslationKey = keyof typeof vi;

export function isLang(value: string): value is Lang {
  return value === 'vi' || value === 'en';
}

/** Dịch 1 key theo lang, thay {param} trong chuỗi. Fallback về vi nếu thiếu key ở lang kia. */
export function t(key: TranslationKey, lang: Lang, params?: Record<string, string | number>): string {
  const dict = dictionaries[lang] ?? dictionaries.vi;
  let text: string = (dict as Record<string, string>)[key] ?? (dictionaries.vi as Record<string, string>)[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}
