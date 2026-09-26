import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { openProfilerDb } from '../../storage/db';

interface ToolRow {
  kind: string;
  rawType: string;
  count: number;
}

function asToolRow(value: Record<string, unknown>): ToolRow | undefined {
  if (typeof value.kind !== 'string' || typeof value.rawType !== 'string') return undefined;
  return {
    kind: value.kind,
    rawType: value.rawType,
    count: typeof value.count === 'number' && Number.isFinite(value.count) ? value.count : 0
  };
}

export function ToolsPage({ analysisId }: { analysisId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ToolRow[]>([]);

  useEffect(() => {
    let active = true;
    void openProfilerDb().then(async (db) => {
      try {
        const records = await db.getAllFromIndex('toolMetrics', 'by-analysis', analysisId);
        const merged = new Map<string, ToolRow>();
        for (const record of records) {
          const row = asToolRow(record.value);
          if (!row) continue;
          const key = `${row.kind}\u0000${row.rawType}`;
          const current = merged.get(key) ?? { ...row, count: 0 };
          current.count += row.count;
          merged.set(key, current);
        }
        if (active) setRows([...merged.values()].sort((a, b) => b.count - a.count || a.rawType.localeCompare(b.rawType)));
      } finally {
        db.close();
      }
    });
    return () => { active = false; };
  }, [analysisId]);

  return (
    <section className="analytics-page" aria-labelledby="tools-heading">
      <p className="eyebrow">{t('tools.eyebrow')}</p>
      <h2 id="tools-heading">{t('tools.heading')}</h2>
      <p className="muted-copy">{t('tools.description')}</p>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('tools.kind')}</th><th>{t('tools.rawType')}</th><th>{t('tools.events')}</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}:${row.rawType}`}>
                  <td>{row.kind}</td><td>{row.rawType}</td><td>{row.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted-copy">{t('tools.empty')}</p>}
    </section>
  );
}
