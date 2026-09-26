import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nContext, t as translate } from '../../src/i18n';
import { SettingsPage } from '../../src/features/settings/SettingsPage';
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

describe('settings localization', () => {
  it('renders settings and nested controls from the Japanese dictionary', async () => {
    render(
      <I18nContext.Provider value={{ locale: 'ja', setLocale: vi.fn(), t: (key) => translate(key, 'ja') }}>
        <SettingsPage />
      </I18nContext.Provider>
    );

    expect(screen.getByRole('heading', { name: '設定' })).toBeVisible();
    expect(screen.getByText('表示言語')).toBeVisible();
    expect(screen.getByText('インポート性能プロファイル')).toBeVisible();
    expect(screen.getByText('ZIP安全ポリシー')).toBeVisible();
    expect(screen.getByText('モデル別名')).toBeVisible();
    expect(screen.getByText('ローカル料金上書き')).toBeVisible();
    expect(screen.getByText('ストレージ')).toBeVisible();
  });
});
