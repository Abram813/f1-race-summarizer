# F1 Race Summarizer

An evidence-first Formula 1 race report. The complete report is generated
deterministically from a bundled OpenF1 snapshot; no AI model, API key or
internet connection is needed. Every sentence cites one or more rows in the
evidence table, and the same evidence can be exported as Markdown or CSV.

Repository: <https://github.com/Abram813/f1-race-summarizer>

[![fresh-clone-ci](https://github.com/Abram813/f1-race-summarizer/actions/workflows/ci.yml/badge.svg)](https://github.com/Abram813/f1-race-summarizer/actions/workflows/ci.yml)

## What the app shows

- A race report with a winner summary, lead changes, pit visits, tyre stints,
  race-control events and overtake classifications.
- A lap-position chart with clickable markers.
- A filterable evidence table with fact IDs and citations.
- Markdown and CSV downloads.
- Optional local-AI narration that is explicitly labelled as AI-generated and
  is grounded in the same facts as the deterministic report.

The default demo is the most recent bundled race, the **2024 São Paulo Grand
Prix**. The other bundled races are the 2024 British Grand Prix and the 2024
Monaco Grand Prix.

## Quick start (exact commands)

Requirements: Node.js 20 or newer and npm. The local verification below used
Node **v26.10.0** and npm **11.19.1**; CI uses Node **24.x**.

```bash
git clone https://github.com/Abram813/f1-race-summarizer.git
cd f1-race-summarizer
npm ci
npm run build
npm start
```

Open <http://127.0.0.1:8787>. The server binds to loopback only.

To stop it, press `Ctrl+C` in the terminal. The app needs no network access at
runtime because all three races are bundled.

For development with hot reload:

```bash
npm run dev
```

That starts the API on <http://127.0.0.1:8787> and the Vite client on
<http://127.0.0.1:5173>.

## Tests

```bash
npm test
npm run test:offline
npx playwright install chromium
npm run test:smoke
```

- `npm test` runs the unit and fixture tests. It skips the offline-guard test,
  which is only active under `npm run test:offline`.
- `npm run test:offline` sets `OFFLINE_GUARD=1`, blocks every non-loopback
  `fetch`, and proves that the guard rejects an external request. The report
  pipeline must still pass from bundled fixtures.
- `npm run test:smoke` starts the production build with `npm start`, opens it
  in Chromium, verifies the default São Paulo demo, switches to the British and
  Monaco races, filters the evidence table, downloads the Markdown report,
  asserts that the browser made no external HTTP request, then shuts the server
  down through a test-only endpoint and checks that the port is closed.

The smoke test requires `npm run build` first because `npm start` serves
`dist/`. It also requires Chromium; install it once with
`npx playwright install chromium`.

## How the report is made

The server reads the bundled OpenF1 JSON snapshots in `data/races/` and builds a
fact table before writing any prose. The report renderer can only emit a
sentence with citations to facts that already exist. This is the core
traceability rule.

### Overtakes and pit cycles

A position gain is **not** automatically an overtake.

1. A row that occurs before the race-start cutoff is excluded. Monaco and São
   Paulo both had an aborted first start; their restart is the narrative basis.
2. A row within 60 seconds of a recorded pit visit is classified as a
   **pit-cycle position change**, not an on-track overtake. The report names the
   driver who was in the pit lane, the pit lap and the recorded pit-lane time.
3. Only a remaining row whose position change is corroborated by `/position`
   samples is called an on-track overtake. Rows without corroboration are kept
   as excluded evidence.
4. Position changes near a pit visit that have no `/overtakes` row are derived
   from `/position` samples and reported separately as derived pit cycles.

Pit-lane visits longer than **300 seconds** are treated as red-flag or restart
visits. They are excluded from **race-stop totals** but retained as pit-cycle
context so a restart position change is never mislabelled as an on-track pass.
Stint rows whose `lap_end` is before `lap_start` are invalid and are excluded
from race totals. Both kinds of excluded row remain in the evidence CSV with a
reason.

### Starting positions

The bundled `/starting_grid` source returned no records. Starting positions are
therefore taken from the first `/position` timing snapshot and the limitation is
shown in the data-source notes.

### Bundled data

| Race | Race pit visits | Restart pit-lane visits | Valid stints | Invalid stint rows | Raw overtake rows | Pre-start excluded | After cutoff | On-track passes | Pit-cycle changes (raw + derived) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2024 British GP | 45 | 0 | 65 | 0 | 120 | 0 | 120 | 66 | 54 (54 + 0) |
| 2024 São Paulo GP | 19 | 16 | 54 | 0 | 183 | 0 | 183 | 125 | 58 (58 + 0) |
| 2024 Monaco GP | 7 | 16 | 27 | 16 | 47 | 32 | 15 | 6 | 12 (9 + 3) |

For Monaco, the 16 restart pit-lane visits carry roughly 39 minutes of
recorded pit-lane time and are not race stops. The fastest **race** pit visit
is Max Verstappen's 23.8-second visit on lap 52. The 16 invalid stint rows
include Leclerc's `MEDIUM` stint recorded as laps `1–0`; the valid
`HARD` stint is laps `1–78`.

## Local AI narration (optional)

The deterministic report never calls a model. The **Local AI** tab can request
narration from a model running on the same machine:

- Ollama's default endpoint (`http://127.0.0.1:11434`), or
- an OpenAI-compatible endpoint.

Only loopback hosts are accepted. The narrator is given the deterministic
report and the cited fact table, and its output is labelled as AI-generated.
If no local model is running, the report and all calculations still work.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/config` | Local-AI defaults and loopback restriction |
| `GET /api/races` | Bundled race catalog |
| `GET /api/races/:id` | Race package: facts, report, tables, chart |
| `POST /api/narrate` | Optional local-AI narration |

The API and static client are served on the same loopback origin. Markdown and
CSV downloads are produced in the browser from the race package; they are not
separate API routes.

## Verified results

### Local verification

Run on **macOS 26.6.2 arm64** with **Node v26.10.0** and **npm 11.19.1**, from
the path `/Users/abram/Documents/f1-lab/race summarize/f1-race-summarizer`
(the path contains spaces):

| Command | Result |
| --- | --- |
| `npm test` | 35 passed, 1 skipped |
| `npm run test:offline` | 36 passed |
| `npm run build` | succeeded |
| `npm run test:smoke` | demo, race switching, evidence filter, Markdown download, no external requests, clean shutdown: all passed |

### Fresh-clone CI

The workflow runs a fresh checkout into a directory containing spaces on three
GitHub-hosted runners:

- Windows x64: `windows-latest`
- macOS arm64: `macos-15`
- macOS x86_64: `macos-15-intel`

Each job records the actual OS, CPU architecture, Node/npm and Python/uv
availability, then runs `npm ci`, `npm run test:offline`, `npm run build`,
installs Chromium, and runs `npm run test:smoke`. The latest workflow run and
per-platform results are recorded here after the first run:

<!-- CI_RESULTS -->

Python and uv are **not used by this repository**. The CI step reports the
runner's Python version for the record and prints that uv is not installed
because the project is Node/TypeScript only. To verify the equivalent locally,
run `node --version`, `npm --version` and `node -e "console.log(process.platform, process.arch)"`;
no Python or uv command is required.

## Two-minute VS Code walkthrough

1. Open the repository folder in VS Code. If you cloned it into a path with
   spaces, keep that path; all commands below are run from the repository root.
2. Open the integrated terminal and run `npm ci`, then `npm run build`, then
   `npm start`. Open <http://127.0.0.1:8787>.
3. Point out the default **2024 São Paulo Grand Prix** report, the winner
   (Max Verstappen), the stat cards, and the fact/source badges.
4. Click **British GP** and then **Monaco GP** in the sidebar. The winner and
   stats change without any model call.
5. Click **Evidence**, search for `Pit-lane visit`, and show the 16 Monaco
   restart visits with their exclusion reason. Click a citation and then use
   **Markdown** to download the report.
6. Open `server/evidence.ts` and show `PIT_WINDOW_MS = 60_000`,
   `MAX_PLAUSIBLE_PIT_LANE_SECONDS = 300`, and `isValidStint`. Open
   `tests/fixtures.test.ts` and show the Monaco restart and overtake-count
   assertions.
7. Return to the terminal and press `Ctrl+C` to stop the server. The smoke test
   uses the same launch command and verifies a clean shutdown and closed port.
