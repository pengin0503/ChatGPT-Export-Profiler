import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConversationMetricRecord } from '../../src/storage/db';

const { queryConversationMetrics } = vi.hoisted(() => ({
  queryConversationMetrics: vi.fn()
}));

vi.mock('../../src/storage/analyticsQueries', () => ({
  queryConversationMetrics
}));

import { ConversationsPage } from '../../src/features/conversations/ConversationsPage';

function row(index: number): ConversationMetricRecord {
  return {
    analysisId: 'analysis-many',
    conversationId: `conversation-${String(index).padStart(5, '0')}`,
    title: `Conversation ${index}`,
    messages: 1,
    visibleTokens: index,
    inputTokens: index,
    outputTokens: 0,
    otherTokens: 0,
    modelIds: ['gpt-6-sol'],
    hasWeb: false,
    hasFiles: false,
    hasTools: false
  };
}

afterEach(() => {
  cleanup();
  queryConversationMetrics.mockReset();
});

describe('conversation pagination contract', () => {
  it('reaches rows beyond the previous 10,000-row cap with a bounded page request', async () => {
    queryConversationMetrics
      .mockResolvedValueOnce({
        total: 10_001,
        rows: Array.from({ length: 500 }, (_, index) => row(10_000 - index))
      })
      .mockResolvedValueOnce({
        total: 10_001,
        rows: [row(0)]
      });

    const user = userEvent.setup();
    render(<ConversationsPage analysisId="analysis-many" />);

    expect(await screen.findByText('Showing 500 of 10,001 conversations')).toBeVisible();
    expect(screen.getByText('1 / 21')).toBeVisible();
    expect(queryConversationMetrics).toHaveBeenNthCalledWith(
      1,
      'analysis-many',
      expect.objectContaining({ offset: 0, limit: 500, sort: 'visibleTokens-desc' })
    );

    await user.click(screen.getByRole('button', { name: '»' }));

    expect(await screen.findByText('Showing 1 of 10,001 conversations')).toBeVisible();
    expect(screen.getByText('21 / 21')).toBeVisible();
    await waitFor(() => {
      expect(queryConversationMetrics).toHaveBeenNthCalledWith(
        2,
        'analysis-many',
        expect.objectContaining({ offset: 10_000, limit: 500, sort: 'visibleTokens-desc' })
      );
    });
  });
});
