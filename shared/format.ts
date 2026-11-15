export function formatRaceDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date)} UTC`;
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatGap(value: number | string | null | undefined): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value;
  if (value === 0) return 'leader';
  if (Number.isNaN(value)) return '—';
  return `+${value.toFixed(3)}s`;
}

export function formatSeconds(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}s`;
}

export function formatLapRange(start: number | null, end: number | null): string {
  if (start == null) return '—';
  if (end == null || end === start) return `lap ${start}`;
  return `laps ${start}–${end}`;
}

export function ordinal(position: number | null | undefined): string {
  if (position == null) return '—';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const value = position % 100;
  const suffix = suffixes[(value - 20) % 10] ?? suffixes[value] ?? suffixes[0];
  return `P${position}`;
}

export function normaliseColour(colour: string | null | undefined): string {
  if (!colour) return '#8b95a7';
  const trimmed = colour.trim();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function escapeMarkdownCell(value: string | number | null | undefined): string {
  if (value == null) return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
