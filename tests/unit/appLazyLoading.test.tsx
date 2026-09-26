import { describe, expect, it, vi } from 'vitest';

const secondaryModuleLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/features/overview/OverviewPage', () => {
  secondaryModuleLoads.count += 1;
  return { OverviewPage: () => null };
});
vi.mock('../../src/features/models/ModelsPage', () => {
  secondaryModuleLoads.count += 1;
  return { ModelsPage: () => null };
});
vi.mock('../../src/features/timeline/TimelinePage', () => {
  secondaryModuleLoads.count += 1;
  return { TimelinePage: () => null };
});
vi.mock('../../src/features/conversations/ConversationsPage', () => {
  secondaryModuleLoads.count += 1;
  return { ConversationsPage: () => null };
});
vi.mock('../../src/features/cost/CostPage', () => {
  secondaryModuleLoads.count += 1;
  return { CostPage: () => null };
});
vi.mock('../../src/features/tools/ToolsPage', () => {
  secondaryModuleLoads.count += 1;
  return { ToolsPage: () => null };
});
vi.mock('../../src/features/data-quality/DataQualityPage', () => {
  secondaryModuleLoads.count += 1;
  return { DataQualityPage: () => null };
});
vi.mock('../../src/features/comparison/ComparisonPage', () => {
  secondaryModuleLoads.count += 1;
  return { ComparisonPage: () => null };
});
vi.mock('../../src/features/settings/SettingsPage', () => {
  secondaryModuleLoads.count += 1;
  return { SettingsPage: () => null };
});

describe('application module loading', () => {
  it('does not evaluate secondary page modules when the application shell is loaded', async () => {
    expect(secondaryModuleLoads.count).toBe(0);

    await import('../../src/app/App');

    expect(secondaryModuleLoads.count).toBe(0);
  });
});
