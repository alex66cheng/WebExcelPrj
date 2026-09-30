// 🌐 Multi-language core (no external i18n library): supported languages,
// browser-language detection, persistence, and type-checked dictionaries.

export const LANGS = ['en', 'ja', 'zh-TW'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  ja: '日本語',
  'zh-TW': '繁體中文',
};

const LANG_STORAGE_KEY = 'webexcelprj_lang';

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

// First visit: follow the browser (ja* → ja, zh* → zh-TW), otherwise English.
function detectBrowserLang(): Lang {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const tag = (raw || '').toLowerCase();
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('zh')) return 'zh-TW';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}

export function getCurrentLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // storage unavailable (private mode etc.) — fall back to detection
  }
  return detectBrowserLang();
}

export function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore storage failures
  }
}

export type TParams = Record<string, string | number>;

// "Hello {name}" + { name: 'Ann' } → "Hello Ann"
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

// Each page owns one dictionary. English is the source of truth for the keys;
// ja / zh-TW must provide exactly the same keys, so a missing or misspelled
// translation is a TypeScript error instead of a blank label at runtime.
export type Dict<E extends Record<string, string>> = {
  en: E;
  ja: Record<keyof E, string>;
  'zh-TW': Record<keyof E, string>;
};

export function defineDict<const E extends Record<string, string>>(dict: Dict<E>): Dict<E> {
  return dict;
}
