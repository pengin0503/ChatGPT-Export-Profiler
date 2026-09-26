import { fingerprintImport, type ImportFingerprint } from '../../analysis/fingerprint';
import { inspectExportZip, type ZipInspection, type ZipSafetyPolicy } from '../../import/zipInspector';
import {
  type PipelineMessage,
  type PerformanceProfileName,
  type StartImportMessage
} from '../../import/pipelineProtocol';
import { analysisRepository, type AnalysisRecord, type ImportCheckpoint } from '../../storage/repositories';
import type { AnalysisStatus } from '../../storage/db';

export interface WorkerPort {
  postMessage(message: PipelineMessage): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent<PipelineMessage>) => void): void;
}

export interface ImportStartOptions {
  profile: PerformanceProfileName;
  analysisId?: string;
  zipSafetyPolicy?: ZipSafetyPolicy;
  modelAliases?: Record<string, string>;
}

export interface ImportResumeOptions {
  profile?: PerformanceProfileName;
  zipSafetyPolicy?: ZipSafetyPolicy;
  modelAliases?: Record<string, string>;
}

export interface ImportSessionStartResult {
  analysisId: string;
  fingerprint: ImportFingerprint;
}

export type ImportControllerEvent = Exclude<PipelineMessage, StartImportMessage>;

interface ImportControllerDependencies {
  inspectZip(file: Blob, policy?: ZipSafetyPolicy): Promise<ZipInspection>;
  fingerprintImport(file: Blob, inspection: ZipInspection): Promise<ImportFingerprint>;
  createImportWorker(): WorkerPort;
  createAnalysisWorker(): WorkerPort;
  createAnalysis(record: AnalysisRecord): Promise<void>;
  updateAnalysisStatus(id: string, status: AnalysisStatus): Promise<void>;
}

const DEFAULT_DEPENDENCIES: ImportControllerDependencies = {
  inspectZip: inspectExportZip,
  fingerprintImport,
  createImportWorker: () => new Worker(new URL('../../workers/import.worker.ts', import.meta.url), { type: 'module' }),
  createAnalysisWorker: () => new Worker(new URL('../../workers/analysis.worker.ts', import.meta.url), { type: 'module' }),
  createAnalysis: (record) => analysisRepository.create(record),
  updateAnalysisStatus: (id, status) => analysisRepository.updateStatus(id, status)
};

function abortError(): Error {
  const error = new Error('Import startup was cancelled.');
  error.name = 'AbortError';
  return error;
}

export class ImportPipelineError extends Error {
  constructor(
    readonly code: string,
    readonly stage: 'inspection' | 'export-detection' | 'parsing' | 'normalization' | 'tokenization' | 'aggregation' | 'cost' | 'indexing' | 'complete',
    readonly messageKey: string
  ) {
    super(messageKey);
    this.name = 'ImportPipelineError';
  }
}

export class ImportController {
  private readonly dependencies: ImportControllerDependencies;
  private importWorker?: WorkerPort;
  private analysisWorker?: WorkerPort;
  private latestCheckpoint?: ImportCheckpoint;
  private readonly listeners = new Set<(event: ImportControllerEvent) => void>();
  private importListener?: (event: MessageEvent<PipelineMessage>) => void;
  private analysisListener?: (event: MessageEvent<PipelineMessage>) => void;
  private startupGeneration = 0;
  private activeAnalysisId?: string;

  constructor(dependencies: Partial<ImportControllerDependencies> = {}) {
    this.dependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  }

