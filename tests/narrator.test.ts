import { describe, expect, it } from 'vitest';
import { buildNarrationPrompt, narrateRace, validateNarration } from '../server/narrator';
import type { EvidenceFact } from '../shared/types';
import { syntheticPitCyclePackage } from './helpers';

const pkg = syntheticPitCyclePackage();
const firstFact = pkg.facts[0];

function factWith(overrides: Partial<EvidenceFact>): EvidenceFact {
  return { ...firstFact, ...overrides };
}

describe('local AI narration guardrails', () => {
  it('accepts citations that exist in the evidence table', () => {
    const result = validateNarration('The race produced a clear winner. [F0001]', pkg.facts);
    expect(result.warnings).toHaveLength(0);
    expect(result.citedFactIds).toEqual(['F0001']);
    expect(result.text).toContain('[F0001]');
  });

  it('removes citations that do not exist and reports them', () => {
    const result = validateNarration('The race produced a winner. [F0001] [F9999]', pkg.facts);
    expect(result.text).not.toContain('F9999');
    expect(result.citedFactIds).toEqual(['F0001']);
    expect(result.warnings.join(' ')).toContain('F9999');
  });

  it('warns when overtake language has no on-track overtake citation', () => {
    const result = validateNarration('Alice overtook Bob for the lead. [F0001]', pkg.facts);
    expect(result.warnings.join(' ')).toContain('Overtake language without an on-track overtake citation');
  });

  it('allows overtake language when the cited fact is an on-track overtake', () => {
    const facts = [factWith({ id: 'F0001', category: 'overtake', event: 'On-track overtake' })];
    const result = validateNarration('Alice overtook Bob for the lead. [F0001]', facts);
    expect(result.warnings).toHaveLength(0);
  });

  it('builds a prompt from the deterministic draft and fact index', () => {
    const prompt = buildNarrationPrompt(pkg);
    expect(prompt).toContain('DETERMINISTIC DRAFT');
    expect(prompt).toContain('AUTHORITATIVE FACT INDEX');
    expect(prompt).toContain('Never invent an overtake');
    expect(prompt).toContain(pkg.race.name);
    expect(prompt).toMatch(/F\d{4}/);
  });

  it('refuses a non-loopback endpoint before making a request', async () => {
    await expect(
      narrateRace(pkg, { endpoint: 'http://example.com:11434', model: 'test' }),
    ).rejects.toThrow(/must point at this machine/);
  });

  it('refuses non-http endpoints', async () => {
    await expect(narrateRace(pkg, { endpoint: 'file:///tmp/model', model: 'test' })).rejects.toThrow(
      /http:\/\/ or https:\/\//,
    );
  });
});
