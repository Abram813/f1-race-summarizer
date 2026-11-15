import { describe, expect, it } from 'vitest';

describe('offline test guard', () => {
  it.runIf(process.env.OFFLINE_GUARD === '1')('blocks external fetch requests', async () => {
    await expect(async () => fetch('https://example.com/race-data.json')).rejects.toThrow(
      /Offline test guard blocked/,
    );
  });
});
