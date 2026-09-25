import type { NormalizedConversation, NormalizedMessage } from './domain';
import { resolveModel, type ModelAliasOverrides } from './modelRegistry';
import { QualityCollector } from './quality';
import { detectToolEvents } from './toolDetection';

export interface NormalizeConversationOptions {
  modelAliases?: ModelAliasOverrides;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getConversationId(raw: Record<string, unknown>): string | undefined {
  return asString(raw.id) ?? asString(raw.conversation_id);
}

function extractText(content: unknown): string {
  if (!isRecord(content) || !Array.isArray(content.parts)) return '';
  const parts: string[] = [];
  for (const part of content.parts) {
    if (typeof part === 'string') {
      parts.push(part);
    } else if (isRecord(part) && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }
  return parts.join('\n');
}

function attachmentKey(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  if (!isRecord(value)) return undefined;
  return asString(value.id) ?? asString(value.file_id) ?? asString(value.asset_pointer);
}

function countAttachments(content: unknown, metadata: Record<string, unknown>): number {
  const references = new Set<string>();
  const attachments = metadata.attachments;
  if (Array.isArray(attachments)) {
    attachments.forEach((value, index) => references.add(attachmentKey(value) ?? `metadata:${index}`));
  }
  if (isRecord(content) && Array.isArray(content.parts)) {
    content.parts.forEach((part, index) => {
      if (!isRecord(part)) return;
      const reference = asString(part.asset_pointer) ?? asString(part.file_id);
      if (reference) references.add(reference);
      else if (part.content_type === 'image_asset_pointer' || part.content_type === 'file') references.add(`part:${index}`);
    });
  }
  return references.size;
}

const KNOWN_METADATA_KEYS = new Set([
  'model_slug',
  'default_model_slug',
  'tool_name',
  'tool_type',
  'tool',
  'recipient',
  'invoked_plugin',
  'attachments',
  'gizmo_id',
  'request_id',
  'message_type',
  'finish_details',
  'citations',
  'content_references'
]);

function unknownMetadataKeys(metadata: Record<string, unknown>, quality: QualityCollector): string[] {
  const keys = Object.keys(metadata).filter((key) => !KNOWN_METADATA_KEYS.has(key));
  for (const key of keys) quality.addUnknownSchema(key);
  return keys;
}

function getRole(message: Record<string, unknown>, quality: QualityCollector): string {
  if (isRecord(message.author)) {
    const role = asString(message.author.role);
    if (role) return role;
  }
  quality.addWarning('message-missing-role');
  return 'unknown';
}

function getMetadata(message: Record<string, unknown>): Record<string, unknown> {
  return isRecord(message.metadata) ? message.metadata : {};
}

export function normalizeConversation(
  raw: unknown,
  quality: QualityCollector,
  options: NormalizeConversationOptions = {}
): NormalizedConversation | null {
  if (!isRecord(raw)) {
    quality.addRecoverable('conversation-not-object');
    return null;
  }

  const conversationId = getConversationId(raw);
  if (!conversationId) {
    quality.addRecoverable('conversation-missing-id');
    return null;
  }

  if (!isRecord(raw.mapping) || Object.keys(raw.mapping).length === 0) {
    quality.addRecoverable('conversation-missing-mapping');
    return null;
  }

  const entries = Object.entries(raw.mapping);
  const messageIdByNode = new Map<string, string>();

  for (const [nodeKey, nodeValue] of entries) {
    if (!isRecord(nodeValue)) {
      quality.addRecoverable('mapping-node-not-object');
      continue;
    }
    if (nodeValue.message === null || nodeValue.message === undefined) continue;
    if (!isRecord(nodeValue.message)) {
      quality.addRecoverable('message-not-object');
      continue;
    }
    const messageId = asString(nodeValue.message.id) ?? asString(nodeValue.id) ?? nodeKey;
    messageIdByNode.set(nodeKey, messageId);
  }

  const messages: NormalizedMessage[] = [];
  for (const [nodeKey, nodeValue] of entries) {
    if (!isRecord(nodeValue) || nodeValue.message === null || nodeValue.message === undefined) continue;
    if (!isRecord(nodeValue.message)) continue;

    const message = nodeValue.message;
    const messageId = messageIdByNode.get(nodeKey);
    if (!messageId) {
      quality.addRecoverable('message-missing-id');
      continue;
    }

    const metadata = getMetadata(message);
    const rawModelSlug = asString(metadata.model_slug) ?? asString(metadata.default_model_slug);
    const resolution = rawModelSlug ? resolveModel(rawModelSlug, options.modelAliases) : undefined;
    if (resolution) quality.recordModelIdentification(Boolean(resolution.canonicalId));

    const parentNodeId = asString(nodeValue.parent);
    const content = message.content;
    messages.push({
      conversationId,
      messageId,
      parentId: parentNodeId ? messageIdByNode.get(parentNodeId) : undefined,
      role: getRole(message, quality),
      createdAt: asNumber(message.create_time),
      updatedAt: asNumber(message.update_time),
      canonicalModelId: resolution?.canonicalId,
      rawModelSlug,
      text: extractText(content),
      toolEvents: detectToolEvents(metadata),
      attachmentCount: countAttachments(content, metadata),
      unknownMetadataKeys: unknownMetadataKeys(metadata, quality)
    });
  }

  if (messages.length === 0) {
    quality.addRecoverable('conversation-no-valid-messages');
    return null;
  }

  return {
    id: conversationId,
    title: asString(raw.title) ?? '',
    createdAt: asNumber(raw.create_time),
    updatedAt: asNumber(raw.update_time),
    messages
  };
}
