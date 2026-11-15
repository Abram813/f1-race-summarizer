import { useEffect, useMemo, useState } from 'react';
import type { EvidenceFact, FactCategory } from '../../shared/types';

type FactsTableProps = {
  facts: EvidenceFact[];
  selectedFactId: string | null;
  focus: { id: string; nonce: number } | null;
  onSelect: (factId: string) => void;
};

const CATEGORY_LABELS: Record<FactCategory, string> = {
  session: 'Session',
  start: 'Start',
  finish: 'Finish',
  lead_change: 'Lead change',
  laps_led: 'Laps led',
  pit: 'Pit visit',
  stint: 'Stint',
  overtake: 'On-track overtake',
  pit_cycle: 'Pit-cycle change',
  overtake_record: 'Excluded overtake row',
  race_control: 'Race control',
  summary: 'Summary',
};

function lapText(fact: EvidenceFact): string {
  if (fact.lap == null) return '—';
  if (fact.lapEnd != null && fact.lapEnd !== fact.lap) return `${fact.lap}–${fact.lapEnd}`;
  return String(fact.lap);
}

export function FactsTable({ facts, selectedFactId, focus, onSelect }: FactsTableProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | FactCategory>('all');
  const [inclusion, setInclusion] = useState<'all' | 'included' | 'excluded'>('all');
  const [significance, setSignificance] = useState<'all' | 'critical' | 'notable' | 'low'>('all');
  const [limit, setLimit] = useState(120);

  useEffect(() => {
    if (!focus) return;
    setQuery(focus.id);
    setCategory('all');
    setInclusion('all');
    setSignificance('all');
    setLimit(120);
    onSelect(focus.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const categories = useMemo(() => {
    const counts = new Map<FactCategory, number>();
    for (const fact of facts) counts.set(fact.category, (counts.get(fact.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [facts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return facts.filter((fact) => {
      if (category !== 'all' && fact.category !== category) return false;
      if (inclusion === 'included' && !fact.includedInReport) return false;
      if (inclusion === 'excluded' && fact.includedInReport) return false;
      if (significance !== 'all' && fact.significance !== significance) return false;
      if (!needle) return true;
      const haystack = [
        fact.id,
        fact.event,
        fact.category,
        fact.driver ?? '',
        String(fact.driverNumber ?? ''),
        fact.value,
        fact.detail ?? '',
        fact.source,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [facts, query, category, inclusion, significance]);

  useEffect(() => {
    if (!selectedFactId) return;
    const element = document.getElementById(`fact-${selectedFactId}`);
    if (element) element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedFactId, filtered.length]);

  const visible = filtered.slice(0, limit);
  const includedCount = facts.filter((fact) => fact.includedInReport).length;

  const reset = () => {
    setQuery('');
    setCategory('all');
    setInclusion('all');
    setSignificance('all');
    setLimit(120);
  };

  return (
    <div className="evidence-view">
      <div className="card evidence-intro">
        <div>
          <p className="eyebrow">Traceable facts</p>
          <h2>Evidence table</h2>
          <p className="muted">
            Facts are generated before the report is written. Every citation in the report resolves to a row here and
            to a row in the downloadable CSV.
          </p>
        </div>
        <div className="evidence-stats">
          <div>
            <strong>{facts.length}</strong>
            <span>total facts</span>
          </div>
          <div>
            <strong>{includedCount}</strong>
            <span>report rows</span>
          </div>
          <div>
            <strong>{facts.length - includedCount}</strong>
            <span>excluded rows</span>
          </div>
        </div>
      </div>

      <div className="card evidence-controls">
        <div className="evidence-search">
          <label htmlFor="fact-search">Search facts</label>
          <input
            id="fact-search"
            type="search"
            value={query}
            placeholder="Fact ID, driver, event, value or source…"
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(120);
            }}
          />
        </div>
        <div className="filter-row">
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value as 'all' | FactCategory)}>
              <option value="all">All categories</option>
              {categories.map(([key, count]) => (
                <option value={key} key={key}>
                  {CATEGORY_LABELS[key]} ({count})
                </option>
              ))}
            </select>
          </label>
          <label>
            Report status
            <select value={inclusion} onChange={(event) => setInclusion(event.target.value as typeof inclusion)}>
              <option value="all">All rows</option>
              <option value="included">In report</option>
              <option value="excluded">Excluded</option>
            </select>
          </label>
          <label>
            Significance
            <select value={significance} onChange={(event) => setSignificance(event.target.value as typeof significance)}>
              <option value="all">Any significance</option>
              <option value="critical">Critical</option>
              <option value="notable">Notable</option>
              <option value="low">Low</option>
            </select>
          </label>
          <button type="button" className="button-ghost" onClick={reset}>
            Reset filters
          </button>
        </div>
        <div className="category-chips">
          <button
            type="button"
            className={`chip-button${category === 'all' ? ' chip-active' : ''}`}
            onClick={() => setCategory('all')}
          >
            All <span>{facts.length}</span>
          </button>
          {categories.map(([key, count]) => (
            <button
              type="button"
              key={key}
              className={`chip-button${category === key ? ' chip-active' : ''}`}
              onClick={() => setCategory(category === key ? 'all' : key)}
            >
              {CATEGORY_LABELS[key]} <span>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card evidence-table-card">
        <div className="evidence-table-heading">
          <span>
            Showing <strong>{visible.length}</strong> of <strong>{filtered.length}</strong> matching rows
          </span>
          <span className="muted">Click a row to select it. Citation links jump straight to a fact.</span>
        </div>
        <div className="table-wrap evidence-table-wrap">
          <table className="data-table evidence-table">
            <thead>
              <tr>
                <th className="col-fact">ID</th>
                <th>Category</th>
                <th>Event</th>
                <th>Driver</th>
                <th className="col-num">Lap</th>
                <th>Value</th>
                <th>Source</th>
                <th>Confidence</th>
                <th className="col-num">In report</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((fact) => (
                <tr
                  key={fact.id}
                  id={`fact-${fact.id}`}
                  className={selectedFactId === fact.id ? 'fact-selected' : undefined}
                  onClick={() => onSelect(fact.id)}
                >
                  <td className="col-fact">
                    <span className="fact-id">{fact.id}</span>
                  </td>
                  <td>
                    <span className={`fact-category fact-category-${fact.category}`}>{CATEGORY_LABELS[fact.category]}</span>
                  </td>
                  <td>{fact.event}</td>
                  <td>{fact.driver ?? '—'}</td>
                  <td className="col-num">{lapText(fact)}</td>
                  <td className="fact-value">
                    {fact.value}
                    {fact.detail ? <span className="fact-detail">{fact.detail}</span> : null}
                  </td>
                  <td className="source-cell">{fact.source}</td>
                  <td>
                    <span className={`confidence confidence-${fact.confidence}`}>{fact.confidence}</span>
                  </td>
                  <td className="col-num">
                    <span className={fact.includedInReport ? 'included-yes' : 'included-no'}>
                      {fact.includedInReport ? 'yes' : 'no'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? <p className="table-empty">No facts match the current filters.</p> : null}
        {filtered.length > visible.length ? (
          <div className="load-more">
            <button type="button" className="button-secondary" onClick={() => setLimit((value) => value + 160)}>
              Load {Math.min(160, filtered.length - visible.length)} more rows
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
