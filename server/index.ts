import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NarrationRequest } from '../shared/types';
import { getLocalAiDefaults, narrateRace } from './narrator';
import { getRaceReport, listRaces, findRace } from './races';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST_DIR = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const ALLOW_TEST_SHUTDOWN = process.env.ALLOW_TEST_SHUTDOWN === '1';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    races: listRaces().length,
    ai: getLocalAiDefaults(),
    staticBuild: existsSync(DIST_DIR),
  });
});

app.get('/api/config', (_request, response) => {
  response.json({
    ai: getLocalAiDefaults(),
    localOnly: true,
    note: 'Narration requests are restricted to loopback hosts. The deterministic report never calls a model.',
  });
});

app.get('/api/races', (_request, response) => {
  response.json({ races: listRaces() });
});

app.get('/api/races/:id', (request, response) => {
  const race = findRace(request.params.id);
  if (!race) {
    response.status(404).json({ error: `Unknown race: ${request.params.id}` });
    return;
  }
  try {
    response.json(getRaceReport(race.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not build the race report.';
    response.status(500).json({ error: message });
  }
});

app.post('/api/narrate', async (request, response) => {
  const body = request.body as Partial<NarrationRequest> | undefined;
  if (!body || typeof body.raceId !== 'string' || body.raceId.trim() === '') {
    response.status(400).json({ error: 'raceId is required.' });
    return;
  }
  if (body.endpoint != null && typeof body.endpoint !== 'string') {
    response.status(400).json({ error: 'endpoint must be a string when supplied.' });
    return;
  }
  if (body.model != null && typeof body.model !== 'string') {
    response.status(400).json({ error: 'model must be a string when supplied.' });
    return;
  }
  const race = findRace(body.raceId);
  if (!race) {
    response.status(404).json({ error: `Unknown race: ${body.raceId}` });
    return;
  }

  try {
    const pkg = getRaceReport(race.id);
    const narration = await narrateRace(pkg, {
      endpoint: body.endpoint,
      model: body.model,
    });
    response.json(narration);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local model request failed.';
    const status = /must point at this machine|not a valid URL|must use http/i.test(message) ? 400 : 502;
    response.status(status).json({ error: message });
  }
});

let server: ReturnType<typeof app.listen>;

if (ALLOW_TEST_SHUTDOWN) {
  app.post('/api/test/shutdown', (_request, response) => {
    response.json({ ok: true, message: 'Test server shutting down.' });
    response.on('finish', () => {
      server.close(() => {
        console.log('Test server closed cleanly.');
        process.exit(0);
      });
    });
  });
}

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || request.path.startsWith('/api/')) {
      next();
      return;
    }
    response.sendFile(join(DIST_DIR, 'index.html'));
  });
}

app.use((_request, response) => {
  response.status(404).json({ error: 'Not found. Run the Vite dev server for the client, or npm run build to serve the app here.' });
});

server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`F1 race summarizer API listening on http://127.0.0.1:${PORT}`);
  if (!existsSync(DIST_DIR)) {
    console.log('No dist build found: use `npm run dev` for the client at http://127.0.0.1:5173.');
  }
});
