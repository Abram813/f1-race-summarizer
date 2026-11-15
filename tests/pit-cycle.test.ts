import { describe, expect, it } from 'vitest';
import { buildEvidence } from '../server/evidence';
import { buildReport } from '../server/report';
import { syntheticPitCycleRace } from './helpers';

function allStatements(sections: ReturnType<typeof buildReport>['sections']) {
  return sections.flatMap((section) => section.blocks.flatMap((block) => block.statements));
}

describe('pit-cycle classification', () => {
  const data = syntheticPitCycleRace();
  const bundle = buildEvidence(data);
  const report = buildReport(bundle);

  it('classifies a position gain next to a pit visit as a pit cycle', () => {
    expect(bundle.onTrackOvertakes).toHaveLength(0);
    expect(bundle.tables.overtakes).toHaveLength(0);
    expect(bundle.tables.pitCycles).toHaveLength(1);

    const cycle = bundle.tables.pitCycles[0];
    expect(cycle.driver).toBe('Alice ANDERSON');
    expect(cycle.pittedDriver).toBe('Bob BAKER');
    expect(cycle.fromPosition).toBe(2);
    expect(cycle.toPosition).toBe(1);
    expect(cycle.pitLap).toBe(5);
    expect(cycle.lap).toBe(5);
    expect(cycle.pitFactId).toMatch(/^F\d{4}$/);
  });

  it('reports the pit visit and the position change together', () => {
    const text = allStatements(report.sections)
      .map((statement) => statement.text)
      .join('\n');

    expect(text).toContain('Alice ANDERSON moved from P2 to P1');
    expect(text).toContain("Bob BAKER's pit visit is recorded on lap 5");
    expect(text).toContain('P2 to P1');
    expect(text).not.toMatch(/Alice ANDERSON[^.]*\bovertook\b/i);
    expect(text).not.toMatch(/\bovertook\b[^.]*Bob BAKER/i);
  });

  it('never claims the pit-cycle gain as an on-track pass', () => {
    const overtakeSection = report.sections.find((section) => section.id === 'overtakes');
    expect(overtakeSection).toBeDefined();
    const text = overtakeSection!.blocks
      .flatMap((block) => block.statements)
      .map((statement) => statement.text)
      .join(' ');

    expect(text).toContain('No on-track overtake met the evidence threshold');
    expect(text).not.toContain('Alice ANDERSON overtook');
  });

  it('cites an existing evidence row on every report statement', () => {
    const factsById = new Map(bundle.facts.map((fact) => [fact.id, fact]));
    for (const statement of allStatements(report.sections)) {
      expect(statement.citations.length).toBeGreaterThan(0);
      for (const citation of statement.citations) {
        expect(factsById.has(citation)).toBe(true);
      }
    }
  });

  it('keeps the pit-cycle evidence in the Markdown export', () => {
    expect(report.markdown).toContain('Pit-cycle position change');
    expect(report.markdown).toContain('Alice ANDERSON moved from P2 to P1');
    expect(report.markdown).toContain('Bob BAKER');
    expect(report.markdown).not.toMatch(/Alice ANDERSON[^.\n]*\bovertook\b/i);
  });
});
