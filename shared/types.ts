/* Shared types used by the evidence pipeline, the API and the React client. */

export type RaceSession = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  circuit_short_name: string;
  country_name: string;
  country_code?: string;
  location?: string;
  gmt_offset?: string;
  year: number;
};

export type RaceMeeting = {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  location?: string;
  country_name?: string;
  date_start?: string;
};

export type Driver = {
  driver_number: number;
  full_name: string;
  broadcast_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  first_name?: string;
  last_name?: string;
};

export type SessionResultRow = {
  position: number | null;
  driver_number: number;
  number_of_laps: number;
  points: number;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  duration: number | null;
  gap_to_leader: number | string | null;
};

export type PositionSample = {
  date: string;
  driver_number: number;
  position: number;
};

export type LapRow = {
  lap_number: number;
  driver_number: number;
  date_start: string | null;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
};

export type PitRow = {
  date: string;
  driver_number: number;
  lap_number: number;
  pit_duration: number | null;
  stop_duration?: number | null;
  lane_duration?: number | null;
};

export type StintRow = {
  stint_number: number;
  driver_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
};

export type RaceControlRow = {
  date: string;
  lap_number: number | null;
  driver_number: number | null;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  message: string;
};

export type OvertakeRow = {
  date: string;
  overtaking_driver_number: number;
  overtaken_driver_number: number;
  position: number;
};

export type RaceData = {
  id: string;
  name: string;
  shortName: string;
  source?: string;
  fetchedAt?: string;
  notes?: string;
  session: RaceSession;
  meeting: RaceMeeting;
  drivers: Driver[];
  session_result: SessionResultRow[];
  position: PositionSample[];
  laps: LapRow[];
  pit: PitRow[];
  stints: StintRow[];
  race_control: RaceControlRow[];
  overtakes: OvertakeRow[];
};

export type RaceSummary = {
  id: string;
  name: string;
  shortName: string;
  year: number;
  meetingName: string;
  officialName?: string;
  circuit: string;
  country: string;
  date: string;
  sessionKey: number;
  meetingKey: number;
  notes?: string;
  laps: number;
};

export type FactCategory =
  | 'session'
  | 'start'
  | 'finish'
  | 'lead_change'
  | 'laps_led'
  | 'pit'
  | 'stint'
  | 'overtake'
  | 'pit_cycle'
  | 'overtake_record'
  | 'race_control'
  | 'summary';

export type FactConfidence = 'recorded' | 'derived' | 'inferred';

export type EvidenceFact = {
  id: string;
  category: FactCategory;
  event: string;
  driver: string | null;
  driverNumber: number | null;
  lap: number | null;
  lapEnd: number | null;
  source: string;
  sourceUrl?: string | null;
  value: string;
  detail?: string | null;
  confidence: FactConfidence;
  includedInReport: boolean;
  significance?: 'critical' | 'notable' | 'low' | null;
};

export type Statement = {
  text: string;
  citations: string[];
};

export type ReportBlock =
  | { type: 'paragraph'; statements: Statement[] }
  | { type: 'bullets'; statements: Statement[] };

export type ReportSection = {
  id: string;
  title: string;
  blocks: ReportBlock[];
  table?: 'finish' | 'stints' | 'overtakes' | 'pitCycles' | 'raceControl';
};

export type ChartPoint = {
  lap: number;
  position: number | null;
};

export type ChartSeries = {
  driverNumber: number;
  name: string;
  acronym: string;
  team: string;
  colour: string;
  finishPosition: number | null;
  status: string;
  points: ChartPoint[];
};

export type ChartMarker = {
  lap: number;
  kind: 'safety_car' | 'red_flag' | 'lead_change' | 'session';
  label: string;
  factId?: string | null;
};

export type ChartData = {
  maxLap: number;
  driverCount: number;
  series: ChartSeries[];
  markers: ChartMarker[];
  notes: string[];
};

export type FinishTableRow = {
  position: number | null;
  driverNumber: number;
  name: string;
  acronym: string;
  team: string;
  colour: string;
  startPosition: number | null;
  placesGained: number | null;
  status: 'classified' | 'DNF' | 'DNS' | 'DSQ';
  laps: number;
  gap: string;
  points: number;
  factId: string;
};

export type OvertakeTableRow = {
  factId: string;
  lap: number;
  position: number;
  driverNumber: number;
  driver: string;
  overtakenDriverNumber: number;
  overtakenDriver: string;
  fromPosition: number | null;
  toPosition: number | null;
  date: string;
};

export type PitCycleTableRow = {
  factId: string;
  lap: number;
  driverNumber: number;
  driver: string;
  fromPosition: number | null;
  toPosition: number | null;
  pittedDriverNumber: number;
  pittedDriver: string;
  pitLap: number;
  pitDuration: number | null;
  pitIsRaceStop: boolean;
  pitFactId: string;
};

export type ExcludedOvertakeRow = {
  factId: string;
  lap: number;
  driver: string;
  overtakenDriver: string;
  claimedPosition: number;
  reason: 'pit_window' | 'pre_start' | 'unverified';
  detail: string;
};

export type StintTableRow = {
  factId: string;
  stintNumber: number;
  compound: string;
  lapStart: number;
  lapEnd: number;
  tyreAgeAtStart: number;
};

export type StintTableDriver = {
  driverNumber: number;
  name: string;
  acronym: string;
  team: string;
  colour: string;
  stints: StintTableRow[];
};

export type RaceControlTableRow = {
  factId: string;
  lap: number | null;
  date: string;
  category: string;
  flag: string | null;
  driver: string | null;
  message: string;
  significance: 'critical' | 'notable' | 'low';
  includedInReport: boolean;
};

export type DataSourceInfo = {
  endpoint: string;
  label: string;
  records: number;
  available: boolean;
  note: string;
};

export type RaceTables = {
  finish: FinishTableRow[];
  overtakes: OvertakeTableRow[];
  pitCycles: PitCycleTableRow[];
  excludedOvertakes: ExcludedOvertakeRow[];
  stints: StintTableDriver[];
  raceControl: RaceControlTableRow[];
};

export type ReportMeta = {
  generatedAt: string;
  dataFetchedAt?: string | null;
  methodology: string[];
  sources: DataSourceInfo[];
  factCount: number;
  includedFactCount: number;
  aiUsed: boolean;
};

export type RaceReportPackage = {
  race: RaceSummary;
  facts: EvidenceFact[];
  report: ReportSection[];
  markdown: string;
  chart: ChartData;
  tables: RaceTables;
  meta: ReportMeta;
};

export type RaceCatalogEntry = {
  id: string;
  name: string;
  shortName: string;
  year: number;
  circuit: string;
  country: string;
  date: string;
  sessionKey: number;
  meetingKey: number;
  notes?: string;
  file: string;
};

export type RaceCatalog = {
  races: RaceCatalogEntry[];
};

export type NarrationRequest = {
  raceId: string;
  endpoint?: string;
  model?: string;
};

export type NarrationResponse = {
  text: string;
  model: string;
  endpoint: string;
  warnings: string[];
  citedFactIds: string[];
};
