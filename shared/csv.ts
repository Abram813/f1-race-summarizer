import type { EvidenceFact } from './types';

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function factsToCsv(facts: EvidenceFact[]): string {
  const header = [
    'id',
    'event',
    'category',
    'driver',
    'driver_number',
    'lap',
    'lap_end',
    'source',
    'source_url',
    'value',
    'detail',
    'confidence',
    'included_in_report',
    'significance',
  ];
  const rows = facts.map((fact) => [
    fact.id,
    fact.event,
    fact.category,
    fact.driver,
    fact.driverNumber,
    fact.lap,
    fact.lapEnd,
    fact.source,
    fact.sourceUrl,
    fact.value,
    fact.detail,
    fact.confidence,
    fact.includedInReport,
    fact.significance,
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function downloadText(filename: string, content: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
