import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fingerprintImport } from '../../analysis/fingerprint';
import { getOverviewMetrics } from '../../storage/analyticsQueries';
import { ImportController } from './importController';
import type { ImportStage } from '../../storage/db';
import {
  analysisRepository,
  checkpointRepository,
  type ImportCheckpoint
} from '../../storage/repositories';
import { inspectExportZip } from '../../import/zipInspector';
import {
  loadEffectivePerformanceProfile,
  loadModelAliases,
  loadZipSafetyPolicy
} from '../settings/preferences';
import {
  canSurfaceRecoveredCheckpoint,
  isAbortError,
  isRetryableResumeSelectionError,
  newestCompletedAnalysis
} from './importSessionLogic';

export interface ImportSummary {
  conversations: number;
  messages: number;
  visibleTokens: number;
}

export type ImportSessionState =
  | { status: 'idle' }
  | { status: 'inspecting' }
  | { status: 'duplicate'; file: File; existingAnalysisId: string; fingerprint: string }
  | {
      status: 'running';
      analysisId: string;
      stage: ImportStage;
      processedConversations: number;
      startedAt: number;
      warnings: string[];
    }
  | { status: 'cancelled'; checkpoint?: ImportCheckpoint }
  | { status: 'recoverable'; checkpoint: ImportCheckpoint }
  | { status: 'storage-pressure'; file: File; checkpoint: ImportCheckpoint }
  | { status: 'failed'; code: string; messageKey: string }
  | { status: 'complete'; analysisId: string; summary: ImportSummary };

export interface ImportSessionModel {
  state: ImportSessionState;
  selectFile(file: File): Promise<void>;
  cancel(): void;
  openExisting(): Promise<void>;
  reanalyze(): Promise<void>;
  retryImport(): Promise<void>;
}

export interface UseImportSessionOptions {
  enabled?: boolean;
}

async function readSummary(analysisId: string): Promise<ImportSummary> {
  const overview = await getOverviewMetrics(analysisId);
  return { ...overview.totals };
}

function failureState(error: unknown): ImportSessionState {
  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : 'IMPORT_FAILED';
    const messageKey =
      'messageKey' in error && typeof error.messageKey === 'string' ? error.messageKey : 'import.failed';
    return { status: 'failed', code, messageKey };
  }
  return { status: 'failed', code: 'IMPORT_FAILED', messageKey: 'import.failed' };
}

