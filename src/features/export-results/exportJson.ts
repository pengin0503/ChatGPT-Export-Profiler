export type ExportMetricProvenance = 'observed' | 'calculated' | 'estimated' | 'reported';

export interface AnalyticsExportConversation {
  title: string;
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
  };
}

export function sanitizeAnalyticsExport(value: AnalyticsExport): AnalyticsExport {
  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    overview: {
      conversations: value.overview.conversations,
      messages: value.overview.messages,
      visibleTokens: value.overview.visibleTokens,
      peakDay: value.overview.peakDay,
      largestConversationTitle: value.overview.largestConversationTitle
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
    conversations: value.conversations.map((conversation) => ({
      title: conversation.title,
      visibleTokens: conversation.visibleTokens,
      messages: conversation.messages,
      modelIds: [...conversation.modelIds]
    })),
    ...(value.cost ? {
      cost: {
        ...(value.cost.visibleApiEquivalentUsd !== undefined
          ? { visibleApiEquivalentUsd: value.cost.visibleApiEquivalentUsd }
          : {}),
        ...(value.cost.visibleProvenance ? { visibleProvenance: value.cost.visibleProvenance } : {}),
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

export function exportJson(value: AnalyticsExport): string {
  return JSON.stringify(sanitizeAnalyticsExport(value), null, 2);
}
