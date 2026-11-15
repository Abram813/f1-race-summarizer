import { describe, expect, it } from 'vitest';
import { getRaceReport } from '../server/races';
import { factsToCsv } from '../shared/csv';

const RACES = [
  { id: '2024-british-gp', winner: 'Lewis HAMILTON' },
  { id: '2024-sao-paulo-gp', winner: 'Max VERSTAPPEN' },
  { id: '2024-monaco-gp', winner: 'Charles LECLERC' },
] as const;

describe('bundled race reports', () => {
  for (const race of RACES) {
    describe(race.id, () => {
      const pkg = getRaceReport(race.id);
      const factsById = new Map(pkg.facts.map((fact) => [fact.id, fact]));

      it('builds a complete deterministic package', () => {
        expect(pkg.race.id).toBe(race.id);
        expect(pkg.tables.finish[0]?.name).toBe(race.winner);
        expect(pkg.facts.length).toBe(pkg.meta.factCount);
        expect(pkg.chart.series).toHaveLength(20);
        expect(pkg.chart.maxLap).toBeGreaterThan(40);
        expect(pkg.markdown).toContain('# ');
        expect(pkg.meta.aiUsed).toBe(false);
      });

      it('uses unique, well-formed fact IDs', () => {
        const ids = pkg.facts.map((fact) => fact.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(id).toMatch(/^F\d{4}$/);
      });

      it('resolves every report citation to an evidence row', () => {
        const statements = pkg.report.flatMap((section) =>
          section.blocks.flatMap((block) => block.statements),
        );
        expect(statements.length).toBeGreaterThan(20);
        for (const statement of statements) {
          expect(statement.citations.length).toBeGreaterThan(0);
          for (const citation of statement.citations) {
            expect(factsById.get(citation)?.id).toBe(citation);
          }
        }
      });

      it('exports every fact to CSV', () => {
        const csv = factsToCsv(pkg.facts);
        const lines = csv.trimEnd().split('\r\n');
        expect(lines[0]).toContain('id,event,category');
        expect(lines).toHaveLength(pkg.facts.length + 1);
        for (const fact of pkg.facts) expect(csv).toContain(fact.id);
      });

      it('keeps pit-cycle facts out of the on-track overtake table', () => {
        const overtakeFacts = new Set(pkg.tables.overtakes.map((row) => row.factId));
        for (const row of pkg.tables.pitCycles) {
          expect(overtakeFacts.has(row.factId)).toBe(false);
          expect(factsById.get(row.factId)?.category).toBe('pit_cycle');
        }
      });
    });
  }

  it('excludes pre-restart Monaco overtake rows from on-track classification', () => {
    const pkg = getRaceReport('2024-monaco-gp');
    const overview = pkg.report.find((section) => section.id === 'overview');
    const overviewText = overview?.blocks
      .flatMap((block) => block.statements)
      .map((statement) => statement.text)
      .join(' ');

    expect(overviewText).toContain('first start was aborted');
    expect(pkg.tables.excludedOvertakes.length).toBeGreaterThan(0);
    expect(pkg.tables.excludedOvertakes.every((row) => row.reason === 'pre_start')).toBe(true);
    expect(pkg.tables.overtakes.every((row) => row.lap >= 1)).toBe(true);
  });

  it('records the official grid as unavailable and documents the fallback', () => {
    const pkg = getRaceReport('2024-british-gp');
    const grid = pkg.meta.sources.find((source) => source.endpoint === '/starting_grid');
    expect(grid).toBeDefined();
    expect(grid?.available).toBe(false);
    expect(grid?.records).toBe(0);
    expect(pkg.meta.methodology.join(' ')).toContain('first /position timing snapshot');
  });

  it('excludes Monaco restart pit visits and invalid stint rows from race totals', () => {
    const pkg = getRaceReport('2024-monaco-gp');
    const pitFacts = pkg.facts.filter((fact) => fact.category === 'pit');
    const stintFacts = pkg.facts.filter((fact) => fact.category === 'stint');
    const text = pkg.report
      .flatMap((section) => section.blocks)
      .flatMap((block) => block.statements)
      .map((statement) => statement.text)
      .join('\n');

    expect(pitFacts.filter((fact) => fact.event === 'Pit visit')).toHaveLength(7);
    expect(pitFacts.filter((fact) => fact.event === 'Pit-lane visit (red flag/restart)')).toHaveLength(16);
    expect(stintFacts.filter((fact) => fact.event === 'Tyre stint')).toHaveLength(27);
    expect(stintFacts.filter((fact) => fact.event === 'Tyre stint excluded')).toHaveLength(16);

    expect(text).toContain('7 race pit visits were recorded.');
    expect(text).toContain('16 pit-lane visits with more than 300 seconds');
    expect(text).toContain('27 tyre stints were recorded.');
    expect(text).toContain('16 stint rows were excluded');
    expect(text).toContain("Charles LECLERC's recorded stints: HARD on laps 1–78");
    expect(text).not.toContain('MEDIUM on laps 1–0');
    expect(text).not.toContain('Fastest pit visit: Charles LECLERC');
  });

  it('reports overtake rows relative to the start cutoff without mixing in pre-start rows', () => {
    const pkg = getRaceReport('2024-monaco-gp');
    const text = pkg.report
      .flatMap((section) => section.blocks)
      .flatMap((block) => block.statements)
      .map((statement) => statement.text)
      .join('\n');

    expect(text).toContain('OpenF1 returned 47 overtake timing rows in total.');
    expect(text).toContain('32 rows occurred before the start cutoff and 15 rows remain for classification.');
    expect(text).toContain('6 remaining rows met the on-track evidence test.');
    expect(text).toContain('9 remaining rows fell within a 60-second pit window');
    expect(text).toContain('3 additional position changes without an /overtakes row');
    expect(pkg.tables.overtakes).toHaveLength(6);
    expect(pkg.tables.pitCycles).toHaveLength(12);
  });

  it('keeps restart pit visits in the pit-cycle context for São Paulo', () => {
    const pkg = getRaceReport('2024-sao-paulo-gp');
    const pitFacts = pkg.facts.filter((fact) => fact.category === 'pit');
    expect(pitFacts.filter((fact) => fact.event === 'Pit visit')).toHaveLength(19);
    expect(pitFacts.filter((fact) => fact.event === 'Pit-lane visit (red flag/restart)')).toHaveLength(16);
    expect(pkg.tables.pitCycles.length).toBeGreaterThan(0);
  });
});