export function useImportSession(options: UseImportSessionOptions = {}): ImportSessionModel {
  const enabled = options.enabled ?? true;
  const controller = useMemo(() => new ImportController(), []);
  const activeFileRef = useRef<File | undefined>(undefined);
  const [state, setState] = useState<ImportSessionState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) return undefined;

    return controller.subscribe((event) => {
      if (event.type === 'PROGRESS') {
        setState((current) => current.status === 'running'
          ? { ...current, stage: event.stage, processedConversations: event.processedConversations }
          : current);
        return;
      }
      if (event.type === 'WARNING') {
        setState((current) => current.status === 'running'
          ? { ...current, warnings: [...current.warnings, event.code] }
          : current);
        return;
      }
      if (event.type === 'FAIL') {
        if (event.code === 'STORAGE_QUOTA_EXCEEDED') {
          const checkpoint = event.checkpoint ?? controller.getLatestCheckpoint();
          const file = activeFileRef.current;
          if (checkpoint && file) {
            setState({ status: 'storage-pressure', file, checkpoint });
            return;
          }
        }
        setState({ status: 'failed', code: event.code, messageKey: event.messageKey });
        return;
      }
      if (event.type === 'COMPLETE' && event.source === 'analysis') {
        void readSummary(event.analysisId)
          .then((summary) => setState({ status: 'complete', analysisId: event.analysisId, summary }))
          .catch((error: unknown) => setState(failureState(error)));
      }
    });
  }, [controller, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void analysisRepository.list().then(async (analyses) => {
      const checkpoints = await Promise.all(analyses.map((analysis) => checkpointRepository.load(analysis.id)));
      const latest = checkpoints
        .filter((checkpoint): checkpoint is ImportCheckpoint => checkpoint !== undefined)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (active && latest) {
        setState((current) => canSurfaceRecoveredCheckpoint(current.status)
          ? { status: 'recoverable', checkpoint: latest }
          : current);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);

  const resumeFromCheckpoint = useCallback(async (file: File, checkpoint: ImportCheckpoint): Promise<void> => {
    activeFileRef.current = file;
    setState({
      status: 'running',
      analysisId: checkpoint.analysisId,
      stage: checkpoint.stage,
      processedConversations: checkpoint.processedConversations,
      startedAt: Date.now(),
      warnings: []
    });
    try {
      const [profile, zipSafetyPolicy, modelAliases] = await Promise.all([
        loadEffectivePerformanceProfile(),
        loadZipSafetyPolicy(),
        loadModelAliases()
      ]);
      await controller.resume(file, checkpoint, { profile, zipSafetyPolicy, modelAliases });
    } catch (error) {
      if (isAbortError(error)) return;
      if (isRetryableResumeSelectionError(error)) {
        setState({ status: 'recoverable', checkpoint });
        return;
      }
      setState(failureState(error));
    }
  }, [controller]);

  const startFresh = useCallback(async (file: File): Promise<void> => {
    const analysisId = crypto.randomUUID();
    activeFileRef.current = file;
    setState({
      status: 'running',
      analysisId,
      stage: 'inspection',
      processedConversations: 0,
      startedAt: Date.now(),
      warnings: []
    });
    try {
      const [profile, zipSafetyPolicy, modelAliases] = await Promise.all([
        loadEffectivePerformanceProfile(),
        loadZipSafetyPolicy(),
        loadModelAliases()
      ]);
      await controller.start(file, { profile, analysisId, zipSafetyPolicy, modelAliases });
    } catch (error) {
      if (isAbortError(error)) return;
      setState(failureState(error));
    }
  }, [controller]);

  const selectFile = useCallback(async (file: File): Promise<void> => {
    const checkpoint = state.status === 'recoverable'
      ? state.checkpoint
      : state.status === 'cancelled' ? state.checkpoint : undefined;

    if (checkpoint) {
      await resumeFromCheckpoint(file, checkpoint);
      return;
    }

    setState({ status: 'inspecting' });
    try {
      const zipSafetyPolicy = await loadZipSafetyPolicy();
      const inspection = await inspectExportZip(file, zipSafetyPolicy);
      const hasConversationPayload = Boolean(inspection.conversationEntry) || Boolean(inspection.conversationEntries?.length);
      if (!inspection.ok || !hasConversationPayload) {
        setState({ status: 'failed', code: 'ZIP_SAFETY_BLOCKED', messageKey: 'import.zipSafetyBlocked' });
        return;
      }

      const fingerprint = await fingerprintImport(file, inspection);
      const analyses = await analysisRepository.list();
      const existing = newestCompletedAnalysis(analyses, fingerprint.hash)
        ?? (fingerprint.legacyHash ? newestCompletedAnalysis(analyses, fingerprint.legacyHash) : undefined);
      if (existing) {
        setState({ status: 'duplicate', file, existingAnalysisId: existing.id, fingerprint: existing.fingerprint });
        return;
      }
      await startFresh(file);
    } catch (error) {
      if (isAbortError(error)) return;
      setState(failureState(error));
    }
  }, [resumeFromCheckpoint, startFresh, state]);

  const cancel = useCallback(() => {
    controller.cancel();
    const checkpoint = controller.getLatestCheckpoint();
    setState({ status: 'cancelled', checkpoint });
  }, [controller]);

  const openExisting = useCallback(async (): Promise<void> => {
    if (state.status !== 'duplicate') return;
    try {
      const summary = await readSummary(state.existingAnalysisId);
      setState({ status: 'complete', analysisId: state.existingAnalysisId, summary });
    } catch (error) {
      setState(failureState(error));
    }
  }, [state]);

  const reanalyze = useCallback(async (): Promise<void> => {
    if (state.status !== 'duplicate') return;
    await startFresh(state.file);
  }, [startFresh, state]);

  const retryImport = useCallback(async (): Promise<void> => {
    if (state.status !== 'storage-pressure') return;
    await resumeFromCheckpoint(state.file, state.checkpoint);
  }, [resumeFromCheckpoint, state]);

  return { state, selectFile, cancel, openExisting, reanalyze, retryImport };
}
