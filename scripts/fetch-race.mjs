#!/usr/bin/env node
/**
 * Fetch a race session from OpenF1 and write a compact, deterministic fixture
 * into data/races/. Usage:
 *
 *   npm run fetch:race -- --session 9558 --id 2024-british-gp --short "British GP"
 *
 * The app ships with fixtures so it works offline. This script documents exactly
 * which OpenF1 endpoints back each fact and lets you add another race.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.openf1.org/v1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const sessionKey = Number(arg('session'));
if (!Number.isFinite(sessionKey)) {
  console.error('Missing --session <openf1 session_key>');
  process.exit(1);
}

const id = arg('id');
if (!id) {
  console.error('Missing --id <slug, e.g. 2024-british-gp>');
  process.exit(1);
}

const shortName = arg('short', '');
const notes = arg('notes', '');

async function fetchJson(endpoint, params) {
  const url = new URL(`${API}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'f1-race-summarizer/1.0 (local evidence fixture)' },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = await response.json();
      if (json && typeof json === 'object' && !Array.isArray(json) && 'detail' in json) {
        return [];
      }
      return Array.isArray(json) ? json : [];
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  throw new Error(`Failed ${endpoint}: ${lastError?.message ?? lastError}`);
}

const [sessions, drivers, results, position, laps, pit, stints, raceControl, overtakes] =
  await Promise.all([
    fetchJson('sessions', { session_key: sessionKey }),
    fetchJson('drivers', { session_key: sessionKey }),
    fetchJson('session_result', { session_key: sessionKey }),
    fetchJson('position', { session_key: sessionKey }),
    fetchJson('laps', { session_key: sessionKey }),
    fetchJson('pit', { session_key: sessionKey }),
    fetchJson('stints', { session_key: sessionKey }),
    fetchJson('race_control', { session_key: sessionKey }),
    fetchJson('overtakes', { session_key: sessionKey }),
  ]);

const session = sessions[0];
if (!session) throw new Error(`No session found for session_key=${sessionKey}`);
const meetings = await fetchJson('meetings', { meeting_key: session.meeting_key });
const meeting = meetings[0] ?? {
  meeting_key: session.meeting_key,
  meeting_name: shortName || session.location || session.circuit_short_name,
};

const compactLaps = laps
  .filter((row) => Number.isFinite(row.lap_number) && Number.isFinite(row.driver_number))
  .map((row) => ({
    lap_number: row.lap_number,
    driver_number: row.driver_number,
    date_start: row.date_start ?? null,
    lap_duration: row.lap_duration ?? null,
    is_pit_out_lap: Boolean(row.is_pit_out_lap),
  }))
  .sort((a, b) => String(a.date_start ?? '').localeCompare(String(b.date_start ?? '')) || a.driver_number - b.driver_number);

const fixture = {
  id,
  name: `${session.year} ${meeting.meeting_name}`,
  shortName: shortName || meeting.meeting_name,
  source: 'OpenF1 API (https://openf1.org)',
  fetchedAt: new Date().toISOString(),
  session,
  meeting,
  drivers: drivers
    .map((driver) => ({
      driver_number: driver.driver_number,
      full_name: driver.full_name,
      broadcast_name: driver.broadcast_name,
      name_acronym: driver.name_acronym,
      team_name: driver.team_name,
      team_colour: driver.team_colour,
      first_name: driver.first_name,
      last_name: driver.last_name,
    }))
    .sort((a, b) => a.driver_number - b.driver_number),
  session_result: results
    .map((row) => ({
      position: row.position ?? null,
      driver_number: row.driver_number,
      number_of_laps: row.number_of_laps,
      points: row.points,
      dnf: Boolean(row.dnf),
      dns: Boolean(row.dns),
      dsq: Boolean(row.dsq),
      duration: row.duration ?? null,
      gap_to_leader: row.gap_to_leader ?? null,
    }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.driver_number - b.driver_number),
  position: position
    .map((row) => ({
      date: row.date,
      driver_number: row.driver_number,
      position: row.position,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.driver_number - b.driver_number),
  laps: compactLaps,
  pit: pit
    .map((row) => ({
      date: row.date,
      driver_number: row.driver_number,
      lap_number: row.lap_number,
      pit_duration: row.pit_duration ?? null,
      stop_duration: row.stop_duration ?? null,
      lane_duration: row.lane_duration ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  stints: stints
    .map((row) => ({
      stint_number: row.stint_number,
      driver_number: row.driver_number,
      lap_start: row.lap_start,
      lap_end: row.lap_end,
      compound: row.compound ?? 'UNKNOWN',
      tyre_age_at_start: row.tyre_age_at_start ?? 0,
    }))
    .sort((a, b) => a.driver_number - b.driver_number || a.lap_start - b.lap_start),
  race_control: raceControl
    .map((row) => ({
      date: row.date,
      lap_number: row.lap_number ?? null,
      driver_number: row.driver_number ?? null,
      category: row.category ?? 'Other',
      flag: row.flag ?? null,
      scope: row.scope ?? null,
      sector: row.sector ?? null,
      message: row.message ?? '',
    }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  overtakes: overtakes
    .map((row) => ({
      date: row.date,
      overtaking_driver_number: row.overtaking_driver_number,
      overtaken_driver_number: row.overtaken_driver_number,
      position: row.position,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  notes,
};

const outPath = resolve(ROOT, 'data', 'races', `${id}.json`);
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(fixture, null, 2)}\n`);

const catalogPath = resolve(ROOT, 'data', 'catalog.json');
let catalog = { races: [] };
try {
  catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
} catch {
  // first race
}
const entry = {
  id,
  name: fixture.name,
  shortName: fixture.shortName,
  year: session.year,
  circuit: session.circuit_short_name,
  country: session.country_name,
  date: session.date_start.slice(0, 10),
  sessionKey,
  meetingKey: session.meeting_key,
  notes,
  file: `races/${id}.json`,
};
catalog.races = [...catalog.races.filter((race) => race.id !== id), entry].sort((a, b) =>
  `${b.date}`.localeCompare(`${a.date}`),
);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
console.log(
  `Records: drivers ${fixture.drivers.length}, results ${fixture.session_result.length}, position ${fixture.position.length}, laps ${fixture.laps.length}, pit ${fixture.pit.length}, stints ${fixture.stints.length}, race control ${fixture.race_control.length}, overtakes ${fixture.overtakes.length}`,
);
