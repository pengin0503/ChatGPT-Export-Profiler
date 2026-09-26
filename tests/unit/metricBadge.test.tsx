import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricBadge } from '../../src/components/MetricBadge';

describe('MetricBadge', () => {
  it('exposes provenance as visible text rather than color alone', () => {
    render(<MetricBadge label="Estimated processing" value="12–18M" provenance="estimated" />);

    expect(screen.getByText('Estimated processing')).toBeVisible();
    expect(screen.getByText('12–18M')).toBeVisible();
    expect(screen.getByText('estimated')).toBeVisible();
  });
});
