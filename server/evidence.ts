import type {
  ChartData,
  ChartMarker,
  ChartSeries,
  DataSourceInfo,
  Driver,
  EvidenceFact,
  ExcludedOvertakeRow,
  FinishTableRow,
  OvertakeRow,
  OvertakeTableRow,
  PitCycleTableRow,
  PitRow,
  PositionSample,
  RaceControlRow,
  RaceControlTableRow,
  RaceData,
  RaceSummary,
  RaceTables,
  SessionResultRow,
  StintRow,
  StintTableDriver,
} from '../shared/types';
import {
  formatDateTime,
  formatGap,
  formatLapRange,
  formatRaceDate,
  formatSeconds,
  normaliseColour,
} from '../shared/format';

/* ------------------------------------------------------------------ */
/* Internal records                                                     */
/* ------------------------------------------------------------------ */

type FactDraft = Omit<EvidenceFact, 'id'>;

type PitFactRecord = {
  fact: EvidenceFact;
  row: PitRow;
  time: number;
  lap: number;
  before: number | null;
  after: number | null;
  isRaceStop: boolean;
};

type StintFactRecord = {
  fact: EvidenceFact;
  row: StintRow;
};

type PositionLookup = {
  byDriver: Map<number, PositionSample[]>;
  firstSnapshotDate: string | null;
  snapshotAt: (time: number) => PositionSample[];
  lastAtOrBefore: (driverNumber: number, time: number) => PositionSample | null;
  firstAtOrAfter: (driverNumber: number, time: number) => PositionSample | null;
  previous: (driverNumber: number, time: number) => PositionSample | null;
};

type LapIndex = {
  firstLapStart: number;
  maxLap: number;
  lapStart: (lap: number) => number | null;
  lapAt: (time: number) => number;
  lapNumbers: number[];
};

type OvertakeFactRecord = {
  fact: EvidenceFact;
  row: OvertakeRow;
  driverNumber: number;
  lap: number;
  time: number;
  fromPosition: number | null;
  toPosition: number | null;
  overtakenFrom: number | null;
  overtakenTo: number | null;
};

type PitCycleRecord = {
  fact: EvidenceFact;
  lap: number;
  driverNumber: number;
  fromPosition: number | null;
  toPosition: number | null;
  pit: PitFactRecord;
  derived: boolean;
  sourceRow?: OvertakeRow;
};

type ExcludedPitRecord = {
  fact: EvidenceFact;
  row: PitRow;
  reason: string;
};

type ExcludedStintRecord = {
  fact: EvidenceFact;
  row: StintRow;
  reason: string;
};

type ExcludedOvertakeRecord = {
  fact: EvidenceFact;
  row: OvertakeRow;
  lap: number;
  reason: 'pit_window' | 'pre_start' | 'unverified';
  detail: string;
};

type LeadChangeRecord = {
  fact: EvidenceFact;
  time: number;
  lap: number;
  oldDriverNumber: number;
  newDriverNumber: number;
  oldDriver: string;
  newDriver: string;
  pitVisits: PitFactRecord[];
  onTrackOvertake: OvertakeFactRecord | null;
};

type LapsLedRecord = {
  fact: EvidenceFact;
  driverNumber: number;
  total: number;
  ranges: Array<[number, number]>;
};

type RaceControlRecord = {
  fact: EvidenceFact;
  row: RaceControlRow;
  lap: number | null;
  significance: 'critical' | 'notable' | 'low';
  included: boolean;
};

type FinishFactRecord = {
  fact: EvidenceFact;
  row: SessionResultRow;
  rowIndex: number;
};

export type EvidenceBundle = {
  race: RaceSummary;
  facts: EvidenceFact[];
  factsById: Map<string, EvidenceFact>;
  sources: DataSourceInfo[];
  summaryFacts: Record<string, EvidenceFact>;
  sessionFacts: EvidenceFact[];
  startFacts: Map<number, EvidenceFact>;
  finishFacts: Map<number, EvidenceFact>;
  finishRecords: FinishFactRecord[];
  pitFacts: PitFactRecord[];
  excludedPits: ExcludedPitRecord[];
  stintFacts: StintFactRecord[];
  excludedStints: ExcludedStintRecord[];
  leadChanges: LeadChangeRecord[];
  lapsLed: LapsLedRecord[];
  onTrackOvertakes: OvertakeFactRecord[];
  pitCycles: PitCycleRecord[];
  excludedOvertakes: ExcludedOvertakeRecord[];
  raceControl: RaceControlRecord[];
  tables: RaceTables;
  chart: ChartData;
  abortedStart: boolean;
};

const PIT_WINDOW_MS = 60_000;
// A real Monaco pit visit is roughly 23–28 seconds. The red-flag/restart rows
// in the bundled feed carry ~39 minutes of pit-lane time, so a conservative
// threshold separates race stops from pit-lane visits around an aborted start.
const MAX_PLAUSIBLE_PIT_LANE_SECONDS = 300;
const RACE_CONTROL_LOW_MESSAGES =
  /(BLUE FLAG|CLEAR IN TRACK SECTOR|YELLOW IN TRACK SECTOR|DOUBLE YELLOW IN TRACK SECTOR|DRS ENABLED)/i;

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

function parseTime(value: string): number {
  return Date.parse(value);
}

function pitLaneSeconds(row: PitRow): number | null {
  return row.pit_duration ?? row.lane_duration ?? row.stop_duration ?? null;
}

function isImplausiblePitLaneVisit(row: PitRow): boolean {
  const seconds = pitLaneSeconds(row);
  return seconds != null && seconds > MAX_PLAUSIBLE_PIT_LANE_SECONDS;
}

function isValidStint(row: StintRow): boolean {
  return row.lap_start >= 1 && row.lap_end >= row.lap_start;
}

function addMs(time: number, ms: number): number {
  return time + ms;
}

function lastAtOrBefore<T extends { date: string }>(rows: T[], time: number): T | null {
  let low = 0;
  let high = rows.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (parseTime(rows[mid].date) <= time) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return answer >= 0 ? rows[answer] : null;
}

