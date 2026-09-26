import type { AnalysisRecord } from '../../storage/repositories';

export function canSurfaceRecoveredCheckpoint(status: string): boolean {
  return status === 'idle';
}

export function isRetryableResumeSelectionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = typeof error.code === 'string' ? error.code : '';
  return code === 'FINGERPRINT_MISMATCH' || code === 'ZIP_SAFETY_BLOCKED';
}

export function newestCompletedAnalysis(
  analyses: readonly AnalysisRecord[],
  fingerprint: string
): AnalysisRecord | undefined {
  return analyses
    .filter((analysis) => analysis.status === 'complete' && analysis.fingerprint === fingerprint)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0];
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
