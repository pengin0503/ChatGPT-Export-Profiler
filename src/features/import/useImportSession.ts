import { useCallback, useEffect, useMemo, useState } from 'react';
import { fingerprintImport } from '../../analysis/fingerprint';
import { ImportController } from './importController';
import type { ImportStage } from '../../storage/db';
import {
  analysisRepository,
  checkpointRepository,
  metricsRepository,
  type ImportCheckpoint
} from '../../storage/repositories';
import { inspectExportZip } from '../../import/zipInspector';
import { loadEffectivePerformanceProfile, loadZipSafetyPolicy } from '../settings/preferences';

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
  | { status: 'failed'; code: string; messageKey: string }
  | { status: 'complete'; analysisId: string; summary: ImportSummary };

export interface ImportSessionModel {
  state: ImportSessionState;
  selectFile(file: File): Promise<void>;
  cancel(): void;
  openExisting(): Promise<void>;
  reanalyze(): Promise<void>;
}

export interface UseImportSessionOptions {
  enabled?: boolean;
}

async function readSummary(analysisId: string): Promise<ImportSummary> {
  const records = await metricsRepository.listConversationMetrics(analysisId);
  return records.reduce<ImportSummary>(
    (summary, record) => ({
      conversations: summary.conversations + 1,
      messages: summary.messages + record.messages,
      visibleTokens: summary.visibleTokens + record.visibleTokens
    }),
    { conversations: 0, messages: 0, visibleTokens: 0 }
  );
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
      if (active && latest) setState({ status: 'recoverable', checkpoint: latest });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);

  const startFresh = useCallback(async (file: File): Promise<void> => {
    const analysisId = crypto.randomUUID();
    setState({
      status: 'running',
      analysisId,
      stage: 'inspection',
      processedConversations: 0,
      startedAt: Date.now(),
      warnings: []
    });
    try {
      const [profile, zipSafetyPolicy] = await Promise.all([
        loadEffectivePerformanceProfile(),
        loadZipSafetyPolicy()
      ]);
      await controller.start(file, { profile, analysisId, zipSafetyPolicy });
    } catch (error) {
      setState(failureState(error));
    }
  }, [controller]);

  const selectFile = useCallback(async (file: File): Promise<void> => {
    const checkpoint = state.status === 'recoverable'
      ? state.checkpoint
      : state.status === 'cancelled' ? state.checkpoint : undefined;

    if (checkpoint) {
      setState({
        status: 'running',
        analysisId: checkpoint.analysisId,
        stage: checkpoint.stage,
        processedConversations: checkpoint.processedConversations,
        startedAt: Date.now(),
        warnings: []
      });
      try {
        const [profile, zipSafetyPolicy] = await Promise.all([
          loadEffectivePerformanceProfile(),
          loadZipSafetyPolicy()
        ]);
        await controller.resume(file, checkpoint, { profile, zipSafetyPolicy });
      } catch (error) {
        setState(failureState(error));
      }
      return;
    }

    setState({ status: 'inspecting' });
    try {
      const zipSafetyPolicy = await loadZipSafetyPolicy();
      const inspection = await inspectExportZip(file, zipSafetyPolicy);
      if (!inspection.ok || !inspection.conversationEntry) {
        setState({ status: 'failed', code: 'ZIP_SAFETY_BLOCKED', messageKey: 'import.zipSafetyBlocked' });
        return;
      }

      const fingerprint = await fingerprintImport(file, inspection);
      const analyses = await analysisRepository.list();
      const existing = analyses.find((analysis) => analysis.status === 'complete' && analysis.fingerprint === fingerprint.hash);
      if (existing) {
        setState({ status: 'duplicate', file, existingAnalysisId: existing.id, fingerprint: fingerprint.hash });
        return;
      }
      await startFresh(file);
    } catch (error) {
      setState(failureState(error));
    }
  }, [controller, startFresh, state]);

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

  return { state, selectFile, cancel, openExisting, reanalyze };
}
