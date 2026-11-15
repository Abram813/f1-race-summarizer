import type {
  NarrationResponse,
  RaceCatalogEntry,
  RaceReportPackage,
} from '../shared/types';

type RacesResponse = { races: RaceCatalogEntry[] };

export type AppConfig = {
  ai: { endpoint: string; model: string };
  localOnly: boolean;
  note: string;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Keep the HTTP status text when the body is not JSON.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function fetchRaces(): Promise<RacesResponse> {
  return request<RacesResponse>('/api/races');
}

export function fetchRace(id: string): Promise<RaceReportPackage> {
  return request<RaceReportPackage>(`/api/races/${encodeURIComponent(id)}`);
}

export function fetchConfig(): Promise<AppConfig> {
  return request<AppConfig>('/api/config');
}

export function requestNarration(input: {
  raceId: string;
  endpoint?: string;
  model?: string;
}): Promise<NarrationResponse> {
  return request<NarrationResponse>('/api/narrate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
