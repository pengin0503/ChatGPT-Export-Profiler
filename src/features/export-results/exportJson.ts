export type ExportMetricProvenance = 'observed' | 'calculated' | 'estimated' | 'reported';

export interface AnalyticsExportConversation {
  title?: string;
  visibleTokens: number;
  messages: number;
  modelIds: string[];
}

export interface AnalyticsExportModel {
  modelId: string;
  visibleTokens: number;
  inputTokens: number;
  outputTokens: number;
  messages: number;
  conversations: number;
  rawAliases: string[];
}

export interface AnalyticsExportScenario {
  lowerUsd: number;
  upperUsd: number;
  provenance: 'estimated';
  modelId: string;
  assumptions: {
    cacheRatio: number;
    hiddenInputOverheadRatio: number;
    reasoningOutputOverheadRatio: number;
  };
}

export interface AnalyticsExportPricing {
  modelId: string;
  effectiveFrom: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  source?: string;
}

export interface AnalyticsExport {
  schemaVersion: 1;
  generatedAt: string;
  overview: {
    conversations: number;
    messages: number;
    visibleTokens: number;
    peakDay: string | null;
    largestConversationTitle: string | null;
  };
  models: AnalyticsExportModel[];
  conversations: AnalyticsExportConversation[];
  cost?: {
    visibleApiEquivalentUsd?: number;
    visibleProvenance?: 'calculated';
    scenario?: AnalyticsExportScenario;
    pricing?: AnalyticsExportPricing[];
    coverageGaps?: string[];
  };
}

export interface AnalyticsExportPrivacyOptions {
  includeConversationTitles?: boolean;
}

export function sanitizeAnalyticsExportConversation(
  value: AnalyticsExportConversation,
  options: AnalyticsExportPrivacyOptions = {}
): AnalyticsExportConversation {
  return {
    ...(options.includeConversationTitles && value.title !== undefined ? { title: value.title } : {}),
    visibleTokens: value.visibleTokens,
    messages: value.messages,
    modelIds: [...value.modelIds]
  };
}

export function sanitizeAnalyticsExport(
  value: AnalyticsExport,
  options: AnalyticsExportPrivacyOptions = {}
): AnalyticsExport {
  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    overview: {
      conversations: value.overview.conversations,
      messages: value.overview.messages,
      visibleTokens: value.overview.visibleTokens,
      peakDay: value.overview.peakDay,
      largestConversationTitle: options.includeConversationTitles ? value.overview.largestConversationTitle : null
    },
    models: value.models.map((model) => ({
      modelId: model.modelId,
      visibleTokens: model.visibleTokens,
      inputTokens: model.inputTokens,
      outputTokens: model.outputTokens,
      messages: model.messages,
      conversations: model.conversations,
      rawAliases: [...model.rawAliases]
    })),
    conversations: value.conversations.map((conversation) => sanitizeAnalyticsExportConversation(conversation, options)),
    ...(value.cost ? {
      cost: {
        ...(value.cost.visibleApiEquivalentUsd !== undefined
          ? { visibleApiEquivalentUsd: value.cost.visibleApiEquivalentUsd }
          : {}),
        ...(value.cost.visibleProvenance ? { visibleProvenance: value.cost.visibleProvenance } : {}),
        ...(value.cost.pricing ? {
          pricing: value.cost.pricing.map((record) => ({
            modelId: record.modelId,
            effectiveFrom: record.effectiveFrom,
            inputPerMillion: record.inputPerMillion,
            cachedInputPerMillion: record.cachedInputPerMillion,
            outputPerMillion: record.outputPerMillion,
            ...(record.source ? { source: record.source } : {})
          }))
        } : {}),
        ...(value.cost.coverageGaps ? { coverageGaps: [...value.cost.coverageGaps] } : {}),
        ...(value.cost.scenario ? {
          scenario: {
            lowerUsd: value.cost.scenario.lowerUsd,
            upperUsd: value.cost.scenario.upperUsd,
            provenance: 'estimated' as const,
            modelId: value.cost.scenario.modelId,
            assumptions: {
              cacheRatio: value.cost.scenario.assumptions.cacheRatio,
              hiddenInputOverheadRatio: value.cost.scenario.assumptions.hiddenInputOverheadRatio,
              reasoningOutputOverheadRatio: value.cost.scenario.assumptions.reasoningOutputOverheadRatio
            }
          }
        } : {})
      }
    } : {})
  };
}

export function exportJson(value: AnalyticsExport, options: AnalyticsExportPrivacyOptions = {}): string {
  return JSON.stringify(sanitizeAnalyticsExport(value, options), null, 2);
}
