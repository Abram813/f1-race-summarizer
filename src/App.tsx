import { useEffect, useMemo, useState } from 'react';
import type { RaceCatalogEntry, RaceReportPackage } from '../shared/types';
import { formatRaceDate } from '../shared/format';
import { factsToCsv, downloadText } from '../shared/csv';
import { fetchConfig, fetchRace, fetchRaces, type AppConfig } from './api';
import { FactsTable } from './components/FactsTable';
import { NarrationPanel } from './components/NarrationPanel';
import { PositionChart } from './components/PositionChart';
import { ReportView } from './components/ReportView';

type Tab = 'report' | 'chart' | 'evidence' | 'narration';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'report', label: 'Report' },
  { id: 'chart', label: 'Position chart' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'narration', label: 'Local AI' },
];

function raceIdFromHash(): string | null {
  const match = /^#\/race\/([^/?]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function winnerOf(pkg: RaceReportPackage) {
  return pkg.tables.finish.find((row) => row.position === 1) ?? null;
}

function countFacts(pkg: RaceReportPackage, category: string): number {
  return pkg.facts.filter((fact) => fact.category === category && fact.includedInReport).length;
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeleton-wrap" aria-label="Loading race report" role="status">
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-grid">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="skeleton skeleton-stat" key={index} />
        ))}
      </div>
      <div className="skeleton skeleton-section" />
      <div className="skeleton skeleton-section" />
    </div>
  );
}

