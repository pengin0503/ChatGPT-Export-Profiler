import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nContext, t as translate } from '../../src/i18n';
import { ModelsPage } from '../../src/features/models/ModelsPage';
import { TimelinePage } from '../../src/features/timeline/TimelinePage';
import { ConversationsPage } from '../../src/features/conversations/ConversationsPage';
import { CostPage } from '../../src/features/cost/CostPage';
import { ToolsPage } from '../../src/features/tools/ToolsPage';
import { ComparisonPage } from '../../src/features/comparison/ComparisonPage';
import { DataQualityPage } from '../../src/features/data-quality/DataQualityPage';
import { PROFILER_DB_NAME } from '../../src/storage/db';

async function resetDb(): Promise<void> {
  cleanup();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PROFILER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database deletion blocked.'));
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
});

function renderJapanese(ui: React.ReactNode) {
  return render(
    <I18nContext.Provider value={{ locale: 'ja', setLocale: vi.fn(), t: (key) => translate(key, 'ja') }}>
      {ui}
    </I18nContext.Provider>
  );
}

describe('Codex review localization regression', () => {
  it('renders core analytics labels in Japanese across every reviewed analytics view', async () => {
    renderJapanese(<ModelsPage analysisId="localization-models" />);
    expect(await screen.findByText('計算済みモデル内訳')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'トークン' })).toBeVisible();
    cleanup();

    renderJapanese(<TimelinePage analysisId="localization-timeline" />);
    expect(screen.getByText('事前集計アクティビティ')).toBeVisible();
    expect(screen.getByText('バケット')).toBeVisible();
    expect(screen.getByText('曜日 / 時間ヒートマップ概要')).toBeVisible();
    cleanup();

    renderJapanese(<ConversationsPage analysisId="localization-conversations" />);
    expect(screen.getByText('派生指標のみ')).toBeVisible();
    expect(screen.getByText('最小トークン')).toBeVisible();
    expect(await screen.findByText('0件中0件の会話を表示')).toBeVisible();
    cleanup();

    renderJapanese(<CostPage analysisId="localization-cost" />);
    expect(screen.getByText('API相当分析')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'コスト' })).toBeVisible();
    expect(await screen.findByText('推定処理シナリオ')).toBeVisible();
    cleanup();

    renderJapanese(<ToolsPage analysisId="localization-tools" />);
    expect(screen.getByText('検出されたエクスポートメタデータ')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'ツール / Web' })).toBeVisible();
    cleanup();

    renderJapanese(<ComparisonPage analysisId="localization-comparison" />);
    expect(screen.getByText('クロスサーフェス比較')).toBeVisible();
    expect(screen.getByRole('heading', { name: '比較' })).toBeVisible();
    cleanup();

    renderJapanese(<DataQualityPage analysisId="localization-quality" />);
    expect(screen.getByText('解析の信頼性')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'カバレッジ' })).toBeVisible();
  });
});
