import type { EvidenceFact, NarrationResponse, RaceReportPackage, ReportSection } from '../shared/types';

const DEFAULT_ENDPOINT = process.env.LOCAL_AI_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.LOCAL_AI_MODEL || 'llama3.2';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

type ChatMessage = { role: 'system' | 'user'; content: string };

export function getLocalAiDefaults(): { endpoint: string; model: string } {
  return { endpoint: DEFAULT_ENDPOINT, model: DEFAULT_MODEL };
}

function renderDraftSections(sections: ReportSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`### ${section.title}`);
    for (const block of section.blocks) {
      if (block.type === 'paragraph') {
        lines.push(
          block.statements
            .map((statement) => {
              const citations = statement.citations.map((citation) => `[${citation}]`).join(' ');
              return citations ? `${statement.text} ${citations}` : statement.text;
            })
            .join(' '),
        );
      } else {
        for (const statement of block.statements) {
          const citations = statement.citations.map((citation) => `[${citation}]`).join(' ');
          lines.push(`- ${statement.text}${citations ? ` ${citations}` : ''}`);
        }
      }
    }
  }
  return lines.join('\n');
}

function citedFactIds(sections: ReportSection[]): string[] {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const statement of block.statements) {
        for (const citation of statement.citations) ids.add(citation);
      }
    }
  }
  return [...ids];
}

function renderFactIndex(facts: EvidenceFact[]): string {
  return facts
    .map(
      (fact) =>
        `${fact.id} | ${fact.category} | ${fact.event} | ${fact.driver ?? '—'} | ${fact.lap == null ? '—' : fact.lapEnd != null && fact.lapEnd !== fact.lap ? `${fact.lap}-${fact.lapEnd}` : fact.lap} | ${fact.value} | ${fact.source}`,
    )
    .join('\n');
}

