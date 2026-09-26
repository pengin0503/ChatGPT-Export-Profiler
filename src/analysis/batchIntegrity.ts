import type { NormalizedConversation } from './domain';

export interface UniqueConversationFilterResult {
  accepted: NormalizedConversation[];
  duplicateIds: string[];
}

export function filterUniqueConversations(
  conversations: readonly NormalizedConversation[],
  seenConversationIds: Set<string>
): UniqueConversationFilterResult {
  const accepted: NormalizedConversation[] = [];
  const duplicateIds: string[] = [];
  const reportedDuplicates = new Set<string>();

  for (const conversation of conversations) {
    if (seenConversationIds.has(conversation.id)) {
      if (!reportedDuplicates.has(conversation.id)) {
        reportedDuplicates.add(conversation.id);
        duplicateIds.push(conversation.id);
      }
      continue;
    }
    seenConversationIds.add(conversation.id);
    accepted.push(conversation);
  }

  return { accepted, duplicateIds };
}

export function safeKeySegment(value: string): string {
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    result += value.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return result || '0000';
}