function firstAtOrAfter<T extends { date: string }>(rows: T[], time: number): T | null {
  let low = 0;
  let high = rows.length - 1;
  let answer = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (parseTime(rows[mid].date) >= time) {
      answer = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return answer >= 0 ? rows[answer] : null;
}

function buildPositionLookup(data: RaceData): PositionLookup {
  const byDriver = new Map<number, PositionSample[]>();
  for (const sample of [...data.position].sort((a, b) => a.date.localeCompare(b.date))) {
    const list = byDriver.get(sample.driver_number) ?? [];
    list.push(sample);
    byDriver.set(sample.driver_number, list);
  }

  const lastAtOrBeforeFor = (driverNumber: number, time: number): PositionSample | null => {
    const rows = byDriver.get(driverNumber);
    return rows ? lastAtOrBefore(rows, time) : null;
  };

  const firstAtOrAfterFor = (driverNumber: number, time: number): PositionSample | null => {
    const rows = byDriver.get(driverNumber);
    return rows ? firstAtOrAfter(rows, time) : null;
  };

  const previous = (driverNumber: number, time: number): PositionSample | null => {
    const rows = byDriver.get(driverNumber);
    if (!rows) return null;
    let low = 0;
    let high = rows.length - 1;
    let answer = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (parseTime(rows[mid].date) < time) {
        answer = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return answer >= 0 ? rows[answer] : null;
  };

  const firstSnapshotDate = data.position.length
    ? [...data.position].sort((a, b) => a.date.localeCompare(b.date))[0].date
    : null;

  return {
    byDriver,
    firstSnapshotDate,
    snapshotAt(time) {
      const snapshot: PositionSample[] = [];
      for (const [driverNumber, rows] of byDriver) {
        const sample = lastAtOrBefore(rows, time);
        if (sample) snapshot.push({ ...sample, driver_number: driverNumber });
      }
      return snapshot.sort((a, b) => a.position - b.position || a.driver_number - b.driver_number);
    },
    lastAtOrBefore: lastAtOrBeforeFor,
    firstAtOrAfter: firstAtOrAfterFor,
    previous,
  };
}

function buildLapIndex(data: RaceData): LapIndex {
  const starts = new Map<number, number>();
  for (const lap of data.laps) {
    if (!lap.date_start) continue;
    const time = parseTime(lap.date_start);
    const current = starts.get(lap.lap_number);
    if (current == null || time < current) starts.set(lap.lap_number, time);
  }
  for (const result of data.session_result) {
    // Keep the lap index continuous even if a timing row is missing.
    if (!starts.has(result.number_of_laps)) {
      starts.set(result.number_of_laps, starts.get(result.number_of_laps) ?? 0);
    }
  }
  const lapNumbers = [...starts.entries()]
    .filter(([, time]) => time > 0)
    .map(([lap]) => lap)
    .sort((a, b) => a - b);
  const maxLap = Math.max(
    1,
    ...data.laps.map((lap) => lap.lap_number),
    ...data.session_result.map((result) => result.number_of_laps),
    0,
  );
  const firstLapStart = starts.get(1) ?? parseTime(data.session.date_start);

  const lapStart = (lap: number): number | null => {
    if (starts.has(lap)) return starts.get(lap)!;
    let best: number | null = null;
    for (const [candidateLap, time] of starts) {
      if (candidateLap <= lap && (best == null || time > best)) best = time;
    }
    return best;
  };

  return {
    firstLapStart,
    maxLap,
    lapNumbers,
    lapStart,
    lapAt(time) {
      if (time < firstLapStart) return 0;
      let answer = 1;
      for (const lap of lapNumbers) {
        const start = starts.get(lap);
        if (start != null && start <= time) answer = lap;
        else if (start != null && start > time) break;
      }
      return Math.min(answer, maxLap);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Fact store                                                           */
/* ------------------------------------------------------------------ */

class FactStore {
  private readonly rows: EvidenceFact[] = [];
  private sequence = 0;

  add(draft: FactDraft): EvidenceFact {
    this.sequence += 1;
    const fact: EvidenceFact = {
      ...draft,
      id: `F${String(this.sequence).padStart(4, '0')}`,
    };
    this.rows.push(fact);
    return fact;
  }

  all(): EvidenceFact[] {
    return this.rows;
  }
}

/* ------------------------------------------------------------------ */
/* Evidence builder                                                     */
/* ------------------------------------------------------------------ */

export function buildEvidence(data: RaceData): EvidenceBundle {
  const store = new FactStore();
  const position = buildPositionLookup(data);
  const lapIndex = buildLapIndex(data);
  const driverByNumber = new Map<number, Driver>(data.drivers.map((driver) => [driver.driver_number, driver]));
  const driverName = (number: number | null | undefined): string =>
    number == null ? 'Unknown driver' : driverByNumber.get(number)?.full_name ?? `Car #${number}`;
  const driverAcronym = (number: number | null | undefined): string =>
    number == null ? 'UNK' : driverByNumber.get(number)?.name_acronym ?? `#${number}`;
  const driverTeam = (number: number | null | undefined): string =>
    number == null ? 'Unknown team' : driverByNumber.get(number)?.team_name ?? 'Unknown team';
  const driverColour = (number: number | null | undefined): string =>
    normaliseColour(number == null ? null : driverByNumber.get(number)?.team_colour);

  const sessionUrl = `https://api.openf1.org/v1/sessions?session_key=${data.session.session_key}`;
  const positionUrl = `https://api.openf1.org/v1/position?session_key=${data.session.session_key}`;
  const resultUrl = `https://api.openf1.org/v1/session_result?session_key=${data.session.session_key}`;
  const pitUrl = `https://api.openf1.org/v1/pit?session_key=${data.session.session_key}`;
  const stintUrl = `https://api.openf1.org/v1/stints?session_key=${data.session.session_key}`;
  const raceControlUrl = `https://api.openf1.org/v1/race_control?session_key=${data.session.session_key}`;
  const overtakeUrl = `https://api.openf1.org/v1/overtakes?session_key=${data.session.session_key}`;

  const race: RaceSummary = {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    year: data.session.year,
    meetingName: data.meeting.meeting_name,
    officialName: data.meeting.meeting_official_name,
    circuit: data.session.circuit_short_name,
    country: data.session.country_name,
    date: data.session.date_start.slice(0, 10),
    sessionKey: data.session.session_key,
    meetingKey: data.session.meeting_key,
    notes: data.notes,
    laps: lapIndex.maxLap,
  };

  const abortedStart = data.race_control.some(
    (row) =>
      row.category === 'SessionStatus' &&
      /ABORT/i.test(row.message) &&
      parseTime(row.date) < lapIndex.firstLapStart,
  );
  const raceCutoff = abortedStart ? lapIndex.firstLapStart : lapIndex.firstLapStart - 5_000;

  const excludedPitRows = data.pit.filter((row) => isImplausiblePitLaneVisit(row));
  const validStintRows = data.stints.filter(isValidStint);
  const excludedStintRows = data.stints.filter((row) => !isValidStint(row));

  const sources: DataSourceInfo[] = [
    {
      endpoint: '/position',
      label: 'Position samples',
      records: data.position.length,
      available: data.position.length > 0,
      note: 'Used for starting snapshot, lead changes and position-change derivation.',
    },
    {
      endpoint: '/laps',
      label: 'Lap records',
      records: data.laps.length,
      available: data.laps.length > 0,
      note: 'Used to map event timestamps to lap numbers and chart laps.',
    },
    {
      endpoint: '/pit',
      label: 'Pit visits',
      records: data.pit.length,
      available: data.pit.length > 0,
      note: `Pit lane and stationary time where supplied by OpenF1.${excludedPitRows.length > 0 ? ` ${excludedPitRows.length} red-flag/restart visits over ${MAX_PLAUSIBLE_PIT_LANE_SECONDS} seconds are excluded from race-stop totals and retained as pit-cycle context.` : ''}`,
    },
    {
      endpoint: '/stints',
      label: 'Tyre stints',
      records: data.stints.length,
      available: data.stints.length > 0,
      note: `Compound and lap range for each recorded stint.${excludedStintRows.length > 0 ? ` ${excludedStintRows.length} rows with lap_end before lap_start are excluded from race totals.` : ''}`,
    },
    {
      endpoint: '/race_control',
      label: 'Race-control records',
      records: data.race_control.length,
      available: data.race_control.length > 0,
      note: 'Filtered for significance before the report is written.',
    },
    {
      endpoint: '/overtakes',
      label: 'Overtake timing rows',
      records: data.overtakes.length,
      available: data.overtakes.length > 0,
      note: 'Candidates only; every row is reconciled against pit visits and position timing.',
    },
    {
      endpoint: '/session_result',
      label: 'Final classification',
      records: data.session_result.length,
      available: data.session_result.length > 0,
      note: 'Official session classification and status.',
    },
    {
      endpoint: '/starting_grid',
      label: 'Official starting grid',
      records: 0,
      available: false,
      note: 'No records returned for the bundled sessions; starting positions use the first /position snapshot.',
    },
  ];

  /* ---------------------------------------------------------------- */
  /* 1. Session facts                                                  */
  /* ---------------------------------------------------------------- */

  const sessionFacts: EvidenceFact[] = [];
  sessionFacts.push(
    store.add({
      category: 'session',
      event: 'Race',
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source: 'OpenF1 /sessions + /meetings',
      sourceUrl: sessionUrl,
      value: `${race.name} · ${race.circuit}, ${race.country}`,
      detail: race.officialName ?? null,
      confidence: 'recorded',
      includedInReport: true,
    }),
    store.add({
      category: 'session',
      event: 'Race date',
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source: 'OpenF1 /sessions',
      sourceUrl: sessionUrl,
      value: formatRaceDate(data.session.date_start),
      detail: `${formatDateTime(data.session.date_start)} scheduled start`,
      confidence: 'recorded',
      includedInReport: true,
    }),
    store.add({
      category: 'session',
      event: 'Race distance',
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source: 'OpenF1 /laps + /session_result',
      sourceUrl: resultUrl,
      value: `${lapIndex.maxLap} laps`,
      detail: 'Maximum recorded race lap.',
      confidence: 'derived',
      includedInReport: true,
    }),
    store.add({
      category: 'session',
      event: 'Data coverage',
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source: 'OpenF1 API',
      sourceUrl: sessionUrl,
      value: sources
        .filter((source) => source.available)
        .map((source) => `${source.endpoint} ${source.records}`)
        .join(' · '),
      detail: sources
        .filter((source) => !source.available)
        .map((source) => `${source.endpoint}: ${source.note}`)
        .join(' '),
      confidence: 'recorded',
      includedInReport: true,
    }),
    store.add({
      category: 'session',
      event: 'Starting-position source',
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source: 'OpenF1 /position (first timing snapshot)',
      sourceUrl: positionUrl,
      value: 'First timing snapshot; no /starting_grid records',
      detail: 'Starting positions are not an official grid feed. They are the first position snapshot returned for the session.',
      confidence: 'recorded',
      includedInReport: true,
    }),
  );
  if (abortedStart) {
    sessionFacts.push(
      store.add({
        category: 'session',
        event: 'Aborted start',
        driver: null,
        driverNumber: null,
        lap: null,
        lapEnd: null,
        source: 'OpenF1 /race_control + /laps',
        sourceUrl: raceControlUrl,
        value: 'First start aborted before the first counted lap',
        detail: 'Overtake timing rows before the restart are excluded from on-track classification.',
        confidence: 'derived',
        includedInReport: true,
      }),
    );
  }

  /* ---------------------------------------------------------------- */
  /* 2. Starting positions                                             */
  /* ---------------------------------------------------------------- */

  const startFacts = new Map<number, EvidenceFact>();
  const firstSnapshot = position.firstSnapshotDate
    ? position.snapshotAt(parseTime(position.firstSnapshotDate))
    : [];
  for (const sample of firstSnapshot) {
    const fact = store.add({
      category: 'start',
      event: 'Starting position',
      driver: driverName(sample.driver_number),
      driverNumber: sample.driver_number,
      lap: 1,
      lapEnd: 1,
      source: 'OpenF1 /position (first timing snapshot)',
      sourceUrl: positionUrl,
      value: `P${sample.position}`,
      detail: position.firstSnapshotDate ? `Snapshot at ${formatDateTime(position.firstSnapshotDate)}` : null,
      confidence: 'recorded',
      includedInReport: true,
    });
    startFacts.set(sample.driver_number, fact);
  }

  /* ---------------------------------------------------------------- */
  /* 3. Finishing order                                                */
  /* ---------------------------------------------------------------- */

  const finishFacts = new Map<number, EvidenceFact>();
  const finishRecords: FinishFactRecord[] = [];
  const sortedResults = [...data.session_result].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99) || a.driver_number - b.driver_number,
  );
  for (const [rowIndex, row] of sortedResults.entries()) {
    const status = row.dsq ? 'DSQ' : row.dns ? 'DNS' : row.dnf ? 'DNF' : null;
    const positionLabel = row.position == null ? status ?? 'NC' : `P${row.position}`;
    const pieces = [positionLabel, `${row.number_of_laps} laps`];
    if (row.points > 0) pieces.push(`${row.points} pts`);
    if (row.position !== 1 && !status) pieces.push(formatGap(row.gap_to_leader));
    const fact = store.add({
      category: 'finish',
      event: status ? `Final classification (${status})` : 'Finishing position',
      driver: driverName(row.driver_number),
      driverNumber: row.driver_number,
      lap: row.number_of_laps,
      lapEnd: row.number_of_laps,
      source: 'OpenF1 /session_result',
      sourceUrl: resultUrl,
      value: pieces.join(' · '),
      detail: status ? `Status: ${status}` : null,
      confidence: 'recorded',
      includedInReport: true,
    });
    finishFacts.set(row.driver_number, fact);
    finishRecords.push({ fact, row, rowIndex });
  }

  /* ---------------------------------------------------------------- */
  /* 4. Pit visits                                                     */
  /* ---------------------------------------------------------------- */

  const pitFacts: PitFactRecord[] = [];
  const excludedPits: ExcludedPitRecord[] = [];
  const pitByDriver = new Map<number, PitFactRecord[]>();
  const sortedPits = [...data.pit].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of sortedPits) {
    const time = parseTime(row.date);
    const seconds = pitLaneSeconds(row);
    const isRaceStop = !isImplausiblePitLaneVisit(row);
    const before =
      position.lastAtOrBefore(row.driver_number, time - 2_000)?.position ??
      position.lastAtOrBefore(row.driver_number, time)?.position ??
      null;
    const after =
      position.firstAtOrAfter(row.driver_number, time + 2_000)?.position ??
      position.firstAtOrAfter(row.driver_number, time)?.position ??
      null;
    const durationPieces: string[] = [];
    if (row.stop_duration != null) durationPieces.push(`${formatSeconds(row.stop_duration)} stop`);
    if (row.pit_duration != null) durationPieces.push(`${formatSeconds(row.pit_duration)} pit lane`);
    else if (row.lane_duration != null) durationPieces.push(`${formatSeconds(row.lane_duration)} pit lane`);
    const positionPiece =
      before != null && after != null && before !== after ? `P${before} → P${after}` : null;
    const value = [durationPieces.join(' · ') || 'duration not supplied', positionPiece]
      .filter(Boolean)
      .join(' · ');
    const reason = isRaceStop
      ? null
      : `Recorded pit-lane time ${formatSeconds(seconds)} exceeds the ${MAX_PLAUSIBLE_PIT_LANE_SECONDS}s race-stop threshold; retained as pit-cycle context, not counted as a race stop.`;
    const fact = store.add({
      category: 'pit',
      event: isRaceStop ? 'Pit visit' : 'Pit-lane visit (red flag/restart)',
      driver: driverName(row.driver_number),
      driverNumber: row.driver_number,
      lap: row.lap_number,
      lapEnd: row.lap_number,
      source: isRaceStop ? 'OpenF1 /pit (position change from /position)' : 'OpenF1 /pit (data-quality label)',
      sourceUrl: pitUrl,
      value: isRaceStop ? value : `${value} · excluded from race-stop totals`,
      detail:
        reason ??
        (positionPiece == null
          ? 'Position before/after not both available in /position samples.'
          : 'Position before and after the pit window is derived from the nearest /position samples.'),
      confidence: isRaceStop ? 'recorded' : 'derived',
      includedInReport: true,
    });
    const record: PitFactRecord = {
      fact,
      row,
      time,
      lap: row.lap_number,
      before,
      after,
      isRaceStop,
    };
    pitFacts.push(record);
    const list = pitByDriver.get(row.driver_number) ?? [];
    list.push(record);
    pitByDriver.set(row.driver_number, list);
    if (reason) excludedPits.push({ fact, row, reason });
  }

  /* ---------------------------------------------------------------- */
  /* 5. Stints                                                         */
  /* ---------------------------------------------------------------- */

  const stintFacts: StintFactRecord[] = [];
  const excludedStints: ExcludedStintRecord[] = [];
  const sortedStints = [...validStintRows].sort(
    (a, b) => a.driver_number - b.driver_number || a.lap_start - b.lap_start || a.stint_number - b.stint_number,
  );
  for (const row of sortedStints) {
    const length = Math.max(0, row.lap_end - row.lap_start + 1);
    const fact = store.add({
      category: 'stint',
      event: 'Tyre stint',
      driver: driverName(row.driver_number),
      driverNumber: row.driver_number,
      lap: row.lap_start,
      lapEnd: row.lap_end,
      source: 'OpenF1 /stints',
      sourceUrl: stintUrl,
      value: `${row.compound} · ${formatLapRange(row.lap_start, row.lap_end)} (${length} laps)`,
      detail: `Stint ${row.stint_number}; tyre age at start ${row.tyre_age_at_start} laps.`,
      confidence: 'recorded',
      includedInReport: true,
    });
    stintFacts.push({ fact, row });
  }

  for (const row of [...excludedStintRows].sort(
    (a, b) => a.driver_number - b.driver_number || a.stint_number - b.stint_number,
  )) {
    const reason = `Invalid lap range: lap_start ${row.lap_start} is after lap_end ${row.lap_end}. The row cannot describe a race stint.`;
    const fact = store.add({
      category: 'stint',
      event: 'Tyre stint excluded',
      driver: driverName(row.driver_number),
      driverNumber: row.driver_number,
      lap: row.lap_start,
      lapEnd: row.lap_end,
      source: 'OpenF1 /stints (data-quality exclusion)',
      sourceUrl: stintUrl,
      value: `${row.compound} · lap_start ${row.lap_start} · lap_end ${row.lap_end} · excluded from race totals`,
      detail: reason,
      confidence: 'derived',
      includedInReport: false,
    });
    excludedStints.push({ fact, row, reason });
  }

  /* ---------------------------------------------------------------- */
  /* 6. Race control                                                   */
  /* ---------------------------------------------------------------- */

  const raceControl: RaceControlRecord[] = [];
  const sortedRaceControl = [...data.race_control].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of sortedRaceControl) {
    const significance = classifyRaceControl(row);
    const included = significance !== 'low';
    const lap = row.lap_number && row.lap_number > 0 ? row.lap_number : lapIndex.lapAt(parseTime(row.date)) || null;
    const mentioned = driversMentionedInMessage(row.message, driverByNumber);
    const driver =
      row.driver_number != null
        ? driverName(row.driver_number)
        : mentioned.length > 0
          ? mentioned.map((number) => driverName(number)).join(', ')
          : null;
    const fact = store.add({
      category: 'race_control',
      event: raceControlEventLabel(row),
      driver,
      driverNumber: row.driver_number ?? (mentioned.length === 1 ? mentioned[0] : null),
      lap,
      lapEnd: lap,
      source: 'OpenF1 /race_control',
      sourceUrl: raceControlUrl,
      value: row.message,
      detail: [row.flag ? `flag=${row.flag}` : null, row.scope ? `scope=${row.scope}` : null, row.sector ? `sector=${row.sector}` : null]
        .filter(Boolean)
        .join(' · ') || null,
      confidence: 'recorded',
      includedInReport: included,
      significance,
    });
    raceControl.push({ fact, row, lap, significance, included });
  }

  /* ---------------------------------------------------------------- */
  /* 7. Overtakes: reconcile against pit visits and position timing    */
  /* ---------------------------------------------------------------- */

  const onTrackOvertakes: OvertakeFactRecord[] = [];
  const pitCycles: PitCycleRecord[] = [];
  const excludedOvertakes: ExcludedOvertakeRecord[] = [];
  const rawPitCyclePairs = new Set<string>();
  const derivedPitCyclePairs = new Set<string>();
  const sortedOvertakes = [...data.overtakes].sort((a, b) => a.date.localeCompare(b.date));

  for (const row of sortedOvertakes) {
    const time = parseTime(row.date);
    const lap = lapIndex.lapAt(time);
    const a = row.overtaking_driver_number;
    const b = row.overtaken_driver_number;
    const aName = driverName(a);
    const bName = driverName(b);
    const fromA = position.previous(a, time)?.position ?? null;
    const toA = position.firstAtOrAfter(a, time)?.position ?? row.position;
    const fromB = position.previous(b, time)?.position ?? null;
    const toB = position.firstAtOrAfter(b, time)?.position ?? null;

    if (lap === 0 || time < raceCutoff) {
      const detail = abortedStart
        ? 'Recorded before the first counted lap after the aborted start; not part of the race narrative.'
        : 'Recorded before the first counted lap; not part of the race narrative.';
      const fact = store.add({
        category: 'overtake_record',
        event: 'Overtake record (pre-start)',
        driver: aName,
        driverNumber: a,
        lap: null,
        lapEnd: null,
        source: 'OpenF1 /overtakes',
        sourceUrl: overtakeUrl,
        value: `Claimed P${row.position} over ${bName}`,
        detail,
        confidence: 'recorded',
        includedInReport: false,
      });
      excludedOvertakes.push({ fact, row, lap: 0, reason: 'pre_start', detail });
      continue;
    }

    const nearbyPits = [
      ...(pitByDriver.get(a) ?? []),
      ...(pitByDriver.get(b) ?? []),
    ].filter((pit) => Math.abs(pit.time - time) <= PIT_WINDOW_MS);
    const uniquePits = [...new Map(nearbyPits.map((pit) => [pit.fact.id, pit])).values()];

    if (uniquePits.length > 0) {
      const pit =
        uniquePits.find((candidate) => candidate.row.driver_number === b) ??
        uniquePits.sort((x, y) => Math.abs(x.time - time) - Math.abs(y.time - time))[0];
      const pitDriver = pit.row.driver_number;
      const pitDriverName = driverName(pitDriver);
      const detail = `Overtake timing row at ${formatDateTime(row.date)}. ${pitDriverName} has a pit visit within 60 seconds (lap ${pit.lap}). Classified as a pit-cycle position change, not an on-track overtake.`;
      const fact = store.add({
        category: 'pit_cycle',
        event: 'Pit-cycle position change',
        driver: aName,
        driverNumber: a,
        lap,
        lapEnd: lap,
        source: 'OpenF1 /overtakes + /pit',
        sourceUrl: pitUrl,
        value: `P${fromA ?? '?'} → P${toA ?? row.position} · ${pitDriverName} pit lap ${pit.lap}`,
        detail,
        confidence: 'derived',
        includedInReport: true,
      });
      pitCycles.push({
        fact,
        lap,
        driverNumber: a,
        fromPosition: fromA,
        toPosition: toA,
        pit,
        derived: false,
        sourceRow: row,
      });
      rawPitCyclePairs.add(`${a}|${pitDriver}|${lap}`);
      continue;
    }

    const changed =
      (fromA != null && toA != null && toA < fromA) ||
      (fromB != null && toB != null && toB > fromB);
    const positionOk = toA != null && toA <= row.position && toB != null && toB > row.position;
    const firstLapEvidence = lap <= 1;

    if (positionOk && (changed || firstLapEvidence)) {
      const fact = store.add({
        category: 'overtake',
        event: 'On-track overtake',
        driver: aName,
        driverNumber: a,
        lap,
        lapEnd: lap,
        source: 'OpenF1 /overtakes (corroborated by /position)',
        sourceUrl: overtakeUrl,
        value: `P${row.position} · ${aName} ahead of ${bName}`,
        detail: `Position timing: ${aName} P${fromA ?? '?'} → P${toA ?? '?'}; ${bName} P${fromB ?? '?'} → P${toB ?? '?'}. No pit visit for either car within 60 seconds.`,
        confidence: 'recorded',
        includedInReport: true,
      });
      onTrackOvertakes.push({
        fact,
        row,
        driverNumber: a,
        lap,
        time,
        fromPosition: fromA,
        toPosition: toA,
        overtakenFrom: fromB,
        overtakenTo: toB,
      });
    } else {
      const detail = `Position timing did not corroborate the claimed P${row.position} pass (${aName} P${fromA ?? '?'} → P${toA ?? '?'}; ${bName} P${fromB ?? '?'} → P${toB ?? '?'}).`;
      const fact = store.add({
        category: 'overtake_record',
        event: 'Overtake record (not verified)',
        driver: aName,
        driverNumber: a,
        lap,
        lapEnd: lap,
        source: 'OpenF1 /overtakes + /position',
        sourceUrl: overtakeUrl,
        value: `Claimed P${row.position} over ${bName}`,
        detail,
        confidence: 'recorded',
        includedInReport: false,
      });
      excludedOvertakes.push({ fact, row, lap, reason: 'unverified', detail });
    }
  }

  /* Derived pit-cycle gains: cover position changes that /overtakes misses. */
  for (const pit of pitFacts) {
    const beforeD =
      position.previous(pit.row.driver_number, pit.time - 1_000)?.position ??
      position.lastAtOrBefore(pit.row.driver_number, pit.time)?.position ??
      null;
    const afterD =
      position.firstAtOrAfter(pit.row.driver_number, pit.time + 1_000)?.position ??
      position.firstAtOrAfter(pit.row.driver_number, pit.time)?.position ??
      null;
    if (beforeD == null || afterD == null || afterD <= beforeD) continue;

    const windowStart = pit.time - PIT_WINDOW_MS;
    const windowEnd = pit.time + PIT_WINDOW_MS;
    for (const [driverNumber, rows] of position.byDriver) {
      if (driverNumber === pit.row.driver_number) continue;
      let candidate: { from: number; to: number; time: number } | null = null;
      for (let index = 0; index < rows.length; index++) {
        const sample = rows[index];
        const sampleTime = parseTime(sample.date);
        if (sampleTime < windowStart || sampleTime > windowEnd) continue;
        const prior = rows[index - 1];
        if (!prior) continue;
        const priorPosition = prior.position;
        if (
          priorPosition > sample.position &&
          priorPosition > beforeD &&
          sample.position <= beforeD
        ) {
          candidate = { from: priorPosition, to: sample.position, time: sampleTime };
          break;
        }
      }
      if (!candidate) continue;
      const derivedLap = lapIndex.lapAt(candidate.time) || pit.lap;
      const pairKey = `${driverNumber}|${pit.row.driver_number}|${derivedLap}`;
      if (rawPitCyclePairs.has(pairKey) || derivedPitCyclePairs.has(pairKey)) continue;
      const alreadyRaw = pitCycles.some(
        (cycle) =>
          cycle.driverNumber === driverNumber &&
          cycle.pit.row.driver_number === pit.row.driver_number &&
          Math.abs(cycle.lap - derivedLap) <= 1,
      );
      if (alreadyRaw) continue;
      const gName = driverName(driverNumber);
      const dName = driverName(pit.row.driver_number);
      const fact = store.add({
        category: 'pit_cycle',
        event: 'Pit-cycle position change',
        driver: gName,
        driverNumber,
        lap: derivedLap,
        lapEnd: derivedLap,
        source: 'OpenF1 /position + /pit',
        sourceUrl: positionUrl,
        value: `P${candidate.from} → P${candidate.to} · ${dName} pit lap ${pit.lap}`,
        detail: `Derived from position samples within 60 seconds of ${dName}'s pit visit. Not an on-track overtake.`,
        confidence: 'derived',
        includedInReport: true,
      });
      pitCycles.push({
        fact,
        lap: derivedLap,
        driverNumber,
        fromPosition: candidate.from,
        toPosition: candidate.to,
        pit,
        derived: true,
      });
      derivedPitCyclePairs.add(pairKey);
    }
  }

  pitCycles.sort(
    (a, b) =>
      a.lap - b.lap ||
      (a.fromPosition ?? 99) - (b.fromPosition ?? 99) ||
      a.driverNumber - b.driverNumber,
  );
  onTrackOvertakes.sort((a, b) => a.lap - b.lap || a.row.position - b.row.position || a.time - b.time);

  /* ---------------------------------------------------------------- */
  /* 8. Lead changes and laps led                                      */
  /* ---------------------------------------------------------------- */

  const p1Samples = [...data.position]
    .filter((sample) => sample.position === 1)
    .sort((a, b) => a.date.localeCompare(b.date));
  const snapshotAtCutoff = position.snapshotAt(raceCutoff).find((sample) => sample.position === 1);
  let currentLeader =
    snapshotAtCutoff?.driver_number ??
    p1Samples.find((sample) => parseTime(sample.date) >= raceCutoff)?.driver_number ??
    startFacts.keys().next().value ??
    null;

  const leadChanges: LeadChangeRecord[] = [];
  for (const sample of p1Samples) {
    const time = parseTime(sample.date);
    if (time < raceCutoff || currentLeader == null) continue;
    if (sample.driver_number === currentLeader) continue;
    const oldDriverNumber = currentLeader;
    const newDriverNumber = sample.driver_number;
    const lap = Math.max(1, lapIndex.lapAt(time));
    const nearbyPits = [
      ...(pitByDriver.get(oldDriverNumber) ?? []),
      ...(pitByDriver.get(newDriverNumber) ?? []),
    ].filter((pit) => Math.abs(pit.time - time) <= PIT_WINDOW_MS);
    const onTrack =
      onTrackOvertakes.find(
        (overtake) =>
          overtake.driverNumber === newDriverNumber &&
          overtake.row.overtaken_driver_number === oldDriverNumber &&
          Math.abs(overtake.lap - lap) <= 1,
      ) ?? null;
    const classification = nearbyPits.length
      ? `Coincides with a pit visit; classified as a pit-cycle lead change.`
      : onTrack
        ? `Corroborated by an on-track overtake record.`
        : `Position timing only; no on-track overtake record was found.`;
    const fact = store.add({
      category: 'lead_change',
      event: 'Lead change',
      driver: driverName(newDriverNumber),
      driverNumber: newDriverNumber,
      lap,
      lapEnd: lap,
      source: 'OpenF1 /position',
      sourceUrl: positionUrl,
      value: `P1: ${driverName(oldDriverNumber)} → ${driverName(newDriverNumber)}`,
      detail: `${formatDateTime(sample.date)}. ${classification}`,
      confidence: 'recorded',
      includedInReport: true,
    });
    leadChanges.push({
      fact,
      time,
      lap,
      oldDriverNumber,
      newDriverNumber,
      oldDriver: driverName(oldDriverNumber),
      newDriver: driverName(newDriverNumber),
      pitVisits: nearbyPits,
      onTrackOvertake: onTrack,
    });
    currentLeader = newDriverNumber;
  }

  const leaderByLap = new Map<number, number>();
  let lastLeader = startFacts.size > 0
    ? (firstSnapshot.find((sample) => sample.position === 1)?.driver_number ?? null)
    : null;
  for (let lap = 1; lap <= lapIndex.maxLap; lap++) {
    const start = lapIndex.lapStart(lap);
    if (start != null) {
      const snapshot = position.snapshotAt(start);
      const leader = snapshot.find((sample) => sample.position === 1)?.driver_number;
      if (leader != null) lastLeader = leader;
    }
    if (lastLeader != null) leaderByLap.set(lap, lastLeader);
  }

  const runsByDriver = new Map<number, Array<[number, number]>>();
  let runDriver: number | null = null;
  let runStart = 0;
  let runEnd = 0;
  const flushRun = () => {
    if (runDriver == null) return;
    const runs = runsByDriver.get(runDriver) ?? [];
    runs.push([runStart, runEnd]);
    runsByDriver.set(runDriver, runs);
  };
  for (let lap = 1; lap <= lapIndex.maxLap; lap++) {
    const leader = leaderByLap.get(lap) ?? null;
    if (leader == null) {
      flushRun();
      runDriver = null;
      continue;
    }
    if (leader === runDriver) {
      runEnd = lap;
    } else {
      flushRun();
      runDriver = leader;
      runStart = lap;
      runEnd = lap;
    }
  }
  flushRun();

  const lapsLed: LapsLedRecord[] = [];
  for (const [driverNumber, runs] of runsByDriver) {
    const total = runs.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
    const ranges = runs
      .map(([start, end]) => (start === end ? `${start}` : `${start}–${end}`))
      .join(', ');
    const fact = store.add({
      category: 'laps_led',
      event: 'Laps led',
      driver: driverName(driverNumber),
      driverNumber,
      lap: runs[0]?.[0] ?? null,
      lapEnd: runs[runs.length - 1]?.[1] ?? null,
      source: 'Derived from OpenF1 /position and /laps',
      sourceUrl: positionUrl,
      value: `${total} laps (lap${total === 1 ? '' : 's'} ${ranges})`,
      detail: 'Leader at the start of each recorded lap, grouped into contiguous ranges.',
      confidence: 'derived',
      includedInReport: true,
    });
    lapsLed.push({ fact, driverNumber, total, ranges: runs });
  }
  lapsLed.sort((a, b) => b.total - a.total || a.driverNumber - b.driverNumber);

  /* ---------------------------------------------------------------- */
  /* 9. Summary facts                                                  */
  /* ---------------------------------------------------------------- */

  const summaryFacts: Record<string, EvidenceFact> = {};
  const addSummary = (
    key: string,
    event: string,
    value: string,
    source: string,
    sourceUrl: string | null,
    detail?: string,
  ) => {
    const fact = store.add({
      category: 'summary',
      event,
      driver: null,
      driverNumber: null,
      lap: null,
      lapEnd: null,
      source,
      sourceUrl,
      value,
      detail: detail ?? null,
      confidence: 'derived',
      includedInReport: true,
    });
    summaryFacts[key] = fact;
    return fact;
  };

  addSummary(
    'leadChangeCount',
    'Lead-change count',
    String(leadChanges.length),
    'Derived from OpenF1 /position',
    positionUrl,
    'Changes of P1 after the race-start cutoff.',
  );
  addSummary(
    'lapsLedDrivers',
    'Drivers who led',
    String(lapsLed.length),
    'Derived from OpenF1 /position + /laps',
    positionUrl,
  );
  const racePitFacts = pitFacts.filter((pit) => pit.isRaceStop);
  addSummary(
    'pitVisitCount',
    'Pit-visit count',
    String(racePitFacts.length),
    'Derived from OpenF1 /pit',
    pitUrl,
    'Race stops only; red-flag/restart pit-lane visits are counted separately.',
  );
  addSummary(
    'excludedPitVisitCount',
    'Pit visits excluded',
    String(excludedPits.length),
    'Derived from OpenF1 /pit',
    pitUrl,
    `Pit-lane time over ${MAX_PLAUSIBLE_PIT_LANE_SECONDS} seconds, treated as a red-flag or restart visit rather than a race stop.`,
  );
  addSummary(
    'stintCount',
    'Tyre-stint count',
    String(stintFacts.length),
    'Derived from OpenF1 /stints',
    stintUrl,
    'Valid rows only; invalid lap ranges are counted separately.',
  );
  addSummary(
    'excludedStintCount',
    'Tyre-stint rows excluded',
    String(excludedStints.length),
    'Derived from OpenF1 /stints',
    stintUrl,
    'Rows whose lap_end fell before lap_start and could not describe a race stint.',
  );
  const compounds = [...new Set(stintFacts.map((stint) => stint.row.compound))].sort();
  addSummary(
    'compounds',
    'Compounds recorded',
    compounds.length > 0 ? compounds.join(', ') : 'None supplied',
    'Derived from OpenF1 /stints',
    stintUrl,
  );
  const timedPits = racePitFacts.filter(
    (pit) => pit.row.stop_duration != null || pit.row.pit_duration != null,
  );
  if (timedPits.length > 0) {
    const fastest = [...timedPits].sort((a, b) => {
      const aTime = a.row.stop_duration ?? a.row.pit_duration ?? Number.POSITIVE_INFINITY;
      const bTime = b.row.stop_duration ?? b.row.pit_duration ?? Number.POSITIVE_INFINITY;
      return aTime - bTime;
    })[0];
    const duration = fastest.row.stop_duration ?? fastest.row.pit_duration;
    const label = fastest.row.stop_duration != null ? 'stationary stop' : 'pit-lane time';
    addSummary(
      'fastestPit',
      'Fastest pit visit',
      `${driverName(fastest.row.driver_number)} · lap ${fastest.row.lap_number} · ${formatSeconds(duration)} (${label})`,
      'Derived from OpenF1 /pit',
      pitUrl,
      fastest.row.stop_duration != null
        ? 'Fastest recorded stationary stop.'
        : 'Fastest recorded pit-lane time; stationary stop time was not supplied.',
    );
  }
  const preStartOvertakeCount = excludedOvertakes.filter((row) => row.reason === 'pre_start').length;
  const afterCutoffOvertakeCount = data.overtakes.length - preStartOvertakeCount;
  const rawPitCycleCount = pitCycles.filter((cycle) => !cycle.derived).length;
  const derivedPitCycleCount = pitCycles.filter((cycle) => cycle.derived).length;
  addSummary(
    'overtakeRawCount',
    'Overtake timing-row count',
    String(data.overtakes.length),
    'Derived from OpenF1 /overtakes',
    overtakeUrl,
    'Total rows returned, including records before the start cutoff.',
  );
  addSummary(
    'overtakeAfterCutoffCount',
    'Overtake rows after start cutoff',
    String(afterCutoffOvertakeCount),
    'Derived from OpenF1 /overtakes',
    overtakeUrl,
    'Rows that remain for classification after excluding pre-start records.',
  );
  addSummary(
    'onTrackOvertakeCount',
    'Verified on-track overtake count',
    String(onTrackOvertakes.length),
    'Derived from OpenF1 /overtakes + /position + /pit',
    overtakeUrl,
    'Rows outside a 60-second pit window whose position change was corroborated by /position.',
  );
  addSummary(
    'rawPitCycleCount',
    'Overtake rows classified as pit cycles',
    String(rawPitCycleCount),
    'Derived from OpenF1 /overtakes + /pit',
    pitUrl,
    'Overtake timing rows that fell within a 60-second pit window.',
  );
  addSummary(
    'derivedPitCycleCount',
    'Additional pit cycles derived from position',
    String(derivedPitCycleCount),
    'Derived from OpenF1 /position + /pit',
    positionUrl,
    'Position changes found in /position near a pit visit that had no corresponding /overtakes row.',
  );
  addSummary(
    'pitCycleCount',
    'Pit-cycle position-change count',
    String(pitCycles.length),
    'Derived from OpenF1 /overtakes + /position + /pit',
    pitUrl,
    'Position changes within a 60-second pit window, reported as pit-cycle changes rather than overtakes.',
  );
  addSummary(
    'excludedPreStartCount',
    'Pre-start overtake records excluded',
    String(preStartOvertakeCount),
    'Derived from OpenF1 /overtakes',
    overtakeUrl,
  );
  addSummary(
    'excludedUnverifiedCount',
    'Unverified overtake records excluded',
    String(excludedOvertakes.filter((row) => row.reason === 'unverified').length),
    'Derived from OpenF1 /overtakes + /position',
    overtakeUrl,
  );
  addSummary(
    'raceControlTotal',
    'Race-control record count',
    String(raceControl.length),
    'Derived from OpenF1 /race_control',
    raceControlUrl,
  );
  addSummary(
    'raceControlSignificant',
    'Significant race-control event count',
    String(raceControl.filter((row) => row.included).length),
    'Derived from OpenF1 /race_control',
    raceControlUrl,
    'Critical and notable events; sector yellow/clear and blue-flag messages are excluded.',
  );
  const safetyCarCount = raceControl.filter(
    (row) =>
      row.row.category === 'SafetyCar' &&
      /DEPLOY|IN THIS LAP/i.test(row.row.message) &&
      !/ENDING/i.test(row.row.message),
  ).length;
  addSummary(
    'safetyCarCount',
    'Safety-car deployments',
    String(safetyCarCount),
    'Derived from OpenF1 /race_control',
    raceControlUrl,
  );
  const redFlagCount = raceControl.filter(
    (row) => row.row.category === 'Flag' && row.row.flag === 'RED',
  ).length;
  addSummary(
    'redFlagCount',
    'Red-flag periods',
    String(redFlagCount),
    'Derived from OpenF1 /race_control',
    raceControlUrl,
  );
  addSummary(
    'generationMode',
    'Report generation mode',
    'Deterministic report; no AI model',
    'Report generator',
    null,
    'Optional local AI narration is requested separately, uses the same evidence and is labelled as AI-generated.',
  );
  const generatedBeforeCountFact = store.all().length;
  const includedBeforeCountFact = store.all().filter((fact) => fact.includedInReport).length;
  addSummary(
    'evidenceFactCount',
    'Evidence fact count',
    `${generatedBeforeCountFact + 1} facts · ${includedBeforeCountFact + 1} included in report`,
    'Derived from the evidence table',
    null,
    'Each report sentence cites one or more IDs from this table.',
  );

  /* ---------------------------------------------------------------- */
  /* 10. Tables                                                        */
  /* ---------------------------------------------------------------- */

  const finish: FinishTableRow[] = finishRecords.map(({ fact, row }) => {
    const start = startFacts.get(row.driver_number);
    const startPosition = start ? Number.parseInt(start.value.replace('P', ''), 10) : null;
    const status = row.dsq ? 'DSQ' : row.dns ? 'DNS' : row.dnf ? 'DNF' : 'classified';
    const placesGained =
      startPosition != null && row.position != null && status === 'classified'
        ? startPosition - row.position
        : null;
    return {
      position: row.position,
      driverNumber: row.driver_number,
      name: driverName(row.driver_number),
      acronym: driverAcronym(row.driver_number),
      team: driverTeam(row.driver_number),
      colour: driverColour(row.driver_number),
      startPosition,
      placesGained,
      status,
      laps: row.number_of_laps,
      gap: formatGap(row.gap_to_leader),
      points: row.points,
      factId: fact.id,
    };
  });

  const overtakes: OvertakeTableRow[] = onTrackOvertakes.map((record) => ({
    factId: record.fact.id,
    lap: record.lap,
    position: record.row.position,
    driverNumber: record.driverNumber,
    driver: driverName(record.driverNumber),
    overtakenDriverNumber: record.row.overtaken_driver_number,
    overtakenDriver: driverName(record.row.overtaken_driver_number),
    fromPosition: record.fromPosition,
    toPosition: record.toPosition,
    date: record.row.date,
  }));

  const pitCyclesTable: PitCycleTableRow[] = pitCycles.map((record) => ({
    factId: record.fact.id,
    lap: record.lap,
    driverNumber: record.driverNumber,
    driver: driverName(record.driverNumber),
    fromPosition: record.fromPosition,
    toPosition: record.toPosition,
    pittedDriverNumber: record.pit.row.driver_number,
    pittedDriver: driverName(record.pit.row.driver_number),
    pitLap: record.pit.lap,
    pitDuration: record.pit.row.stop_duration ?? record.pit.row.pit_duration ?? null,
    pitIsRaceStop: record.pit.isRaceStop,
    pitFactId: record.pit.fact.id,
  }));

  const excludedRows: ExcludedOvertakeRow[] = excludedOvertakes.map((record) => ({
    factId: record.fact.id,
    lap: record.lap,
    driver: driverName(record.row.overtaking_driver_number),
    overtakenDriver: driverName(record.row.overtaken_driver_number),
    claimedPosition: record.row.position,
    reason: record.reason,
    detail: record.detail,
  }));

  const stintsByDriver = new Map<number, StintTableDriver>();
  for (const { fact, row } of stintFacts) {
    let driver = stintsByDriver.get(row.driver_number);
    if (!driver) {
      driver = {
        driverNumber: row.driver_number,
        name: driverName(row.driver_number),
        acronym: driverAcronym(row.driver_number),
        team: driverTeam(row.driver_number),
        colour: driverColour(row.driver_number),
        stints: [],
      };
      stintsByDriver.set(row.driver_number, driver);
    }
    driver.stints.push({
      factId: fact.id,
      stintNumber: row.stint_number,
      compound: row.compound,
      lapStart: row.lap_start,
      lapEnd: row.lap_end,
      tyreAgeAtStart: row.tyre_age_at_start,
    });
  }
  const stints = [...stintsByDriver.values()].sort((a, b) => {
    const aFinish = finish.find((row) => row.driverNumber === a.driverNumber)?.position ?? 99;
    const bFinish = finish.find((row) => row.driverNumber === b.driverNumber)?.position ?? 99;
    return aFinish - bFinish;
  });

  const raceControlTable: RaceControlTableRow[] = raceControl
    .filter((record) => record.included)
    .map((record) => ({
      factId: record.fact.id,
      lap: record.lap,
      date: record.row.date,
      category: record.row.category,
      flag: record.row.flag,
      driver: record.fact.driver,
      message: record.row.message,
      significance: record.significance,
      includedInReport: true,
    }));

  /* ---------------------------------------------------------------- */
  /* 11. Chart                                                         */
  /* ---------------------------------------------------------------- */

  const chart = buildChart({
    data,
    race,
    position,
    lapIndex,
    abortedStart,
    leadChanges,
    raceControl,
    driverName,
    driverAcronym,
    driverTeam,
    driverColour,
    finish,
  });

  const tables: RaceTables = {
    finish,
    overtakes,
    pitCycles: pitCyclesTable,
    excludedOvertakes: excludedRows,
    stints,
    raceControl: raceControlTable,
  };

  const facts = store.all();
  return {
    race,
    facts,
    factsById: new Map(facts.map((fact) => [fact.id, fact])),
    sources,
    summaryFacts,
    sessionFacts,
    startFacts,
    finishFacts,
    finishRecords,
    pitFacts,
    excludedPits,
    stintFacts,
    excludedStints,
    leadChanges,
    lapsLed,
    onTrackOvertakes,
    pitCycles,
    excludedOvertakes,
    raceControl,
    tables,
    chart,
    abortedStart,
  };
}

/* ------------------------------------------------------------------ */
/* Classification helpers                                              */
/* ------------------------------------------------------------------ */

function classifyRaceControl(row: RaceControlRow): 'critical' | 'notable' | 'low' {
  const message = row.message.toUpperCase();
  if (row.category === 'SafetyCar') return 'critical';
  if (row.category === 'SessionStatus') return 'critical';
  if (row.category === 'Flag') {
    if (row.flag === 'RED' || row.flag === 'CHEQUERED') return 'critical';
    if (row.flag === 'GREEN' && row.scope === 'Track') return 'notable';
    if ((row.flag === 'YELLOW' || row.flag === 'DOUBLE YELLOW') && row.scope === 'Track' && !row.sector) {
      return 'notable';
    }
    return 'low';
  }
  if (RACE_CONTROL_LOW_MESSAGES.test(message)) return 'low';
  if (
    /PENALTY|DISQUALIF|INVESTIGAT|NOTED|COLLISION|INCIDENT|FALSE START|RACE START|SAFETY CAR|RED FLAG|SESSION|ABORT/i.test(
      message,
    )
  ) {
    return 'critical';
  }
  if (
    /TRACK LIMITS|TIME .* DELETED|LAP DELETED|PIT EXIT|OVERTAKE DISABLED|OVERTAKE ENABLED|LOW GRIP|NORMAL GRIP|RAIN|WEATHER|DRS DISABLED/i.test(
      message,
    )
  ) {
    return 'notable';
  }
  return 'low';
}

function raceControlEventLabel(row: RaceControlRow): string {
  if (row.category === 'SafetyCar') {
    if (/VIRTUAL/i.test(row.message)) return 'Virtual safety car';
    if (/RED/i.test(row.message)) return 'Red flag';
    return 'Safety car';
  }
  if (row.category === 'SessionStatus') return 'Session status';
  if (row.category === 'Flag') {
    if (row.flag === 'RED') return 'Red flag';
    if (row.flag === 'CHEQUERED') return 'Chequered flag';
    if (row.flag === 'GREEN') return 'Green flag';
    if (row.flag === 'YELLOW' || row.flag === 'DOUBLE YELLOW') return 'Yellow flag';
    return 'Flag';
  }
  if (row.category === 'Drs') return 'DRS';
  return 'Race control';
}

function driversMentionedInMessage(message: string, driverByNumber: Map<number, Driver>): number[] {
  const numbers = new Set<number>();
  const matches = message.matchAll(/\bCAR(?:S)?\s+(\d+)\b/gi);
  for (const match of matches) {
    const number = Number(match[1]);
    if (driverByNumber.has(number)) numbers.add(number);
  }
  return [...numbers];
}

/* ------------------------------------------------------------------ */
/* Chart                                                              */
/* ------------------------------------------------------------------ */

function buildChart(input: {
  data: RaceData;
  race: RaceSummary;
  position: PositionLookup;
  lapIndex: LapIndex;
  abortedStart: boolean;
  leadChanges: LeadChangeRecord[];
  raceControl: RaceControlRecord[];
  driverName: (number: number | null | undefined) => string;
  driverAcronym: (number: number | null | undefined) => string;
  driverTeam: (number: number | null | undefined) => string;
  driverColour: (number: number | null | undefined) => string;
  finish: FinishTableRow[];
}): ChartData {
  const {
    data,
    position,
    lapIndex,
    abortedStart,
    leadChanges,
    raceControl,
    driverName,
    driverAcronym,
    driverTeam,
    driverColour,
    finish,
  } = input;

  const finishByDriver = new Map(finish.map((row) => [row.driverNumber, row]));
  const lastLapByDriver = new Map<number, number>();
  for (const lap of data.laps) {
    const current = lastLapByDriver.get(lap.driver_number) ?? 0;
    if (lap.lap_number > current) lastLapByDriver.set(lap.driver_number, lap.lap_number);
  }

  const series: ChartSeries[] = data.drivers.map((driver) => {
    const finishRow = finishByDriver.get(driver.driver_number);
    const points = [];
    for (let lap = 1; lap <= lapIndex.maxLap; lap++) {
      const lastLap = lastLapByDriver.get(driver.driver_number) ?? lapIndex.maxLap;
      if (lap > lastLap) {
        points.push({ lap, position: null });
        continue;
      }
      const start = lapIndex.lapStart(lap);
      if (start == null) {
        points.push({ lap, position: null });
        continue;
      }
      // On a red-flagged first start, the restart order is the useful lap-1 snapshot.
      const snapshotTime = abortedStart && lap === 1 ? addMs(start, 25_000) : start;
      const sample = position.lastAtOrBefore(driver.driver_number, snapshotTime);
      points.push({ lap, position: sample?.position ?? null });
    }
    return {
      driverNumber: driver.driver_number,
      name: driverName(driver.driver_number),
      acronym: driverAcronym(driver.driver_number),
      team: driverTeam(driver.driver_number),
      colour: driverColour(driver.driver_number),
      finishPosition: finishRow?.position ?? null,
      status: finishRow?.status ?? 'DNF',
      points,
    };
  });

  const markers: ChartMarker[] = [];
  for (const change of leadChanges) {
    markers.push({
      lap: change.lap,
      kind: 'lead_change',
      label: `Lead: ${change.newDriver}`,
      factId: change.fact.id,
    });
  }
  for (const record of raceControl) {
    if (!record.included) continue;
    if (record.row.category === 'SafetyCar' && /DEPLOY|IN THIS LAP/i.test(record.row.message) && !/ENDING/i.test(record.row.message)) {
      markers.push({
        lap: record.lap ?? 1,
        kind: 'safety_car',
        label: /VIRTUAL/i.test(record.row.message) ? 'Virtual safety car' : 'Safety car',
        factId: record.fact.id,
      });
    }
    if (record.row.category === 'Flag' && record.row.flag === 'RED') {
      markers.push({
        lap: record.lap ?? 1,
        kind: 'red_flag',
        label: 'Red flag',
        factId: record.fact.id,
      });
    }
  }
  const uniqueMarkers = [...new Map(markers.map((marker) => [`${marker.kind}|${marker.lap}|${marker.label}`, marker])).values()].sort(
    (a, b) => a.lap - b.lap,
  );

  return {
    maxLap: lapIndex.maxLap,
    driverCount: data.drivers.length,
    series,
    markers: uniqueMarkers,
    notes: [
      'Position at the start of each recorded lap.',
      abortedStart
        ? 'The first start was aborted; lap 1 uses the restart snapshot.'
        : 'Gaps in a line indicate a driver who did not complete that lap.',
    ],
  };
}
