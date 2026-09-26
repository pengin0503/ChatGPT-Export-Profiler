import type { TranslationKey } from '../i18n';

export interface NavigationItem {
  id: string;
  labelKey: TranslationKey;
  requiresAnalysis: boolean;
}

export const navigationItems: NavigationItem[] = [
  { id: 'import', labelKey: 'nav.import', requiresAnalysis: false },
  { id: 'overview', labelKey: 'nav.overview', requiresAnalysis: true },
  { id: 'timeline', labelKey: 'nav.timeline', requiresAnalysis: true },
  { id: 'models', labelKey: 'nav.models', requiresAnalysis: true },
  { id: 'conversations', labelKey: 'nav.conversations', requiresAnalysis: true },
  { id: 'cost', labelKey: 'nav.cost', requiresAnalysis: true },
  { id: 'tools', labelKey: 'nav.tools', requiresAnalysis: true },
  { id: 'comparison', labelKey: 'nav.comparison', requiresAnalysis: true },
  { id: 'data-quality', labelKey: 'nav.dataQuality', requiresAnalysis: true },
  { id: 'settings', labelKey: 'nav.settings', requiresAnalysis: false }
];
