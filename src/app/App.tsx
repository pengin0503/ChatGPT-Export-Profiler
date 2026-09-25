import { navigationItems } from './navigation';
import { useI18n } from '../i18n';

export function App() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-mark" aria-hidden="true">CEP</div>
        <nav>
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <button
                  className={item.id === 'import' ? 'nav-item nav-item-active' : 'nav-item'}
                  type="button"
                  disabled={item.requiresAnalysis}
                  title={item.requiresAnalysis ? t('status.notReady') : undefined}
                >
                  {t(item.labelKey)}
                </button>
              </li>
            ))}
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

        <section className="privacy-card" aria-label="Privacy">
          <span className="privacy-dot" aria-hidden="true" />
          <p data-testid="privacy-copy">{t('privacy.local')}</p>
        </section>

        <section className="empty-state" aria-labelledby="import-heading">
          <div className="empty-state-icon" aria-hidden="true">ZIP</div>
          <div>
            <h2 id="import-heading">{t('import.action')}</h2>
            <p>{t('import.empty')}</p>
          </div>
          <button type="button" className="primary-action" disabled>
            {t('import.action')}
          </button>
        </section>
      </main>
    </div>
  );
}
