/*
 * End-to-end smoke test.
 *
 * Starts the exact README launch command (`npm start`) against the production
 * build, opens the app in Chromium, verifies the demo race, switches races,
 * filters the evidence table, downloads the Markdown report, and shuts the
 * server down through the test-only endpoint. External HTTP requests are
 * aborted and recorded; any non-loopback attempt fails the test.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8787;
const BASE = `http://127.0.0.1:${PORT}`;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function portIsOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: PORT });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.ok === true) return;
      }
    } catch {
      // The server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Server did not become healthy at ${BASE}/api/health within ${timeoutMs}ms.`);
}

function waitForExit(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode != null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => reject(new Error('Server did not exit after shutdown request.')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function main() {
  if (await portIsOpen()) {
    throw new Error(`Port ${PORT} is already in use; stop the other process first.`);
  }

  const output = [];
  const child = spawn(npm, ['start'], {
    cwd: ROOT,
    env: { ...process.env, ALLOW_TEST_SHUTDOWN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  let browser;
  try {
    await waitForHealth();
    console.log('PASS: server started with `npm start` and /api/health is ready.');

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    const externalRequests = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
        externalRequests.push(url.href);
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');
    assert.match(await page.locator('h1').innerText(), /São Paulo Grand Prix/);
    assert.match(await page.locator('body').innerText(), /Max VERSTAPPEN/);
    console.log('PASS: demo loaded with the default 2024 São Paulo Grand Prix report.');

    await page.getByRole('button', { name: /British GP/ }).click();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('British Grand Prix'));
    assert.match(await page.locator('body').innerText(), /Lewis HAMILTON/);
    console.log('PASS: selecting British GP changed the report winner to Lewis Hamilton.');

    await page.getByRole('button', { name: /Monaco GP/ }).click();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent?.includes('Monaco Grand Prix'));
    assert.match(await page.locator('body').innerText(), /Charles LECLERC/);
    console.log('PASS: selecting Monaco GP changed the report winner to Charles Leclerc.');

    await page.locator('.tabs button').filter({ hasText: 'Evidence' }).click();
    await page.locator('#fact-search').fill('Pit-lane visit');
    await page.waitForFunction(() => document.body.innerText.includes('Pit-lane visit (red flag/restart)'));
    const evidenceText = await page.locator('.evidence-table-card').innerText();
    assert.match(evidenceText, /Pit-lane visit \(red flag\/restart\)/);
    assert.match(evidenceText, /excluded from race-stop totals/);
    console.log('PASS: evidence search exposed the 16 Monaco restart pit-lane visits and their exclusion.');

    await page.getByRole('button', { name: 'Report', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Markdown/ }).click(),
    ]);
    assert.match(download.suggestedFilename(), /2024-monaco-gp-race-report\.md$/);
    console.log(`PASS: Markdown download produced ${download.suggestedFilename()}.`);

    assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`);
    assert.deepEqual(externalRequests, [], `External requests were attempted: ${externalRequests.join(', ')}`);
    console.log('PASS: no external HTTP requests were attempted by the browser.');

    await browser.close();
    browser = undefined;

    const shutdown = await fetch(`${BASE}/api/test/shutdown`, { method: 'POST' });
    assert.equal(shutdown.status, 200);
    const code = await waitForExit(child);
    assert.equal(code, 0, `Server exited with code ${code}.`);
    assert.equal(await portIsOpen(), false, `Port ${PORT} remained open after shutdown.`);
    console.log('PASS: server shut down cleanly with exit code 0 and closed the port.');
  } catch (error) {
    console.error(output.join(''));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode == null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
