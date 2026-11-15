import { describe, expect, it } from 'vitest';
import { factsToCsv } from '../shared/csv';
import type { EvidenceFact } from '../shared/types';
import { syntheticPitCyclePackage } from './helpers';

function customFact(overrides: Partial<EvidenceFact>): EvidenceFact {
  const base = syntheticPitCyclePackage().facts[0];
  return { ...base, ...overrides };
}

describe('evidence CSV export', () => {
  it('writes the documented header and one row per fact', () => {
    const facts = syntheticPitCyclePackage().facts;
    const csv = factsToCsv(facts);
    const rows = csv.trimEnd().split('\r\n');
    expect(rows[0]).toBe(
      'id,event,category,driver,driver_number,lap,lap_end,source,source_url,value,detail,confidence,included_in_report,significance',
    );
    expect(rows).toHaveLength(facts.length + 1);
  });

  it('quotes commas, quotes and line breaks', () => {
    const csv = factsToCsv([
      customFact({
        id: 'F9999',
        event: 'Edge, case',
        value: 'He said "hello"',
        detail: 'line one\nline two',
        sourceUrl: null,
        significance: null,
      }),
    ]);
    expect(csv).toContain('"Edge, case"');
    expect(csv).toContain('"He said ""hello"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it('exports excluded facts with included_in_report=false', () => {
    const fact = customFact({ id: 'F9998', includedInReport: false });
    const csv = factsToCsv([fact]);
    expect(csv).toContain('F9998');
    expect(csv).toContain(',false,');
  });
});
