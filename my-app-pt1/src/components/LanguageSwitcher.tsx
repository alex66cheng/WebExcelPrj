import { LANGS, LANG_LABELS, type Lang } from '../i18n/lang';
import { useLanguage } from '../i18n/useI18n';

// 🌐 Language picker (EN / 日本語 / 繁體中文). The choice is saved per browser.
export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLanguage();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label="Language"
      title="Language / 言語 / 語言"
      className={`text-xs rounded border px-2 py-1 cursor-pointer focus:outline-none ${className}`}
    >
      {LANGS.map((l) => (
        <option key={l} value={l}>🌐 {LANG_LABELS[l]}</option>
      ))}
    </select>
  );
}
