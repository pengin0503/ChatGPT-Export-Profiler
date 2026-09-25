import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { detectLocale, I18nContext, t as translate, type Locale } from '../i18n';

export function AppProviders({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: Parameters<typeof translate>[0]) => translate(key, locale)
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
