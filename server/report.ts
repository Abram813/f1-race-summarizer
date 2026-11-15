import type {
  EvidenceFact,
  ExcludedOvertakeRow,
  FinishTableRow,
  OvertakeTableRow,
  PitCycleTableRow,
  RaceControlTableRow,
  ReportBlock,
  ReportSection,
  Statement,
  StintTableDriver,
} from '../shared/types';
import {
  escapeMarkdownCell,
  formatDateTime,
  formatLapRange,
  formatRaceDate,
  formatSeconds,
  pluralise,
} from '../shared/format';
import type { EvidenceBundle } from './evidence';

type ReportBuild = {
  sections: ReportSection[];
  markdown: string;
};

const stmt = (text: string, citations: string[] = []): Statement => ({
  text,
  citations: [...new Set(citations.filter(Boolean))],
});

const paragraph = (statements: Statement[]): ReportBlock => ({ type: 'paragraph', statements });
const bullets = (statements: Statement[]): ReportBlock => ({ type: 'bullets', statements });

function factId(fact: EvidenceFact | undefined | null): string[] {
  return fact ? [fact.id] : [];
}

function ids(facts: Array<EvidenceFact | undefined | null>): string[] {
  return facts.flatMap((fact) => factId(fact));
}

function finishLabel(row: FinishTableRow | undefined): string {
  if (!row) return 'unknown';
  if (row.status !== 'classified') return `${row.name} (${row.status})`;
  return row.position == null ? row.name : `${row.name} (P${row.position})`;
}

function gapToWinnerSentence(winner: FinishTableRow | undefined, second: FinishTableRow | undefined): string {
  if (!winner) return 'The winner could not be resolved from the classification.';
  if (!second) return `${winner.name} won for ${winner.team}.`;
  const gap = second.gap === 'leader' ? 'on the road' : second.gap;
  return `${winner.name} won for ${winner.team}, with ${second.name} second (${gap}).`;
}

function notableOvertakes(rows: OvertakeTableRow[], limit = 12): OvertakeTableRow[] {
  const nonFirstLap = rows.filter((row) => row.lap > 1);
  const pool = nonFirstLap.length > 0 ? nonFirstLap : rows;
  return [...pool]
    .sort((a, b) => a.position - b.position || a.lap - b.lap || a.driver.localeCompare(b.driver))
    .slice(0, limit)
    .sort((a, b) => a.lap - b.lap || a.position - b.position);
}

function notablePitCycles(rows: PitCycleTableRow[], limit = 8): PitCycleTableRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        (a.fromPosition ?? 99) - (b.fromPosition ?? 99) ||
        a.lap - b.lap ||
        a.driver.localeCompare(b.driver),
    )
    .slice(0, limit)
    .sort((a, b) => a.lap - b.lap || (a.fromPosition ?? 99) - (b.fromPosition ?? 99));
}

function lapText(lap: number | null): string {
  return lap == null ? 'Session' : `Lap ${lap}`;
}

