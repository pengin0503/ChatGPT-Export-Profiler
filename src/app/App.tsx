import { useState } from 'react';
import { navigationItems } from './navigation';
import { useI18n } from '../i18n';
import { ImportPage } from '../features/import/ImportPage';
import type { ImportSummary } from '../features/import/useImportSession';

type ActivePage = 'import' | 'overview';

interface CompletedAnalysis {
  analysisId: string;
  summary: ImportSummary;
}

export function App() {
  const { locale, setLocale, t } = useI18n();
  const [activePage, setActivePage] = useState<ActivePage>('import');
  const [completed, setCompleted] = useState<CompletedAnalysis | undefined>(undefined);

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
              const supported = item.id === 'import' || item.id === 'overview';
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
                      if (item.id === 'import') setActivePage('import');
                      if (item.id === 'overview' && completed) setActivePage('overview');
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

        {activePage === 'overview' && completed ? (
          <section className="overview-placeholder" aria-labelledby="overview-heading">
            <p className="eyebrow">ANALYSIS {completed.analysisId.slice(0, 8)}</p>
            <h2 id="overview-heading">{t('nav.overview')}</h2>
            <div className="overview-metrics">
              <article>
                <strong>{completed.summary.conversations}</strong>
                <span>{completed.summary.conversations === 1 ? 'conversation' : 'conversations'}</span>
              </article>
              <article>
                <strong>{completed.summary.messages}</strong>
                <span>messages</span>
              </article>
              <article>
                <strong>{completed.summary.visibleTokens}</strong>
                <span>visible tokens</span>
              </article>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
