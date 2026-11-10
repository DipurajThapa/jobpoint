// Stand-in for "next/headers": request headers and cookies come from the current test.
export async function headers() { return globalThis.__TEST_HEADERS__ ?? new Headers(); }
export async function cookies() {
  const jar = globalThis.__TEST_COOKIES__ ?? {};
  return { get: name => (name in jar ? { name, value: jar[name] } : undefined) };
}
