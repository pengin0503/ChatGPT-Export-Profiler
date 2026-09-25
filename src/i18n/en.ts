export const en = {
  'app.name': 'ChatGPT Export Profiler',
  'app.tagline': 'Inspect your ChatGPT export without sending it anywhere.',
  'privacy.local': 'Analysis stays local in this browser. No upload, backend, telemetry, CDN, or API key is required.',
  'import.action': 'Import export ZIP',
  'import.empty': 'Choose a ChatGPT data export ZIP to begin local analysis.',
  'nav.import': 'Import',
  'nav.overview': 'Overview',
  'nav.timeline': 'Timeline',
  'nav.models': 'Models',
  'nav.conversations': 'Conversations',
  'nav.cost': 'Cost',
  'nav.tools': 'Tools',
  'nav.comparison': 'Comparison',
  'nav.dataQuality': 'Data quality',
  'nav.settings': 'Settings',
  'status.notReady': 'Available after import'
} as const;

export type TranslationKey = keyof typeof en;
