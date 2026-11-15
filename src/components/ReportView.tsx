import type { RaceReportPackage, ReportBlock, Statement } from '../../shared/types';
import { formatDateTime } from '../../shared/format';
import { SectionTable } from './Tables';

type ReportViewProps = {
  pkg: RaceReportPackage;
  onCitation: (factId: string) => void;
  onOpenEvidence: () => void;
};

function Citations({ ids, onCitation }: { ids: string[]; onCitation: (factId: string) => void }) {
  if (ids.length === 0) return null;
  return (
    <span className="citations">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="citation"
          onClick={() => onCitation(id)}
          title={`Open ${id} in the evidence table`}
        >
          {id}
        </button>
      ))}
    </span>
  );
}

function StatementText({ statement, onCitation }: { statement: Statement; onCitation: (factId: string) => void }) {
  return (
    <span className="statement">
      {statement.text}
      <Citations ids={statement.citations} onCitation={onCitation} />
    </span>
  );
}

function Block({ block, onCitation }: { block: ReportBlock; onCitation: (factId: string) => void }) {
  if (block.type === 'bullets') {
    return (
      <ul className="report-list">
        {block.statements.map((statement, index) => (
          <li key={`${statement.text.slice(0, 24)}-${index}`}>
            <StatementText statement={statement} onCitation={onCitation} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="report-paragraph">
      {block.statements.map((statement, index) => (
        <StatementText key={`${statement.text.slice(0, 24)}-${index}`} statement={statement} onCitation={onCitation} />
      ))}
    </p>
  );
}

export function ReportView({ pkg, onCitation, onOpenEvidence }: ReportViewProps) {
  return (
    <div className="report-view">
      <div className="report-header card">
        <div>
          <p className="eyebrow">Deterministic race report</p>
          <h2>{pkg.race.shortName}</h2>
          <p className="report-meta">
            Generated {formatDateTime(pkg.meta.generatedAt)} · {pkg.meta.factCount} facts ·{' '}
            {pkg.meta.includedFactCount} cited or supporting rows
          </p>
        </div>
        <div className="report-badges">
          <span className="badge badge-live">No AI model</span>
          <span className="badge">Every sentence cited</span>
          <button type="button" className="text-button" onClick={onOpenEvidence}>
            Open evidence table →
          </button>
        </div>
      </div>

      <div className="report-sections">
        {pkg.report.map((section) => (
          <section className="report-section card" id={`section-${section.id}`} key={section.id}>
            <div className="section-heading">
              <span className="section-index">{String(pkg.report.indexOf(section) + 1).padStart(2, '0')}</span>
              <h3>{section.title}</h3>
            </div>
            <div className="section-body">
              {section.blocks.map((block, index) => (
                <Block key={`${section.id}-${index}`} block={block} onCitation={onCitation} />
              ))}
            </div>
            {section.table ? (
              <div className="section-table">
                <div className="section-table-heading">
                  <span>Supporting table</span>
                  <span className="muted">Click a fact ID to inspect the source row</span>
                </div>
                <SectionTable kind={section.table} tables={pkg.tables} onCitation={onCitation} />
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="report-exclusions card">
        <div className="section-heading">
          <span className="section-index">†</span>
          <h3>Excluded overtake timing rows</h3>
        </div>
        <p className="muted">
          These rows are kept in the evidence CSV with a reason so the exclusion can be audited. They are never
          counted as on-track overtakes.
        </p>
        {pkg.tables.excludedOvertakes.length === 0 ? (
          <p className="table-empty">No overtake timing rows were excluded for this race.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-num">Lap</th>
                  <th>Driver</th>
                  <th>Claimed pass</th>
                  <th className="col-num">Claimed pos</th>
                  <th>Reason</th>
                  <th className="col-fact">Fact</th>
                </tr>
              </thead>
              <tbody>
                {pkg.tables.excludedOvertakes.map((row) => (
                  <tr key={row.factId}>
                    <td className="col-num">{row.lap || '—'}</td>
                    <td>{row.driver}</td>
                    <td>{row.overtakenDriver}</td>
                    <td className="col-num">P{row.claimedPosition}</td>
                    <td>
                      <span className={`reason reason-${row.reason}`}>{row.reason.replace('_', ' ')}</span>
                    </td>
                    <td className="col-fact">
                      <button
                        type="button"
                        className="fact-link"
                        onClick={() => onCitation(row.factId)}
                        title={row.detail}
                      >
                        {row.factId}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
