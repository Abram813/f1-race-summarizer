import type { RaceData, RaceReportPackage } from '../shared/types';
import { buildEvidence } from '../server/evidence';
import { buildReport } from '../server/report';

/**
 * A deliberately small race used to pin down the pit-cycle rule:
 *
 * - Bob starts on pole and leads.
 * - Alice passes Bob for the lead on lap 5 according to /overtakes.
 * - Bob pits 10 seconds later.
 *
 * OpenF1's /overtakes feed reports the position change, but the pit visit means
 * the app must describe a pit-cycle gain, never an on-track overtake.
 */
export function syntheticPitCycleRace(): RaceData {
  const sessionStart = '2024-01-01T12:05:00.000Z';
  const lapStart = (lap: number) =>
    new Date(Date.parse(sessionStart) + (lap - 1) * 90_000).toISOString();

  const laps = Array.from({ length: 10 }, (_, index) => ({
    lap_number: index + 1,
    driver_number: 1,
    date_start: lapStart(index + 1),
    lap_duration: 90,
    is_pit_out_lap: false,
  }));

  return {
    id: 'synthetic-pit-cycle',
    name: '2024 Synthetic Pit Cycle Grand Prix',
    shortName: 'Synthetic GP',
    notes: 'Synthetic test fixture for pit-cycle classification.',
    session: {
      session_key: 1,
      meeting_key: 1,
      session_name: 'Race',
      session_type: 'Race',
      date_start: '2024-01-01T12:05:00.000Z',
      date_end: '2024-01-01T12:20:00.000Z',
      circuit_short_name: 'Test Circuit',
      country_name: 'Testland',
      year: 2024,
    },
    meeting: {
      meeting_key: 1,
      meeting_name: 'Synthetic Grand Prix',
      meeting_official_name: 'Synthetic Grand Prix',
    },
    drivers: [
      {
        driver_number: 1,
        full_name: 'Alice ANDERSON',
        broadcast_name: 'A ANDERSON',
        name_acronym: 'ALI',
        team_name: 'Alpha Azul',
        team_colour: '00AAFF',
      },
      {
        driver_number: 2,
        full_name: 'Bob BAKER',
        broadcast_name: 'B BAKER',
        name_acronym: 'BOB',
        team_name: 'Beta Red',
        team_colour: 'FF2200',
      },
      {
        driver_number: 3,
        full_name: 'Cara CLARKE',
        broadcast_name: 'C CLARKE',
        name_acronym: 'CAR',
        team_name: 'Gamma Green',
        team_colour: '00CC66',
      },
    ],
    session_result: [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 10,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 900,
        gap_to_leader: 0,
      },
      {
        position: 2,
        driver_number: 2,
        number_of_laps: 10,
        points: 18,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 912.5,
        gap_to_leader: 12.5,
      },
      {
        position: 3,
        driver_number: 3,
        number_of_laps: 10,
        points: 15,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 930,
        gap_to_leader: 30,
      },
    ],
    position: [
      { date: '2024-01-01T12:00:00.000Z', driver_number: 1, position: 2 },
      { date: '2024-01-01T12:00:00.000Z', driver_number: 2, position: 1 },
      { date: '2024-01-01T12:00:00.000Z', driver_number: 3, position: 3 },
      { date: '2024-01-01T12:11:20.000Z', driver_number: 1, position: 2 },
      { date: '2024-01-01T12:11:20.000Z', driver_number: 2, position: 1 },
      { date: '2024-01-01T12:11:20.000Z', driver_number: 3, position: 3 },
      { date: '2024-01-01T12:11:30.000Z', driver_number: 1, position: 1 },
      { date: '2024-01-01T12:11:30.000Z', driver_number: 2, position: 2 },
      { date: '2024-01-01T12:11:30.000Z', driver_number: 3, position: 3 },
      { date: '2024-01-01T12:12:00.000Z', driver_number: 1, position: 1 },
      { date: '2024-01-01T12:12:00.000Z', driver_number: 2, position: 2 },
      { date: '2024-01-01T12:12:00.000Z', driver_number: 3, position: 3 },
      { date: '2024-01-01T12:18:30.000Z', driver_number: 1, position: 1 },
      { date: '2024-01-01T12:18:30.000Z', driver_number: 2, position: 2 },
      { date: '2024-01-01T12:18:30.000Z', driver_number: 3, position: 3 },
    ],
    laps,
    pit: [
      {
        date: '2024-01-01T12:11:40.000Z',
        driver_number: 2,
        lap_number: 5,
        pit_duration: 20,
        stop_duration: 2.5,
        lane_duration: 20,
      },
    ],
    stints: [
      { stint_number: 1, driver_number: 1, lap_start: 1, lap_end: 5, compound: 'MEDIUM', tyre_age_at_start: 0 },
      { stint_number: 2, driver_number: 1, lap_start: 6, lap_end: 10, compound: 'HARD', tyre_age_at_start: 0 },
      { stint_number: 1, driver_number: 2, lap_start: 1, lap_end: 5, compound: 'SOFT', tyre_age_at_start: 0 },
      { stint_number: 2, driver_number: 2, lap_start: 6, lap_end: 10, compound: 'HARD', tyre_age_at_start: 0 },
      { stint_number: 1, driver_number: 3, lap_start: 1, lap_end: 10, compound: 'MEDIUM', tyre_age_at_start: 0 },
    ],
    race_control: [
      {
        date: '2024-01-01T12:05:00.000Z',
        lap_number: 1,
        driver_number: null,
        category: 'Flag',
        flag: 'GREEN',
        scope: 'Track',
        sector: null,
        message: 'GREEN LIGHT - PIT EXIT OPEN',
      },
    ],
    overtakes: [
      {
        date: '2024-01-01T12:11:30.000Z',
        overtaking_driver_number: 1,
        overtaken_driver_number: 2,
        position: 1,
      },
    ],
  };
}

export function syntheticPitCyclePackage(): RaceReportPackage {
  const evidence = buildEvidence(syntheticPitCycleRace());
  const report = buildReport(evidence);
  return {
    race: evidence.race,
    facts: evidence.facts,
    report: report.sections,
    markdown: report.markdown,
    chart: evidence.chart,
    tables: evidence.tables,
    meta: {
      generatedAt: new Date('2024-01-01T12:30:00.000Z').toISOString(),
      dataFetchedAt: null,
      methodology: ['Synthetic fixture.'],
      sources: evidence.sources,
      factCount: evidence.facts.length,
      includedFactCount: evidence.facts.filter((fact) => fact.includedInReport).length,
      aiUsed: false,
    },
  };
}
