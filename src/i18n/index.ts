import { createContext, useContext } from 'react';
import { en, type TranslationKey } from './en';
import { ja } from './ja';

export type Locale = 'en' | 'ja';
type Dictionary = Record<TranslationKey, string>;

const dictionaries: Record<Locale, Dictionary> = { en, ja };

export function detectLocale(language = globalThis.navigator?.language ?? 'en'): Locale {
  return language.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function t(key: TranslationKey, locale: Locale = detectLocale()): string {
  return dictionaries[locale][key] ?? en[key];
}

export function formatMessage(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}

export function isTranslationKey(value: string): value is TranslationKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

export const I18nContext = createContext<I18nValue>({
  locale: 'en',
  setLocale: () => undefined,
  t: (key) => en[key]
});

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export type { TranslationKey } from './en';
