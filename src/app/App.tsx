import { useState } from 'react';
import { navigationItems } from './navigation';
import { useI18n } from '../i18n';
import { ImportPage } from '../features/import/ImportPage';
import type { ImportSummary } from '../features/import/useImportSession';
import { OverviewPage } from '../features/overview/OverviewPage';
import { ModelsPage } from '../features/models/ModelsPage';
import { TimelinePage } from '../features/timeline/TimelinePage';
import { ConversationsPage } from '../features/conversations/ConversationsPage';
import { CostPage } from '../features/cost/CostPage';
import { ToolsPage } from '../features/tools/ToolsPage';
import { DataQualityPage } from '../features/data-quality/DataQualityPage';
import { ComparisonPage } from '../features/comparison/ComparisonPage';
import { SettingsPage } from '../features/settings/SettingsPage';

type ActivePage =
  | 'import'
  | 'overview'
  | 'models'
  | 'timeline'
  | 'conversations'
  | 'cost'
  | 'tools'
  | 'comparison'
  | 'data-quality'
  | 'settings';

interface CompletedAnalysis {
  analysisId: string;
  summary: ImportSummary;
}

const supportedPages = new Set<ActivePage>([
  'import', 'overview', 'models', 'timeline', 'conversations', 'cost', 'tools', 'comparison', 'data-quality', 'settings'
]);

export function App() {
  const { locale, setLocale, t } = useI18n();
  const [activePage, setActivePage] = useState<ActivePage>('import');
  const [completed, setCompleted] = useState<CompletedAnalysis>();

  const handleComplete = (analysisId: string, summary: ImportSummary) => {
    setCompleted({ analysisId, summary });
    setActivePage('overview');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-mark" aria-hidden="true">CEP</div>
        <nav>
          <ul className="nav-list">
            {navigationItems.map((item) => {
              const supported = supportedPages.has(item.id as ActivePage);
              const disabled = !supported || (item.requiresAnalysis && !completed);
              const active = item.id === activePage;
              return (
                <li key={item.id}>
                  <button
                    className={active ? 'nav-item nav-item-active' : 'nav-item'}
                    type="button"
                    disabled={disabled}
                    title={disabled ? t('status.notReady') : undefined}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      if (supported && (!item.requiresAnalysis || completed)) setActivePage(item.id as ActivePage);
                    }}
                  >
                    {t(item.labelKey)}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">LOCAL EXPORT ANALYSIS</p>
            <h1>{t('app.name')}</h1>
            <p className="tagline">{t('app.tagline')}</p>
          </div>
          <label className="locale-control">
            <span className="sr-only">Language</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as 'en' | 'ja')}>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
        </header>

        {activePage === 'import' ? <ImportPage onComplete={handleComplete} /> : null}
        {completed && activePage === 'overview' ? <OverviewPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'models' ? <ModelsPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'timeline' ? <TimelinePage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'conversations' ? <ConversationsPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'cost' ? <CostPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'tools' ? <ToolsPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'data-quality' ? <DataQualityPage analysisId={completed.analysisId} /> : null}
        {completed && activePage === 'comparison' ? <ComparisonPage analysisId={completed.analysisId} /> : null}
        {activePage === 'settings' ? (
          <SettingsPage
            analysisId={completed?.analysisId}
            onAnalysisDeleted={() => {
              setCompleted(undefined);
              setActivePage('import');
            }}
          />
        ) : null}
      </main>
    </div>
  );
}