export default function App() {
  const [races, setRaces] = useState<RaceCatalogEntry[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [racesError, setRacesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pkg, setPkg] = useState<RaceReportPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [tab, setTab] = useState<Tab>('report');
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [factFocus, setFactFocus] = useState<{ id: string; nonce: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRaces()
      .then((response) => {
        if (cancelled) return;
        setRaces(response.races);
        const fromHash = raceIdFromHash();
        const initial = response.races.find((race) => race.id === fromHash)?.id ?? response.races[0]?.id ?? null;
        setSelectedId(initial);
        if (initial && fromHash !== initial) {
          window.history.replaceState(null, '', `#/race/${initial}`);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setRacesError(error instanceof Error ? error.message : 'Could not load races.');
      });
    fetchConfig()
      .then((response) => {
        if (!cancelled) setConfig(response);
      })
      .catch(() => {
        // Config only supplies local-AI defaults; the report works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const id = raceIdFromHash();
      if (id) setSelectedId(id);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setReportError(null);
    setSelectedFactId(null);
    setFactFocus(null);
    fetchRace(selectedId)
      .then((response) => {
        if (!cancelled) setPkg(response);
      })
      .catch((error: unknown) => {
        if (!cancelled) setReportError(error instanceof Error ? error.message : 'Could not load the race report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, reloadToken]);

  useEffect(() => {
    if (!pkg) return;
    document.title = `${pkg.race.shortName} — Race Brief`;
  }, [pkg]);

  const winner = pkg ? winnerOf(pkg) : null;
  const second = pkg?.tables.finish.find((row) => row.position === 2) ?? null;
  const stats = useMemo(() => {
    if (!pkg) {
      return {
        leadChanges: 0,
        pitVisits: 0,
        overtakes: 0,
        pitCycles: 0,
        raceControl: 0,
        facts: 0,
      };
    }
    return {
      leadChanges: countFacts(pkg, 'lead_change'),
      pitVisits: countFacts(pkg, 'pit'),
      overtakes: pkg.tables.overtakes.length,
      pitCycles: pkg.tables.pitCycles.length,
      raceControl: pkg.tables.raceControl.length,
      facts: pkg.meta.factCount,
    };
  }, [pkg]);

  const chooseRace = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    window.location.hash = `#/race/${id}`;
  };

  const handleCitation = (factId: string) => {
    setSelectedFactId(factId);
    setFactFocus({ id: factId, nonce: Date.now() });
    setTab('evidence');
  };

  const downloadMarkdown = () => {
    if (!pkg) return;
    downloadText(`${pkg.race.id}-race-report.md`, pkg.markdown, 'text/markdown');
  };

  const downloadCsv = () => {
    if (!pkg) return;
    downloadText(`${pkg.race.id}-evidence.csv`, factsToCsv(pkg.facts), 'text/csv');
  };

  const selectedRace = races.find((race) => race.id === selectedId);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <span className="brand-name">Race Brief</span>
            <span className="brand-sub">Evidence-first F1 reports</span>
          </div>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">Bundled races</p>
          {racesError ? <p className="sidebar-error">{racesError}</p> : null}
          <nav className="race-nav" aria-label="Choose a race">
            {races.map((race) => (
              <button
                type="button"
                key={race.id}
                className={`race-option${race.id === selectedId ? ' race-option-active' : ''}`}
                onClick={() => chooseRace(race.id)}
              >
                <span className="race-option-date">{formatRaceDate(race.date)}</span>
                <span className="race-option-name">{race.shortName}</span>
                <span className="race-option-circuit">{race.circuit}</span>
                {race.notes ? <span className="race-option-note">{race.notes}</span> : null}
              </button>
            ))}
            {!racesError && races.length === 0 ? <p className="muted">Loading races…</p> : null}
          </nav>
        </div>

        <div className="sidebar-card">
          <span className="status-dot" />
          <strong>Offline fixtures</strong>
          <p>
            OpenF1 session data is bundled locally so every report is deterministic and reproducible. No race data is
            fetched at runtime.
          </p>
        </div>

        <div className="sidebar-card sidebar-card-quiet">
          <strong>No API key</strong>
          <p>The report and exports never call an AI model. Local narration is optional and loopback-only.</p>
        </div>

        <footer className="sidebar-footer">
          <span>{races.length} races bundled</span>
          <span>OpenF1 · 2024</span>
        </footer>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-route">
            <span className="topbar-label">Race report</span>
            <span className="topbar-separator">/</span>
            <span>{selectedRace?.shortName ?? 'Loading…'}</span>
          </div>
          <div className="topbar-actions">
            <button type="button" className="button-secondary" onClick={downloadMarkdown} disabled={!pkg}>
              <span aria-hidden="true">↓</span> Markdown
            </button>
            <button type="button" className="button-primary" onClick={downloadCsv} disabled={!pkg}>
              <span aria-hidden="true">↓</span> Evidence CSV
            </button>
          </div>
        </header>

        <main className="content">
          {racesError ? (
            <div className="card error-card">
              <h2>The race catalog could not load</h2>
              <p>{racesError}</p>
              <p className="muted">Make sure the API server is running with `npm run dev`.</p>
            </div>
          ) : loading && !pkg ? (
            <Skeleton />
          ) : reportError ? (
            <div className="card error-card">
              <h2>This report could not be built</h2>
              <p>{reportError}</p>
              <button type="button" className="button-primary" onClick={() => setReloadToken((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : pkg && winner ? (
            <>
              <section className="hero" style={{ ['--accent' as string]: winner.colour }}>
                <div className="hero-main">
                  <p className="eyebrow">
                    {pkg.race.year} · {pkg.race.circuit} · {pkg.race.country}
                  </p>
                  <h1>{pkg.race.name}</h1>
                  <p className="hero-meta">
                    {formatRaceDate(pkg.race.date)} · {pkg.race.laps} laps · session {pkg.race.sessionKey}
                  </p>
                  {pkg.race.notes ? <p className="hero-notes">{pkg.race.notes}</p> : null}
                  <div className="hero-badges">
                    <span className="badge badge-live">
                      <span className="status-dot status-dot-small" /> Deterministic report ready
                    </span>
                    <span className="badge">{pkg.meta.factCount} facts</span>
                    <span className="badge">{pkg.meta.sources.filter((source) => source.available).length} sources</span>
                    <span className="badge">No AI model</span>
                  </div>
                </div>
                <div className="winner-panel">
                  <span className="winner-kicker">Winner</span>
                  <span className="winner-name">{winner.name}</span>
                  <span className="winner-team">{winner.team}</span>
                  <span className="winner-finish">
                    P1 · {winner.laps} laps
                    {second && second.position === 2 && second.gap !== 'leader' ? ` · ${second.gap} ahead of P2` : ''}
                  </span>
                  <span className="winner-start">
                    Started {winner.startPosition == null ? '—' : `P${winner.startPosition}`}
                    {winner.placesGained != null && winner.placesGained !== 0
                      ? ` · ${winner.placesGained > 0 ? '+' : ''}${winner.placesGained} places`
                      : ''}
                  </span>
                </div>
              </section>

              <section className="stat-grid" aria-label="Race summary statistics">
                <StatCard label="Lead changes" value={stats.leadChanges} hint="changes of P1" />
                <StatCard label="Pit visits" value={stats.pitVisits} hint="recorded stops" />
                <StatCard label="On-track passes" value={stats.overtakes} hint="evidence-tested" />
                <StatCard label="Pit-cycle gains" value={stats.pitCycles} hint="not overtakes" />
                <StatCard label="Race-control" value={stats.raceControl} hint="significant events" />
                <StatCard label="Evidence facts" value={stats.facts} hint="traceable rows" />
              </section>

              <nav className="tabs" aria-label="Report views">
                {TABS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`tab${tab === item.id ? ' tab-active' : ''}`}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                    {item.id === 'evidence' ? <span className="tab-count">{pkg.meta.factCount}</span> : null}
                    {item.id === 'chart' ? <span className="tab-count">{pkg.chart.markers.length}</span> : null}
                  </button>
                ))}
                <span className="tabs-spacer" />
                <span className="tabs-note">Every sentence cites the evidence table</span>
              </nav>

              <div className="tab-panel" role="tabpanel">
                {tab === 'report' ? (
                  <ReportView pkg={pkg} onCitation={handleCitation} onOpenEvidence={() => setTab('evidence')} />
                ) : null}
                {tab === 'chart' ? <PositionChart chart={pkg.chart} onCitation={handleCitation} /> : null}
                {tab === 'evidence' ? (
                  <FactsTable
                    facts={pkg.facts}
                    selectedFactId={selectedFactId}
                    focus={factFocus}
                    onSelect={setSelectedFactId}
                  />
                ) : null}
                {tab === 'narration' ? (
                  <NarrationPanel pkg={pkg} config={config} onCitation={handleCitation} />
                ) : null}
              </div>

              <footer className="page-footer">
                <span>
                  Data: OpenF1 · session {pkg.race.sessionKey} · snapshot {pkg.meta.dataFetchedAt ?? 'bundled'}
                </span>
                <span>Built for traceability, not vibes.</span>
              </footer>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