  subscribe(listener: (event: ImportControllerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLatestCheckpoint(): ImportCheckpoint | undefined {
    return this.latestCheckpoint ? { ...this.latestCheckpoint } : undefined;
  }

  private assertActiveGeneration(generation: number): void {
    if (generation !== this.startupGeneration) throw abortError();
  }

  async start(file: Blob, options: ImportStartOptions): Promise<ImportSessionStartResult> {
    const generation = ++this.startupGeneration;
    const inspection = await this.dependencies.inspectZip(file, options.zipSafetyPolicy);
    this.assertActiveGeneration(generation);
    if (!inspection.ok || !inspection.conversationEntry) {
      throw new ImportPipelineError('ZIP_SAFETY_BLOCKED', 'inspection', 'import.zipSafetyBlocked');
    }

    const fingerprint = await this.dependencies.fingerprintImport(file, inspection);
    this.assertActiveGeneration(generation);
    const analysisId = options.analysisId ?? crypto.randomUUID();
    await this.dependencies.createAnalysis({
      id: analysisId,
      fingerprint: fingerprint.hash,
      createdAt: Date.now(),
      status: 'running',
      appVersion: '0.1.0',
      schemaVersion: 1,
      analyzerVersion: 1,
      tokenizerVersion: 1,
      pricingDatasetVersion: 1
    });
    if (generation !== this.startupGeneration) {
      await this.dependencies.updateAnalysisStatus(analysisId, 'cancelled');
      throw abortError();
    }

    this.latestCheckpoint = undefined;
    this.activeAnalysisId = analysisId;
    this.beginWorkers(file, analysisId, fingerprint.hash, options.profile, undefined, options.modelAliases, options.zipSafetyPolicy);
    return { analysisId, fingerprint };
  }

  async resume(file: Blob, checkpoint: ImportCheckpoint, options: ImportResumeOptions = {}): Promise<ImportSessionStartResult> {
    const generation = ++this.startupGeneration;
    const inspection = await this.dependencies.inspectZip(file, options.zipSafetyPolicy);
    this.assertActiveGeneration(generation);
    if (!inspection.ok || !inspection.conversationEntry) {
      throw new ImportPipelineError('ZIP_SAFETY_BLOCKED', 'inspection', 'import.zipSafetyBlocked');
    }

    const fingerprint = await this.dependencies.fingerprintImport(file, inspection);
    this.assertActiveGeneration(generation);
    if (fingerprint.hash !== checkpoint.fingerprint) {
      throw new ImportPipelineError('FINGERPRINT_MISMATCH', 'inspection', 'import.fingerprintMismatch');
    }

    this.latestCheckpoint = { ...checkpoint };
    this.activeAnalysisId = checkpoint.analysisId;
    this.beginWorkers(
      file,
      checkpoint.analysisId,
      fingerprint.hash,
      options.profile ?? 'standard',
      checkpoint,
      options.modelAliases,
      options.zipSafetyPolicy
    );
    return { analysisId: checkpoint.analysisId, fingerprint };
  }

  cancel(): void {
    this.startupGeneration += 1;
    this.importWorker?.postMessage({ type: 'CANCEL' });
    this.analysisWorker?.postMessage({ type: 'CANCEL' });
    const analysisId = this.activeAnalysisId;
    this.activeAnalysisId = undefined;
    this.shutdownWorkers();
    if (analysisId) void this.dependencies.updateAnalysisStatus(analysisId, 'cancelled');
  }

  private beginWorkers(
    file: Blob,
    analysisId: string,
    fingerprint: string,
    profile: PerformanceProfileName,
    checkpoint?: ImportCheckpoint,
    modelAliases?: Record<string, string>,
    zipSafetyPolicy?: ZipSafetyPolicy
  ): void {
    this.shutdownWorkers();
    const importWorker = this.dependencies.createImportWorker();
    const analysisWorker = this.dependencies.createAnalysisWorker();
    this.importWorker = importWorker;
    this.analysisWorker = analysisWorker;

    this.importListener = (event) => this.onImportMessage(event.data);
    this.analysisListener = (event) => this.onAnalysisMessage(event.data);
    importWorker.addEventListener('message', this.importListener);
    analysisWorker.addEventListener('message', this.analysisListener);

    const common = { type: 'START_IMPORT' as const, analysisId, fingerprint, profile, checkpoint, modelAliases, zipSafetyPolicy };
    analysisWorker.postMessage(common);
    importWorker.postMessage({ ...common, file });
  }

  private captureFailureCheckpoint(message: PipelineMessage): void {
    if (message.type === 'FAIL' && message.checkpoint) {
      this.latestCheckpoint = { ...message.checkpoint };
    }
  }

  private async handleFailure(message: Extract<PipelineMessage, { type: 'FAIL' }>): Promise<void> {
    this.captureFailureCheckpoint(message);
    const analysisId = this.activeAnalysisId;
    if (analysisId) await this.dependencies.updateAnalysisStatus(analysisId, 'failed');
    this.emit(message);
    this.activeAnalysisId = undefined;
    this.shutdownWorkers();
  }

  private onImportMessage(message: PipelineMessage): void {
    if (message.type === 'BATCH') {
      this.analysisWorker?.postMessage(message);
      return;
    }
    if (message.type === 'COMPLETE' && message.source === 'import') {
      this.analysisWorker?.postMessage(message);
      this.emit(message);
      return;
    }
    if (message.type === 'FAIL') {
      void this.handleFailure(message);
      return;
    }
    if (message.type !== 'START_IMPORT') this.emit(message);
  }

  private onAnalysisMessage(message: PipelineMessage): void {
    if (message.type === 'BATCH_ACK') {
      this.latestCheckpoint = { ...message.checkpoint };
      this.importWorker?.postMessage(message);
      this.emit(message);
      return;
    }
    if (message.type === 'COMPLETE' && message.source === 'analysis') {
      this.emit(message);
      this.activeAnalysisId = undefined;
      this.shutdownWorkers();
      return;
    }
    if (message.type === 'FAIL') {
      void this.handleFailure(message);
      return;
    }
    if (message.type !== 'START_IMPORT' && message.type !== 'BATCH') this.emit(message);
  }

  private emit(event: ImportControllerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private shutdownWorkers(): void {
    if (this.importWorker && this.importListener) this.importWorker.removeEventListener('message', this.importListener);
    if (this.analysisWorker && this.analysisListener) this.analysisWorker.removeEventListener('message', this.analysisListener);
    this.importWorker?.terminate();
    this.analysisWorker?.terminate();
    this.importWorker = undefined;
    this.analysisWorker = undefined;
    this.importListener = undefined;
    this.analysisListener = undefined;
  }
}
