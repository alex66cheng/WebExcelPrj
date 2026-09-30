import { createContext } from 'react';
import type { Lang } from './lang';

export interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
