import type {
  FinishTableRow,
  OvertakeTableRow,
  PitCycleTableRow,
  RaceControlTableRow,
  RaceTables,
  ReportSection,
  StintTableDriver,
} from '../../shared/types';
import { formatSeconds } from '../../shared/format';

type TableKind = NonNullable<ReportSection['table']>;

type TableProps = {
  kind: TableKind;
  tables: RaceTables;
  onCitation: (factId: string) => void;
};

function FactButton({ id, onCitation }: { id: string; onCitation: (factId: string) => void }) {
  return (
    <button type="button" className="fact-link" onClick={() => onCitation(id)} title={`Show ${id} in the evidence table`}>
      {id}
    </button>
  );
}

function compoundClass(compound: string): string {
  const value = compound.toLowerCase();
  if (value.includes('soft')) return 'compound compound-soft';
  if (value.includes('medium')) return 'compound compound-medium';
  if (value.includes('hard')) return 'compound compound-hard';
  if (value.includes('inter')) return 'compound compound-inter';
  if (value.includes('wet')) return 'compound compound-wet';
  return 'compound';
}

function statusClass(status: FinishTableRow['status']): string {
  if (status === 'classified') return 'status status-classified';
  return `status status-${status.toLowerCase()}`;
}

function placesGained(value: number | null): { text: string; className: string } {
  if (value == null) return { text: '—', className: 'muted' };
  if (value > 0) return { text: `+${value}`, className: 'gain-positive' };
  if (value < 0) return { text: String(value), className: 'gain-negative' };
  return { text: '0', className: 'muted' };
}

function positionCell(position: number | null): string {
  return position == null ? '—' : `P${position}`;
}

