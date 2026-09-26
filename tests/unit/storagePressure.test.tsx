import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StoragePressureNotice } from '../../src/components/StoragePressureNotice';
import { isQuotaExceededError } from '../../src/storage/quota';

describe('storage pressure handling', () => {
  it('recognizes browser quota errors without matching unrelated failures', () => {
    expect(isQuotaExceededError(new DOMException('Storage full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaExceededError({ name: 'QuotaExceededError', message: 'synthetic quota failure' })).toBe(true);
    expect(isQuotaExceededError(new Error('QuotaExceededError in message only'))).toBe(false);
  });

  it('explains the durable checkpoint and exposes management and retry actions', async () => {
    const onManageStorage = vi.fn();
    const onRetry = vi.fn(async () => undefined);
    render(
      <StoragePressureNotice
        checkpoint={{
          analysisId: 'analysis-synthetic',
          fingerprint: 'synthetic-fingerprint',
          stage: 'aggregation',
          committedBatches: 4,
          processedConversations: 200,
          updatedAt: 1_790_000_000_000
        }}
        onManageStorage={onManageStorage}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/browser storage is full/i);
    expect(screen.getByText(/200 conversations/i)).toBeVisible();
    expect(screen.getByText(/durable checkpoint/i)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /manage storage/i }));
    await userEvent.click(screen.getByRole('button', { name: /retry import/i }));
    expect(onManageStorage).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
