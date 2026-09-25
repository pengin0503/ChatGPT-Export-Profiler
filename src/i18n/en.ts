export const en = {
  'app.name': 'ChatGPT Export Profiler',
  'app.tagline': 'Inspect your ChatGPT export without sending it anywhere.',
  'privacy.local': 'Analysis stays local in this browser. No API key is required. Nothing is uploaded to a backend, telemetry service, or CDN.',
  'import.action': 'Import export ZIP',
  'import.empty': 'Choose a ChatGPT data export ZIP to begin local analysis.',
  'import.fileLabel': 'Choose ChatGPT export ZIP',
  'import.inspecting': 'Inspecting export ZIP…',
  'import.duplicate': 'Existing analysis found',
  'import.duplicateDetail': 'This export already has a completed local analysis. Open it or run a new analysis.',
  'import.openExisting': 'Open existing',
  'import.reanalyze': 'Reanalyze',
  'import.safetyBlocked': 'The ZIP did not pass the local safety inspection.',
  'import.failed': 'The import could not be completed.',
  'import.complete': 'Import complete',
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
