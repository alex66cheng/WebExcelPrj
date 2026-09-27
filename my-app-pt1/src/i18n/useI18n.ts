import { useCallback, useContext } from 'react';
import { LanguageContext, type LanguageContextValue } from './LanguageContext';
import { interpolate, type Dict, type TParams } from './lang';

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

// const t = useT(dict);  t('saveButton')  t('deletedFile', { name })
export function useT<E extends Record<string, string>>(dict: Dict<E>) {
  const { lang } = useLanguage();
  return useCallback(
    (key: keyof E & string, params?: TParams) => interpolate(dict[lang][key] ?? dict.en[key] ?? key, params),
    [dict, lang]
  );
}
