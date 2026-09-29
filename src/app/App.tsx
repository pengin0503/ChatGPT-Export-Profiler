import { lazy, Suspense, useState } from 'react';
import { navigationItems } from './navigation';
import { useI18n } from '../i18n';
import { ImportPage } from '../features/import/ImportPage';
import { useImportSession, type ImportSummary } from '../features/import/useImportSession';

const OverviewPage = lazy(() =>
  import('../features/overview/OverviewPage').then(({ OverviewPage }) => ({ default: OverviewPage }))
);
const ModelsPage = lazy(() =>
  import('../features/models/ModelsPage').then(({ ModelsPage }) => ({ default: ModelsPage }))
);
const TimelinePage = lazy(() =>
  import('../features/timeline/TimelinePage').then(({ TimelinePage }) => ({ default: TimelinePage }))
);
const ConversationsPage = lazy(() =>
  import('../features/conversations/ConversationsPage').then(({ ConversationsPage }) => ({ default: ConversationsPage }))
);
const CostPage = lazy(() =>
  import('../features/cost/CostPage').then(({ CostPage }) => ({ default: CostPage }))
);
const ToolsPage = lazy(() =>
  import('../features/tools/ToolsPage').then(({ ToolsPage }) => ({ default: ToolsPage }))
);
const DataQualityPage = lazy(() =>
  import('../features/data-quality/DataQualityPage').then(({ DataQualityPage }) => ({ default: DataQualityPage }))
);
const ComparisonPage = lazy(() =>
  import('../features/comparison/ComparisonPage').then(({ ComparisonPage }) => ({ default: ComparisonPage }))
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage }))
);

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
  const importSession = useImportSession();
  const protectedAnalysisId = (() => {
    const state = importSession.state;
    if (state.status === 'running') return state.analysisId;
    if (state.status === 'storage-pressure' || state.status === 'recoverable') return state.checkpoint.analysisId;
    if (state.status === 'cancelled') return state.checkpoint?.analysisId;
    return undefined;
  })();

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

        {activePage === 'import' ? (
          <ImportPage
            session={importSession}
            onComplete={handleComplete}
            onManageStorage={() => setActivePage('settings')}
          />
        ) : null}
        <Suspense fallback={<div className="panel" role="status">{t('status.loading')}</div>}>
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
              protectedAnalysisId={protectedAnalysisId}
              onAnalysisDeleted={() => {
                setCompleted(undefined);
                setActivePage('import');
              }}
            />
          ) : null}
        </Suspense>
      </main>
    </div>
  );
}
