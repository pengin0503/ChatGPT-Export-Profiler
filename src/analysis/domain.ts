export type MetricProvenance = 'observed' | 'calculated' | 'estimated';
export type AnalysisId = string;
export type CanonicalModelId = string;

export interface NormalizedToolEvent {
  kind: 'web-search' | 'file' | 'image' | 'python' | 'connector' | 'unknown';
  rawType: string;
}

export interface NormalizedMessage {
  conversationId: string;
  messageId: string;
  parentId?: string;
  role: string;
  createdAt?: number;
  updatedAt?: number;
  canonicalModelId?: CanonicalModelId;
  rawModelSlug?: string;
  text: string;
  toolEvents: NormalizedToolEvent[];
  attachmentCount: number;
  unknownMetadataKeys: string[];
}

export interface NormalizedConversation {
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
  messages: NormalizedMessage[];
}

export interface AnalysisSummary {
  analysisId: AnalysisId;
  conversations: number;
  messages: number;
  visibleTokens: number;
}

export function provenanceLabel(value: MetricProvenance): MetricProvenance {
  return value;
}
