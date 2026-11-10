// Stand-in for "cloudflare:workers": bindings come from the current test.
export const env = new Proxy({}, { get: (_, key) => globalThis.__TEST_ENV__?.[key], has: (_, key) => key in (globalThis.__TEST_ENV__ ?? {}) });
