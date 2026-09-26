import type { PerformanceProfileName } from '../../import/pipelineProtocol';
import { DEFAULT_ZIP_SAFETY, type ZipSafetyPolicy } from '../../import/zipInspector';
import { openProfilerDb } from '../../storage/db';

export type PerformancePreference = 'auto' | PerformanceProfileName;
export type ZipSafetyPreference = 'default' | 'expanded';

export const EXPANDED_ZIP_SAFETY: ZipSafetyPolicy = {
  ...DEFAULT_ZIP_SAFETY,
  maxEntries: 100_000,
  maxConversationBytes: 16 * 1024 * 1024 * 1024
};

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await openProfilerDb();
  try {
    await db.put('settings', { key, value });
  } finally {
    db.close();
  }
}

export async function loadSetting<T>(key: string): Promise<T | undefined> {
  const db = await openProfilerDb();
  try {
    return (await db.get('settings', key))?.value as T | undefined;
  } finally {
    db.close();
  }
}

export async function loadModelAliases(): Promise<Record<string, string>> {
  const db = await openProfilerDb();
  try {
    const aliases: Record<string, string> = {};
    for (const record of await db.getAll('settings')) {
      if (!record.key.startsWith('model-alias:')) continue;
      if (typeof record.value !== 'object' || record.value === null) continue;
      const value = record.value as Record<string, unknown>;
      const raw = typeof value.raw === 'string' ? value.raw.trim() : '';
      const canonical = typeof value.canonical === 'string' ? value.canonical.trim() : '';
      if (raw && canonical) aliases[raw] = canonical;
    }
    return aliases;
  } finally {
    db.close();
  }
}

export function resolvePerformancePreference(
  preference: PerformancePreference,
  hardwareConcurrency = typeof navigator === 'undefined' ? 4 : navigator.hardwareConcurrency
): PerformanceProfileName {
  if (preference !== 'auto') return preference;
  if (hardwareConcurrency >= 8) return 'fast';
  if (hardwareConcurrency <= 4) return 'safe';
  return 'standard';
}

export async function loadEffectivePerformanceProfile(): Promise<PerformanceProfileName> {
  const stored = await loadSetting<PerformancePreference>('performance-profile');
  const preference: PerformancePreference = stored === 'safe' || stored === 'standard' || stored === 'fast' || stored === 'auto'
    ? stored
    : 'auto';
  return resolvePerformancePreference(preference);
}

export async function loadZipSafetyPolicy(): Promise<ZipSafetyPolicy> {
  const stored = await loadSetting<ZipSafetyPreference>('zip-safety-policy');
  return stored === 'expanded' ? EXPANDED_ZIP_SAFETY : DEFAULT_ZIP_SAFETY;
}