function FinishTable({ rows, onCitation }: { rows: FinishTableRow[]; onCitation: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table className="data-table finish-table">
        <thead>
          <tr>
            <th className="col-pos">Pos</th>
            <th>Driver</th>
            <th>Team</th>
            <th className="col-num">Start</th>
            <th className="col-num">+/−</th>
            <th>Status</th>
            <th className="col-num">Laps</th>
            <th>Gap</th>
            <th className="col-num">Pts</th>
            <th className="col-fact">Fact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const change = placesGained(row.placesGained);
            return (
              <tr key={row.driverNumber}>
                <td className="col-pos">
                  <span className="position-badge">{row.position ?? '—'}</span>
                </td>
                <td>
                  <span className="team-bar" style={{ background: row.colour }} aria-hidden="true" />
                  <span className="driver-cell">
                    <span className="driver-name">{row.name}</span>
                    <span className="driver-meta">{row.acronym}</span>
                  </span>
                </td>
                <td className="team-cell">{row.team}</td>
                <td className="col-num">{row.startPosition == null ? '—' : `P${row.startPosition}`}</td>
                <td className={`col-num ${change.className}`}>{change.text}</td>
                <td>
                  <span className={statusClass(row.status)}>{row.status}</span>
                </td>
                <td className="col-num">{row.laps}</td>
                <td className="gap-cell">{row.gap}</td>
                <td className="col-num">{row.points}</td>
                <td className="col-fact">
                  <FactButton id={row.factId} onCitation={onCitation} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OvertakeRows({ rows, onCitation }: { rows: OvertakeTableRow[]; onCitation: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="table-empty">No verifiable on-track overtake was recorded.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-num">Lap</th>
            <th className="col-num">For</th>
            <th>Driver</th>
            <th>Overtaken</th>
            <th className="col-num">From</th>
            <th className="col-num">To</th>
            <th className="col-fact">Fact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.factId}>
              <td className="col-num">{row.lap}</td>
              <td className="col-num">P{row.position}</td>
              <td>{row.driver}</td>
              <td>{row.overtakenDriver}</td>
              <td className="col-num">{positionCell(row.fromPosition)}</td>
              <td className="col-num">{positionCell(row.toPosition)}</td>
              <td className="col-fact">
                <FactButton id={row.factId} onCitation={onCitation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitCycleRows({ rows, onCitation }: { rows: PitCycleTableRow[]; onCitation: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="table-empty">No pit-cycle position change was recorded.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="col-num">Lap</th>
            <th>Driver who gained</th>
            <th className="col-num">From</th>
            <th className="col-num">To</th>
            <th>Driver who pitted</th>
            <th className="col-num">Pit lap</th>
            <th className="col-num">Pit time</th>
            <th className="col-fact">Facts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.factId}>
              <td className="col-num">{row.lap}</td>
              <td>{row.driver}</td>
              <td className="col-num">{positionCell(row.fromPosition)}</td>
              <td className="col-num">{positionCell(row.toPosition)}</td>
              <td>{row.pittedDriver}</td>
              <td className="col-num">{row.pitLap}</td>
              <td className="col-num">{row.pitDuration == null ? '—' : formatSeconds(row.pitDuration)}</td>
              <td className="col-fact">
                <FactButton id={row.factId} onCitation={onCitation} />
                <FactButton id={row.pitFactId} onCitation={onCitation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StintRows({ drivers, onCitation }: { drivers: StintTableDriver[]; onCitation: (id: string) => void }) {
  if (drivers.length === 0) {
    return <p className="table-empty">No tyre-stint records were available.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table stint-table">
        <thead>
          <tr>
            <th>Driver</th>
            <th className="col-num">Stint</th>
            <th>Compound</th>
            <th>Laps</th>
            <th className="col-num">Tyre age</th>
            <th className="col-fact">Fact</th>
          </tr>
        </thead>
        {drivers.map((driver) => (
          <tbody key={driver.driverNumber}>
            {driver.stints.map((stint, index) => (
              <tr key={stint.factId}>
                <td>
                  {index === 0 ? (
                    <span className="driver-cell">
                      <span className="team-bar" style={{ background: driver.colour }} aria-hidden="true" />
                      <span className="driver-name">{driver.name}</span>
                    </span>
                  ) : null}
                </td>
                <td className="col-num">{stint.stintNumber}</td>
                <td>
                  <span className={compoundClass(stint.compound)}>{stint.compound}</span>
                </td>
                <td>
                  {stint.lapStart === stint.lapEnd ? `Lap ${stint.lapStart}` : `Laps ${stint.lapStart}–${stint.lapEnd}`}
                </td>
                <td className="col-num">{stint.tyreAgeAtStart}</td>
                <td className="col-fact">
                  <FactButton id={stint.factId} onCitation={onCitation} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function RaceControlRows({ rows, onCitation }: { rows: RaceControlTableRow[]; onCitation: (id: string) => void }) {
  if (rows.length === 0) {
    return <p className="table-empty">No significant race-control records were available.</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table race-control-table">
        <thead>
          <tr>
            <th className="col-num">Lap</th>
            <th>Category</th>
            <th>Driver</th>
            <th>Message</th>
            <th>Importance</th>
            <th className="col-fact">Fact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.factId}>
              <td className="col-num">{row.lap ?? '—'}</td>
              <td>{row.category}</td>
              <td>{row.driver ?? '—'}</td>
              <td>{row.message}</td>
              <td>
                <span className={`significance significance-${row.significance}`}>{row.significance}</span>
              </td>
              <td className="col-fact">
                <FactButton id={row.factId} onCitation={onCitation} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SectionTable({ kind, tables, onCitation }: TableProps) {
  switch (kind) {
    case 'finish':
      return <FinishTable rows={tables.finish} onCitation={onCitation} />;
    case 'overtakes':
      return <OvertakeRows rows={tables.overtakes} onCitation={onCitation} />;
    case 'pitCycles':
      return <PitCycleRows rows={tables.pitCycles} onCitation={onCitation} />;
    case 'stints':
      return <StintRows drivers={tables.stints} onCitation={onCitation} />;
    case 'raceControl':
      return <RaceControlRows rows={tables.raceControl} onCitation={onCitation} />;
    default:
      return null;
  }
}