export function buildNarrationPrompt(pkg: RaceReportPackage): string {
  const factsById = new Map(pkg.facts.map((fact) => [fact.id, fact]));
  const cited = citedFactIds(pkg.report)
    .map((id) => factsById.get(id))
    .filter((fact): fact is EvidenceFact => Boolean(fact));
  const extras = [
    ...pkg.facts.filter((fact) => fact.category === 'summary' || fact.category === 'lead_change'),
  ];
  const factSet = [...new Map([...cited, ...extras].map((fact) => [fact.id, fact])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  return `You are the narrator for an evidence-first Formula 1 race report.

AUTHORITATIVE EVIDENCE
- The deterministic draft below was generated from the fact table. Rewrite it in a natural, analytical race-report voice.
- Every factual sentence must end with one or more citation IDs in square brackets, exactly like [F0012].
- Use ONLY the facts in the draft and fact index. Do not invent drivers, teams, laps, gaps, penalties, strategies or overtakes.
- Never invent an overtake. Use the word "overtook" only when the sentence cites a fact whose category is "overtake" (event "On-track overtake").
- If a driver gained a position while another car was in the pit lane, describe the pit visit and the position change. Do not call it an on-track overtake.
- If the draft says an overtake record was excluded or unverified, preserve that caution.
- Write 5 to 8 short paragraphs of plain prose. No headings, no bullet lists, no markdown tables.
- Do not add a summary of the evidence table or a disclaimer; the app adds those around your text.

RACE
${pkg.race.name} at ${pkg.race.circuit}, ${pkg.race.country} (${pkg.race.date}).

DETERMINISTIC DRAFT
${renderDraftSections(pkg.report)}

AUTHORITATIVE FACT INDEX (the only facts you may use)
${renderFactIndex(factSet)}
`;
}

export function validateNarration(
  text: string,
  facts: EvidenceFact[],
): { text: string; warnings: string[]; citedFactIds: string[] } {
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const warnings: string[] = [];
  const invalid = new Set<string>();
  const cleaned = text.replace(/\[(F\d{4})\]/g, (match, id: string) => {
    if (factsById.has(id)) return match;
    invalid.add(id);
    return '';
  });
  if (invalid.size > 0) {
    warnings.push(
      `Removed ${invalid.size} citation${invalid.size === 1 ? '' : 's'} that did not exist in the evidence table: ${[...invalid].join(', ')}.`,
    );
  }
  const cited = [...new Set([...cleaned.matchAll(/\[(F\d{4})\]/g)].map((match) => match[1]))];
  if (cited.length === 0) {
    warnings.push('The local model returned no valid evidence citations. Treat the narration as unverified.');
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+(?!\[)/);
  const overtakeSentences = sentences.filter((sentence) => /\b(overtook|overtaking|overtaken|passed)\b/i.test(sentence));
  for (const sentence of overtakeSentences) {
    const sentenceCitations = [...sentence.matchAll(/\[(F\d{4})\]/g)].map((match) => match[1]);
    const hasOvertakeEvidence = sentenceCitations.some((id) => factsById.get(id)?.category === 'overtake');
    if (!hasOvertakeEvidence) {
      warnings.push(
        `Overtake language without an on-track overtake citation: “${sentence.trim().slice(0, 180)}”`,
      );
    }
  }

  return { text: cleaned.replace(/[ \t]{2,}/g, ' ').trim(), warnings, citedFactIds: cited };
}

function assertLocalEndpoint(endpoint: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('The local AI endpoint is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('The local AI endpoint must use http:// or https://.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `The local AI endpoint must point at this machine (localhost, 127.0.0.1, ::1 or host.docker.internal). Received: ${host}`,
    );
  }
  return url;
}

function ollamaUrl(base: string): string {
  if (base.endsWith('/api/chat')) return base;
  return `${base}/api/chat`;
}

function openAiUrl(base: string): string {
  if (base.endsWith('/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  if (base.includes('/v1/')) return `${base.replace(/\/+$/, '')}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

async function callOllama(base: string, model: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(ollamaUrl(base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: 0.2, num_ctx: 16384 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama returned HTTP ${response.status}. ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as { message?: { content?: string } };
  return json.message?.content ?? '';
}

async function callOpenAi(base: string, model: string, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(openAiUrl(base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Local OpenAI-compatible server returned HTTP ${response.status}. ${body.slice(0, 300)}`);
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? '';
}

export async function narrateRace(
  pkg: RaceReportPackage,
  options: { endpoint?: string; model?: string } = {},
): Promise<NarrationResponse> {
  const endpoint = (options.endpoint?.trim() || DEFAULT_ENDPOINT).replace(/\/+$/, '');
  const model = options.model?.trim() || DEFAULT_MODEL;
  assertLocalEndpoint(endpoint);

  const prompt = buildNarrationPrompt(pkg);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You write precise Formula 1 race reports. You only use supplied evidence facts, you cite every factual sentence with [Fxxxx], and you never invent an overtake.',
    },
    { role: 'user', content: prompt },
  ];

  const openAiCompatible = /\/v1(?:\/|$)/.test(endpoint) || endpoint.endsWith('/chat/completions');
  let raw = '';
  if (openAiCompatible) {
    raw = await callOpenAi(endpoint, model, messages);
  } else {
    try {
      raw = await callOllama(endpoint, model, messages);
    } catch (error) {
      // A local OpenAI-compatible server may be listening without a /v1 path in the input.
      if (error instanceof Error && /HTTP (404|405)/.test(error.message)) {
        raw = await callOpenAi(endpoint, model, messages);
      } else {
        throw error;
      }
    }
  }

  if (!raw.trim()) {
    throw new Error(
      `The local model returned an empty response. Check that model "${model}" is installed at ${endpoint}.`,
    );
  }
  const validated = validateNarration(raw, pkg.facts);
  return {
    text: validated.text,
    model,
    endpoint,
    warnings: validated.warnings,
    citedFactIds: validated.citedFactIds,
  };
}
