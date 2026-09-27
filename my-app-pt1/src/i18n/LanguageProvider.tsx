import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentLang, storeLang, type Lang } from './lang';
import { LanguageContext } from './LanguageContext';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getCurrentLang);

  // Keep <html lang> in sync so the browser picks the right fonts (CJK glyph
  // variants differ between ja and zh-TW) and screen readers the right voice.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    storeLang(next);
    setLangState(next);
  };

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}
