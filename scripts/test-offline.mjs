import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vitest = require.resolve('vitest/vitest.mjs');
const child = spawn(process.execPath, [vitest, 'run'], {
  stdio: 'inherit',
  env: { ...process.env, OFFLINE_GUARD: '1' },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