function verb(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function dominantWinnerStints(stints: StintTableDriver[] | undefined): StintTableDriver | undefined {
  return stints?.find((driver) => driver.stints.length > 0);
}

/* ------------------------------------------------------------------ */
/* Report sections                                                     */
/* ------------------------------------------------------------------ */

export function buildReport(bundle: EvidenceBundle): ReportBuild {
  const { race, tables, summaryFacts, sessionFacts, leadChanges, lapsLed, pitCycles } = bundle;
  const sessionByEvent = new Map(sessionFacts.map((fact) => [fact.event, fact]));
  const coverage = sessionByEvent.get('Data coverage');
  const startSource = sessionByEvent.get('Starting-position source');
  const abortedStartFact = sessionByEvent.get('Aborted start');
  const raceIdentity = sessionByEvent.get('Race');
  const raceDate = sessionByEvent.get('Race date');
  const raceDistance = sessionByEvent.get('Race distance');

  const winner = tables.finish.find((row) => row.position === 1);
  const second = tables.finish.find((row) => row.position === 2);
  const third = tables.finish.find((row) => row.position === 3);
  const winnerStart = winner?.startPosition ?? null;
  const winnerGain =
    winner?.placesGained != null && winner.placesGained > 0 ? winner.placesGained : null;

  const sections: ReportSection[] = [];

  /* Overview ------------------------------------------------------- */
  const overview: ReportBlock[] = [
    paragraph([
      stmt(`${race.name} took place at ${race.circuit}, ${race.country}, on ${formatRaceDate(race.date)}.`, ids([raceIdentity, raceDate])),
      stmt(`The race distance was ${race.laps} laps.`, factId(raceDistance)),
    ]),
  ];
  if (winner) {
    overview.push(
      paragraph([
        stmt(gapToWinnerSentence(winner, second), ids([bundle.finishFacts.get(winner.driverNumber), second ? bundle.finishFacts.get(second.driverNumber) : null])),
        ...(winnerGain
          ? [
              stmt(
                `${winner.name} gained ${pluralise(winnerGain, 'place')} from the starting snapshot (P${winnerStart} to P${winner.position}).`,
                ids([bundle.startFacts.get(winner.driverNumber), bundle.finishFacts.get(winner.driverNumber)]),
              ),
            ]
          : []),
        ...(third
          ? [stmt(`${third.name} completed the podium in P${third.position}.`, factId(bundle.finishFacts.get(third.driverNumber)))]
          : []),
      ]),
    );
  }
  overview.push(
    paragraph([
      stmt(
        `OpenF1 returned ${bundle.sources
          .filter((source) => source.available)
          .map((source) => `${source.records} ${source.label.toLowerCase()}`)
          .join(', ')} for this session.`,
        factId(coverage),
      ),
      stmt(
        `The evidence table contains ${summaryFacts.evidenceFactCount?.value ?? `${bundle.facts.length} facts`}.`,
        factId(summaryFacts.evidenceFactCount),
      ),
    ]),
  );
  if (bundle.abortedStart && abortedStartFact) {
    const redFlag = bundle.raceControl.find(
      (record) => record.row.category === 'Flag' && record.row.flag === 'RED',
    );
    overview.push(
      paragraph([
        stmt(
          'The first start was aborted before the first counted lap. The restart is the basis for the race narrative; overtake rows before it are excluded from on-track classification.',
          ids([abortedStartFact, redFlag?.fact]),
        ),
      ]),
    );
  }

  sections.push({
    id: 'overview',
    title: 'Race at a glance',
    blocks: overview,
  });

  /* Finishing order ------------------------------------------------ */
  const podium = [winner, second, third].filter(Boolean) as FinishTableRow[];
  const finishingBlocks: ReportBlock[] = [
    paragraph([
      stmt(
        'The final classification below preserves the DNF, DNS and DSQ statuses returned by OpenF1. The “start” column is the first /position timing snapshot, not an official grid feed.',
        ids([coverage, startSource]),
      ),
      ...(podium.length >= 2
        ? [
            stmt(
              `The podium was ${podium.map((row) => `${row.name} (${row.status === 'classified' ? `P${row.position}` : row.status})`).join(', ')}.`,
              ids(podium.map((row) => bundle.finishFacts.get(row.driverNumber))),
            ),
          ]
        : []),
    ]),
  ];
  sections.push({
    id: 'finishing-order',
    title: 'Finishing order',
    blocks: finishingBlocks,
    table: 'finish',
  });

  /* Lead changes --------------------------------------------------- */
  const leadBlocks: ReportBlock[] = [];
  leadBlocks.push(
    paragraph([
      stmt(
        `P1 changed ${pluralise(leadChanges.length, 'time')} after the race-start cutoff.`,
        factId(summaryFacts.leadChangeCount),
      ),
      ...(leadChanges.length === 0
        ? [stmt('No P1 change was recorded after the cutoff.', factId(summaryFacts.leadChangeCount))]
        : []),
    ]),
  );
  if (leadChanges.length > 0) {
    const items: Statement[] = [];
    for (const change of leadChanges) {
      items.push(
        stmt(
          `Lap ${change.lap}: ${change.newDriver} took the lead from ${change.oldDriver}.`,
          factId(change.fact),
        ),
      );
      if (change.pitVisits.length > 0) {
        const pit = change.pitVisits[0];
        const pitDriver = bundle.tables.finish.find((row) => row.driverNumber === pit.row.driver_number);
        items.push(
          stmt(
            `This is a pit-cycle lead change: ${pitDriver?.name ?? `car #${pit.row.driver_number}`} has a pit visit on lap ${pit.lap}. It is not described as an on-track pass.`,
            factId(pit.fact),
          ),
        );
      } else if (change.onTrackOvertake) {
        items.push(
          stmt(
            `OpenF1 also records an on-track pass by ${change.newDriver} on ${change.oldDriver} for the lead.`,
            factId(change.onTrackOvertake.fact),
          ),
        );
      } else {
        items.push(
          stmt(
            'Only the position change is supported by the evidence; no on-track overtake record corroborates it.',
            factId(change.fact),
          ),
        );
      }
    }
    leadBlocks.push(bullets(items));
  }
  if (lapsLed.length > 0) {
    leadBlocks.push(
      bullets(
        lapsLed.map((record) =>
          stmt(
            `${record.fact.driver} led ${pluralise(record.total, 'lap')} (${record.ranges}).`,
            factId(record.fact),
          ),
        ),
      ),
    );
  }

  sections.push({
    id: 'lead-changes',
    title: 'Lead changes',
    blocks: leadBlocks,
  });

  /* Pit visits ----------------------------------------------------- */
  const pitBlocks: ReportBlock[] = [];
  const timedPit = summaryFacts.fastestPit;
  pitBlocks.push(
    paragraph([
      stmt(
        `${pluralise(Number(summaryFacts.pitVisitCount?.value ?? bundle.pitFacts.filter((pit) => pit.isRaceStop).length), 'race pit visit')} were recorded.`,
        factId(summaryFacts.pitVisitCount),
      ),
      ...(bundle.excludedPits.length > 0
        ? [
            stmt(
              `${pluralise(bundle.excludedPits.length, 'pit-lane visit')} with more than 300 seconds of recorded pit-lane time are excluded from race-stop totals but retained as pit-cycle context; they are red-flag or restart visits, not race stops.`,
              factId(summaryFacts.excludedPitVisitCount),
            ),
          ]
        : []),
      ...(timedPit
        ? [stmt(`Fastest pit visit: ${timedPit.value}.`, factId(timedPit))]
        : [stmt('No pit-lane duration was supplied for this session.', factId(summaryFacts.pitVisitCount))]),
    ]),
  );
  if (winner) {
    const winnerPits = bundle.pitFacts.filter(
      (pit) => pit.isRaceStop && pit.row.driver_number === winner.driverNumber,
    );
    if (winnerPits.length > 0) {
      pitBlocks.push(
        paragraph([
          stmt(
            `${winner.name} made ${pluralise(winnerPits.length, 'pit visit')} on ${winnerPits
              .map((pit) => `lap ${pit.lap}`)
              .join(', ')}.`,
            ids(winnerPits.map((pit) => pit.fact)),
          ),
        ]),
      );
    }
  }
  if (pitCycles.length > 0) {
    pitBlocks.push(
      paragraph([
        stmt(
          `${pluralise(pitCycles.length, 'position change')} ${verb(pitCycles.length, 'is', 'are')} reported as pit-cycle changes, not overtakes.`,
          factId(summaryFacts.pitCycleCount),
        ),
      ]),
    );
    const items = notablePitCycles(tables.pitCycles).map((cycle) => {
      const duration = cycle.pitDuration != null ? ` (${formatSeconds(cycle.pitDuration)} pit lane)` : '';
      const visit = cycle.pitIsRaceStop
        ? 'pit visit is recorded'
        : 'pit-lane visit around the red flag/restart is recorded';
      return stmt(
        `Lap ${cycle.lap}: ${cycle.driver} moved from P${cycle.fromPosition ?? '?'} to P${cycle.toPosition ?? '?'} while ${cycle.pittedDriver} was in the pit lane; ${cycle.pittedDriver}'s ${visit} on lap ${cycle.pitLap}${duration}.`,
        [cycle.factId, cycle.pitFactId],
      );
    });
    pitBlocks.push(bullets(items));
    pitBlocks.push(
      paragraph([
        stmt(
          'The full list is in the pit-cycle table below and in the downloadable evidence CSV. These position changes are not described as on-track overtakes.',
          factId(summaryFacts.pitCycleCount),
        ),
      ]),
    );
  } else {
    pitBlocks.push(
      paragraph([
        stmt(
          'No position change was recorded within a 60-second pit window for either car.',
          factId(summaryFacts.pitCycleCount),
        ),
      ]),
    );
  }

  sections.push({
    id: 'pit-visits',
    title: 'Pit visits and pit-cycle position changes',
    blocks: pitBlocks,
    table: 'pitCycles',
  });

  /* Tyre stints ---------------------------------------------------- */
  const stintBlocks: ReportBlock[] = [];
  stintBlocks.push(
    paragraph([
      stmt(
        `${pluralise(bundle.stintFacts.length, 'tyre stint')} were recorded.`,
        factId(summaryFacts.stintCount),
      ),
      ...(bundle.excludedStints.length > 0
        ? [
            stmt(
              `${pluralise(bundle.excludedStints.length, 'stint row')} were excluded because the recorded lap_end preceded lap_start and the row could not describe a race stint.`,
              factId(summaryFacts.excludedStintCount),
            ),
          ]
        : []),
      stmt(`Compounds recorded: ${summaryFacts.compounds?.value ?? 'none supplied'}.`, factId(summaryFacts.compounds)),
    ]),
  );
  const winnerStints = winner
    ? tables.stints.find((driver) => driver.driverNumber === winner.driverNumber)
    : undefined;
  const strategyStints = winnerStints ?? dominantWinnerStints(tables.stints);
  if (strategyStints) {
    stintBlocks.push(
      paragraph([
        stmt(
          `${strategyStints.name}'s recorded stints: ${strategyStints.stints
            .map(
              (stint) =>
                `${stint.compound} on ${formatLapRange(stint.lapStart, stint.lapEnd)} (stint ${stint.stintNumber})`,
            )
            .join('; ')}.`,
          ids(strategyStints.stints.map((stint) => bundle.factsById.get(stint.factId))),
        ),
      ]),
    );
  }

  sections.push({
    id: 'tyre-stints',
    title: 'Tyre stints',
    blocks: stintBlocks,
    table: 'stints',
  });

  /* Overtakes ------------------------------------------------------ */
  const overtakeBlocks: ReportBlock[] = [];
  const preStartOvertakes = bundle.excludedOvertakes.filter((row) => row.reason === 'pre_start').length;
  const unverifiedOvertakes = bundle.excludedOvertakes.filter((row) => row.reason === 'unverified').length;
  const rawPitCycles = bundle.pitCycles.filter((cycle) => !cycle.derived).length;
  const derivedPitCycles = bundle.pitCycles.filter((cycle) => cycle.derived).length;
  const afterCutoffOvertakes = bundle.onTrackOvertakes.length + rawPitCycles + unverifiedOvertakes;
  overtakeBlocks.push(
    paragraph([
      stmt(
        `OpenF1 returned ${pluralise(Number(summaryFacts.overtakeRawCount?.value ?? bundle.excludedOvertakes.length), 'overtake timing row')} in total.`,
        factId(summaryFacts.overtakeRawCount),
      ),
      stmt(
        `${pluralise(preStartOvertakes, 'row')} ${verb(preStartOvertakes, 'occurred', 'occurred')} before the start cutoff and ${pluralise(afterCutoffOvertakes, 'row')} ${verb(afterCutoffOvertakes, 'remains', 'remain')} for classification.`,
        ids([summaryFacts.excludedPreStartCount, summaryFacts.overtakeAfterCutoffCount]),
      ),
      stmt(
        `${pluralise(bundle.onTrackOvertakes.length, 'remaining row')} met the on-track evidence test.`,
        factId(summaryFacts.onTrackOvertakeCount),
      ),
      stmt(
        `${pluralise(rawPitCycles, 'remaining row')} fell within a 60-second pit window and ${verb(rawPitCycles, 'was', 'were')} reported as pit-cycle changes instead.`,
        factId(summaryFacts.rawPitCycleCount),
      ),
      ...(derivedPitCycles > 0
        ? [
            stmt(
              `${pluralise(derivedPitCycles, 'additional position change')} without an /overtakes row were derived from /position samples near a pit visit, for ${pluralise(bundle.pitCycles.length, 'pit-cycle change')} in total.`,
              ids([summaryFacts.derivedPitCycleCount, summaryFacts.pitCycleCount]),
            ),
          ]
        : []),
      stmt(
        `${pluralise(unverifiedOvertakes, 'remaining row')} lacked position corroboration and are excluded from on-track classification.`,
        factId(summaryFacts.excludedUnverifiedCount),
      ),
    ]),
  );
  if (bundle.tables.overtakes.length > 0) {
    overtakeBlocks.push(
      bullets(
        notableOvertakes(bundle.tables.overtakes).map((row) =>
          stmt(
            row.lap === 1
              ? `On lap 1, ${row.driver} overtook ${row.overtakenDriver} for P${row.position}.`
              : `Lap ${row.lap}: ${row.driver} overtook ${row.overtakenDriver} for P${row.position}.`,
            factId(bundle.factsById.get(row.factId)),
          ),
        ),
      ),
    );
    overtakeBlocks.push(
      paragraph([
        stmt(
          'The table below lists every verified on-track pass. Excluded timing rows remain in the evidence CSV with a reason.',
          factId(summaryFacts.onTrackOvertakeCount),
        ),
      ]),
    );
  } else {
    overtakeBlocks.push(
      paragraph([
        stmt('No on-track overtake met the evidence threshold.', factId(summaryFacts.onTrackOvertakeCount)),
      ]),
    );
  }

  sections.push({
    id: 'overtakes',
    title: 'On-track overtakes',
    blocks: overtakeBlocks,
    table: 'overtakes',
  });

  /* Race control --------------------------------------------------- */
  const raceControlBlocks: ReportBlock[] = [];
  raceControlBlocks.push(
    paragraph([
      stmt(
        `OpenF1 returned ${pluralise(bundle.raceControl.length, 'race-control record')}; ${pluralise(bundle.raceControl.filter((record) => record.included).length, 'record')} met the significance filter.`,
        ids([summaryFacts.raceControlTotal, summaryFacts.raceControlSignificant]),
      ),
      stmt(
        `Safety-car deployments: ${summaryFacts.safetyCarCount?.value ?? '0'}. Red-flag periods: ${summaryFacts.redFlagCount?.value ?? '0'}.`,
        ids([summaryFacts.safetyCarCount, summaryFacts.redFlagCount]),
      ),
    ]),
  );
  const critical = bundle.raceControl
    .filter((record) => record.included && record.significance === 'critical')
    .sort((a, b) => a.row.date.localeCompare(b.row.date));
  if (critical.length > 0) {
    raceControlBlocks.push(
      bullets(
        critical.slice(0, 12).map((record) =>
          stmt(
            `${lapText(record.lap)} · ${record.fact.event}${record.fact.driver ? ` (${record.fact.driver})` : ''}: ${record.row.message}`,
            factId(record.fact),
          ),
        ),
      ),
    );
  } else {
    raceControlBlocks.push(
      paragraph([
        stmt('No critical race-control event was returned for this session.', factId(summaryFacts.raceControlTotal)),
      ]),
    );
  }
  if (bundle.raceControl.filter((record) => record.included).length > critical.length) {
    raceControlBlocks.push(
      paragraph([
        stmt(
          'The table below also includes notable events such as penalties, investigations, track-limit deletions and pit-lane notices.',
          factId(summaryFacts.raceControlSignificant),
        ),
      ]),
    );
  }

  sections.push({
    id: 'race-control',
    title: 'Race control',
    blocks: raceControlBlocks,
    table: 'raceControl',
  });

  /* Methodology ---------------------------------------------------- */
  sections.push({
    id: 'methodology',
    title: 'Method and coverage',
    blocks: [
      bullets([
        stmt(
          'Every sentence in this report carries one or more fact IDs. The IDs resolve to the evidence table in the app and to the downloadable CSV.',
          factId(summaryFacts.evidenceFactCount),
        ),
        stmt(
          'Starting positions use the first /position timing snapshot because /starting_grid returned no records for the bundled sessions.',
          factId(startSource),
        ),
        stmt(
          'Pit visits come from /pit, stints from /stints, lead changes from /position, race-control events from /race_control and overtake candidates from /overtakes.',
          factId(coverage),
        ),
        stmt(
          'A position change within 60 seconds of a pit visit for either car is classified as a pit-cycle change. It is never described as an on-track overtake.',
          factId(summaryFacts.pitCycleCount),
        ),
        stmt(
          'Only a verified on-track pass uses the word “overtook” in the deterministic report. An overtake row must fall outside every pit window and be corroborated by the position samples.',
          factId(summaryFacts.onTrackOvertakeCount),
        ),
        stmt(
          'A lead change is a change of P1 in /position. The report labels whether it coincided with a pit visit or is corroborated by an on-track pass.',
          factId(summaryFacts.leadChangeCount),
        ),
        ...(bundle.excludedPits.length > 0 || bundle.excludedStints.length > 0
          ? [
              stmt(
                'Pit-lane visits over 300 seconds are excluded from race-stop totals but retained as pit-cycle context; stint rows whose lap_end precedes lap_start are excluded from race totals. Both remain in the evidence CSV with a reason.',
                ids([summaryFacts.excludedPitVisitCount, summaryFacts.excludedStintCount]),
              ),
            ]
          : []),
        stmt(
          'No AI model is used to generate this report. Optional local AI narration is requested separately, uses the same evidence, and is labelled as AI-generated.',
          factId(summaryFacts.generationMode),
        ),
      ]),
    ],
  });

  validateCitations(sections, bundle.factsById);
  const markdown = renderMarkdown(bundle, sections);
  return { sections, markdown };
}

/* ------------------------------------------------------------------ */
/* Citation validation                                                 */
/* ------------------------------------------------------------------ */

function validateCitations(sections: ReportSection[], factsById: Map<string, EvidenceFact>): void {
  const missing: string[] = [];
  const uncited: string[] = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      for (const statement of block.statements) {
        if (statement.citations.length === 0) uncited.push(`${section.id}: ${statement.text.slice(0, 80)}`);
        for (const citation of statement.citations) {
          if (!factsById.has(citation)) missing.push(`${section.id}: ${citation}`);
        }
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Report contains citations that do not exist in the evidence table: ${missing.join(', ')}`);
  }
  if (uncited.length > 0) {
    throw new Error(`Report contains statements without evidence citations: ${uncited.join(' | ')}`);
  }
}

/* ------------------------------------------------------------------ */
/* Markdown rendering                                                  */
/* ------------------------------------------------------------------ */

function renderStatement(statement: Statement): string {
  const citations = statement.citations.map((citation) => `[${citation}]`).join(' ');
  return citations ? `${statement.text} ${citations}` : statement.text;
}

function renderSectionBlocks(section: ReportSection): string {
  const lines: string[] = [];
  for (const block of section.blocks) {
    if (block.type === 'paragraph') {
      lines.push(block.statements.map(renderStatement).join(' '));
      lines.push('');
    } else {
      for (const statement of block.statements) {
        lines.push(`- ${renderStatement(statement)}`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

function renderFinishTable(rows: FinishTableRow[]): string {
  if (rows.length === 0) return '_No finishing records were available._\n';
  const lines = [
    '| Pos | Driver | Team | Start | +/- | Status | Laps | Gap | Pts | Fact |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const change =
      row.placesGained == null ? '—' : row.placesGained > 0 ? `+${row.placesGained}` : String(row.placesGained);
    lines.push(
      `| ${row.position ?? row.status} | ${escapeMarkdownCell(row.name)} | ${escapeMarkdownCell(row.team)} | ${row.startPosition == null ? '—' : `P${row.startPosition}`} | ${change} | ${row.status} | ${row.laps} | ${escapeMarkdownCell(row.gap)} | ${row.points} | [${row.factId}] |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderOvertakeTable(rows: OvertakeTableRow[]): string {
  if (rows.length === 0) return '_No verifiable on-track overtake was recorded._\n';
  const lines = [
    '| Lap | Pos | Driver | Overtaken | From | To | Fact |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.lap} | ${row.position} | ${escapeMarkdownCell(row.driver)} | ${escapeMarkdownCell(row.overtakenDriver)} | ${row.fromPosition == null ? '—' : `P${row.fromPosition}`} | ${row.toPosition == null ? '—' : `P${row.toPosition}`} | [${row.factId}] |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderPitCycleTable(rows: PitCycleTableRow[]): string {
  if (rows.length === 0) return '_No pit-cycle position change was recorded._\n';
  const lines = [
    '| Lap | Driver | From | To | Pitted driver | Pit lap | Pit duration | Facts |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.lap} | ${escapeMarkdownCell(row.driver)} | ${row.fromPosition == null ? '—' : `P${row.fromPosition}`} | ${row.toPosition == null ? '—' : `P${row.toPosition}`} | ${escapeMarkdownCell(row.pittedDriver)} | ${row.pitLap} | ${row.pitDuration == null ? '—' : `${formatSeconds(row.pitDuration)}${row.pitIsRaceStop ? '' : ' (restart)'}`} | [${row.factId}] [${row.pitFactId}] |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderStintTable(drivers: StintTableDriver[]): string {
  if (drivers.length === 0) return '_No tyre-stint records were available._\n';
  const lines = [
    '| Driver | Stint | Compound | Laps | Tyre age at start | Fact |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const driver of drivers) {
    for (const stint of driver.stints) {
      lines.push(
        `| ${escapeMarkdownCell(driver.name)} | ${stint.stintNumber} | ${stint.compound} | ${formatLapRange(stint.lapStart, stint.lapEnd)} | ${stint.tyreAgeAtStart} | [${stint.factId}] |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderRaceControlTable(rows: RaceControlTableRow[]): string {
  if (rows.length === 0) return '_No significant race-control records were available._\n';
  const lines = [
    '| Lap | Category | Driver | Message | Significance | Fact |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.lap ?? '—'} | ${escapeMarkdownCell(row.category)} | ${escapeMarkdownCell(row.driver ?? '—')} | ${escapeMarkdownCell(row.message)} | ${row.significance} | [${row.factId}] |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderExcludedTable(rows: ExcludedOvertakeRow[]): string {
  if (rows.length === 0) return '_No overtake timing rows were excluded._\n';
  const lines = [
    '| Lap | Driver | Overtaken | Claimed position | Reason | Fact |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.lap || '—'} | ${escapeMarkdownCell(row.driver)} | ${escapeMarkdownCell(row.overtakenDriver)} | P${row.claimedPosition} | ${row.reason} | [${row.factId}] |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderEvidenceAppendix(facts: EvidenceFact[]): string {
  const lines = [
    '| ID | Category | Event | Driver | Lap | Source | Value | Confidence | In report |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const fact of facts) {
    lines.push(
      `| [${fact.id}] | ${fact.category} | ${escapeMarkdownCell(fact.event)} | ${escapeMarkdownCell(fact.driver ?? '—')} | ${fact.lap == null ? '—' : fact.lapEnd != null && fact.lapEnd !== fact.lap ? `${fact.lap}–${fact.lapEnd}` : fact.lap} | ${escapeMarkdownCell(fact.source)} | ${escapeMarkdownCell(fact.value)} | ${fact.confidence} | ${fact.includedInReport ? 'yes' : 'no'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderSources(bundle: EvidenceBundle): string {
  const lines = [
    '| Endpoint | Records | Available | Use |',
    '| --- | --- | --- | --- |',
  ];
  for (const source of bundle.sources) {
    lines.push(
      `| ${source.endpoint} | ${source.records} | ${source.available ? 'yes' : 'no'} | ${escapeMarkdownCell(source.note)} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function renderTable(bundle: EvidenceBundle, table: NonNullable<ReportSection['table']>): string {
  switch (table) {
    case 'finish':
      return renderFinishTable(bundle.tables.finish);
    case 'stints':
      return renderStintTable(bundle.tables.stints);
    case 'overtakes':
      return renderOvertakeTable(bundle.tables.overtakes);
    case 'pitCycles':
      return renderPitCycleTable(bundle.tables.pitCycles);
    case 'raceControl':
      return renderRaceControlTable(bundle.tables.raceControl);
  }
}

function renderMarkdown(bundle: EvidenceBundle, sections: ReportSection[]): string {
  const lines: string[] = [];
  lines.push(`# ${bundle.race.name} — Race report`);
  lines.push('');
  lines.push(
    `> Evidence-first report generated from OpenF1 session ${bundle.race.sessionKey}. ${bundle.facts.length} facts; every sentence cites one or more fact IDs. No AI model was used for this report.`,
  );
  lines.push('');
  for (const section of sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    lines.push(renderSectionBlocks(section));
    if (section.table) {
      lines.push(renderTable(bundle, section.table));
      lines.push('');
    }
  }
  lines.push('## Excluded overtake records');
  lines.push('');
  lines.push(
    'These timing rows were not classified as on-track overtakes. They remain in the evidence CSV so the exclusion can be audited.',
  );
  lines.push('');
  lines.push(renderExcludedTable(bundle.tables.excludedOvertakes));
  lines.push('## Data coverage');
  lines.push('');
  lines.push(renderSources(bundle));
  lines.push('## Evidence appendix');
  lines.push('');
  lines.push(
    'The table below is the complete fact set generated before the report was written. IDs in the report resolve here.',
  );
  lines.push('');
  lines.push(renderEvidenceAppendix(bundle.facts));
  lines.push('## Source');
  lines.push('');
  lines.push(
    `OpenF1 API, session_key=${bundle.race.sessionKey}, meeting_key=${bundle.race.meetingKey}. Data snapshot fetched for this app; see \`data/races/${bundle.race.id}.json\`. Generated ${formatDateTime(new Date().toISOString())}.`,
  );
  return `${lines.join('\n')}\n`;
}
