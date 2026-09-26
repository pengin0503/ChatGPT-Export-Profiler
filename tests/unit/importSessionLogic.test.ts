import { describe, expect, it } from 'vitest';
import {
  canSurfaceRecoveredCheckpoint,
  isRetryableResumeSelectionError,
  newestCompletedAnalysis
} from '../../src/features/import/importSessionLogic';
import type { AnalysisRecord } from '../../src/storage/repositories';

function analysis(id: string, createdAt: number, fingerprint: string, status: AnalysisRecord['status'] = 'complete'): AnalysisRecord {
  return {
    id,
    fingerprint,
    createdAt,
    status,
    appVersion: '0.1.0',
    schemaVersion: 1,
    analyzerVersion: 1,
    tokenizerVersion: 1,
    pricingDatasetVersion: 1
  };
}

describe('import session recovery logic', () => {
  it('surfaces startup recovery only while the session is still idle', () => {
    expect(canSurfaceRecoveredCheckpoint('idle')).toBe(true);
    expect(canSurfaceRecoveredCheckpoint('inspecting')).toBe(false);
    expect(canSurfaceRecoveredCheckpoint('running')).toBe(false);
    expect(canSurfaceRecoveredCheckpoint('complete')).toBe(false);
  });

  it('keeps a durable checkpoint when the selected resume ZIP is wrong or blocked', () => {
    expect(isRetryableResumeSelectionError({ code: 'FINGERPRINT_MISMATCH' })).toBe(true);
    expect(isRetryableResumeSelectionError({ code: 'ZIP_SAFETY_BLOCKED' })).toBe(true);
    expect(isRetryableResumeSelectionError({ code: 'ANALYSIS_WORKER_FAILED' })).toBe(false);
  });

  it('selects the newest completed analysis for a duplicate fingerprint', () => {
    const records = [
      analysis('old', 100, 'same'),
      analysis('failed-newer', 400, 'same', 'failed'),
      analysis('newest', 300, 'same'),
      analysis('other', 500, 'other')
    ];

    expect(newestCompletedAnalysis(records, 'same')?.id).toBe('newest');
  });
});
