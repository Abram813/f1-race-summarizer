import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RaceCatalog, RaceCatalogEntry, RaceData, RaceReportPackage } from '../shared/types';
import { buildEvidence } from './evidence';
import { buildReport } from './report';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA_DIR = join(ROOT, 'data');
const CATALOG_PATH = join(DATA_DIR, 'catalog.json');

let catalogCache: RaceCatalog | null = null;
const packageCache = new Map<string, RaceReportPackage>();

export function getCatalog(): RaceCatalog {
  if (catalogCache) return catalogCache;
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as RaceCatalog;
  catalogCache = {
    races: catalog.races
      .filter((race) => existsSync(join(DATA_DIR, race.file)))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
  return catalogCache;
}

export function listRaces(): RaceCatalogEntry[] {
  return getCatalog().races;
}

export function findRace(id: string): RaceCatalogEntry | null {
  return getCatalog().races.find((race) => race.id === id) ?? null;
}

export function loadRaceData(id: string): RaceData {
  const entry = findRace(id);
  if (!entry) throw new Error(`Unknown race: ${id}`);
  const path = join(DATA_DIR, entry.file);
  return JSON.parse(readFileSync(path, 'utf8')) as RaceData;
}

export function getRaceReport(id: string): RaceReportPackage {
  const cached = packageCache.get(id);
  if (cached) return cached;
  const data = loadRaceData(id);
  const evidence = buildEvidence(data);
  const report = buildReport(evidence);
  const included = evidence.facts.filter((fact) => fact.includedInReport).length;
  const pkg: RaceReportPackage = {
    race: evidence.race,
    facts: evidence.facts,
    report: report.sections,
    markdown: report.markdown,
    chart: evidence.chart,
    tables: evidence.tables,
    meta: {
      generatedAt: new Date().toISOString(),
      dataFetchedAt: data.fetchedAt ?? null,
      methodology: [
        'Facts are generated before the report; every sentence cites fact IDs.',
        'Starting positions use the first /position timing snapshot because /starting_grid returned no records for the bundled sessions.',
        'A position change within 60 seconds of a pit visit is reported as a pit-cycle change, not an overtake.',
        'Only overtake rows outside every pit window and corroborated by position timing are described as on-track overtakes.',
        'Pit-lane visits over 300 seconds and stint rows whose lap_end precedes lap_start are excluded from race totals and remain auditable in the evidence CSV.',
        'No AI model is used for the deterministic report. Local AI narration is optional and uses the same evidence.',
      ],
      sources: evidence.sources,
      factCount: evidence.facts.length,
      includedFactCount: included,
      aiUsed: false,
    },
  };
  packageCache.set(id, pkg);
  return pkg;
}

export function clearPackageCache(): void {
  packageCache.clear();
}
