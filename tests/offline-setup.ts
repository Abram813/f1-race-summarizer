/*
 * Offline test guard.
 *
 * The bundled fixtures and deterministic pipeline should never need the
 * network. When OFFLINE_GUARD=1, external fetch targets fail fast while
 * loopback targets remain available for the local-AI endpoint guard tests.
 */

const LOOPBACK_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  'host.docker.internal',
]);

function hostOf(input: RequestInfo | URL): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  try {
    return new URL(raw).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

if (process.env.OFFLINE_GUARD === '1') {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const host = hostOf(input);
    if (!LOOPBACK_HOSTS.has(host)) {
      throw new Error(`Offline test guard blocked an external request to ${host || 'an unknown host'}.`);
    }
    return originalFetch(input, init);
  }) as typeof fetch;
}
