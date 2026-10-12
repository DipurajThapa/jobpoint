// Exercise real route bodies with storage dependencies that fail on any access.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const origin = 'https://demo.test';
const context = createContext({ Response, Request, Headers, URL, TextEncoder, TextDecoder, crypto, process: { env: { NODE_ENV: 'production' } }, console });
let forbiddenCalls = 0, checks = 0;
const forbidden = () => { forbiddenCalls++; throw new Error('Unexpected body, database, storage or query access'); };
const modules = new Map();
async function actual(path) {
  const id = resolve(root, path);
  if (modules.has(id)) return modules.get(id);
  const source = await readFile(id, 'utf8');
  const module = new SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }), { context, identifier: id });
  modules.set(id, module);
  await module.link(async (specifier, parent) => {
    if (specifier === '@/lib/demo') return actual('lib/demo.ts');
    if (specifier === '@/lib/admin') return actual('lib/admin.ts');
    // Preserve the actual auth logic; only next/headers is mocked for APIs, which use Request headers.
    if (specifier === 'next/headers') return synthetic(specifier, { headers: forbidden });
    if (specifier === '@/lib/http') return synthetic(specifier, {
      errorJson: (error, status = 400) => Response.json({ error }, { status }),
      json: (data, status = 200) => Response.json(data, { status }),
      sameOrigin: request => request.headers.get('origin') === new URL(request.url).origin,
      clean: forbidden, validEmail: forbidden, limitSubmission: forbidden, isJobOpen: forbidden,
    });
    if (specifier === 'cloudflare:workers') return synthetic(specifier, { env: new Proxy({}, { get: forbidden }) });
    if (specifier === '@/db') return synthetic(specifier, { getDb: forbidden });
    // Obtain the imported names so mocks cover all unused drizzle/schema bindings.
    const parentSource = await readFile(parent.identifier, 'utf8');
    const match = [...parentSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].find(m => m[2] === specifier);
    assert.ok(match, `Unexpected import ${specifier}`);
    return synthetic(specifier, Object.fromEntries(match[1].split(',').map(name => [name.trim(), forbidden])));
  });
  await module.evaluate();
  return module;
}
function synthetic(id, exports) {
  const key = 'mock:' + id + ':' + Object.keys(exports).sort().join(',');
  if (modules.has(key)) return modules.get(key);
  const mod = new SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  modules.set(key, mod);
  return mod;
}
function request(method = 'POST', headers = {}) {
  const req = new Request(origin + '/api/test', { method, headers: { origin, ...headers } });
  Object.defineProperty(req, 'json', { value: forbidden });
  Object.defineProperty(req, 'formData', { value: forbidden });
  return req;
}
for (const path of ['applications', 'employer-enquiries', 'privacy-requests']) {
  const mod = await actual(`app/api/${path}/route.ts`);
  for (const contentType of ['application/json', 'multipart/form-data; boundary=demo']) {
    const response = await mod.namespace.POST(request('POST', { 'content-type': contentType }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'DEMO_READ_ONLY');
    assert.equal(response.headers.get('cache-control'), 'no-store'); checks++;
  }
}
const admin = await actual('lib/admin.ts');
assert.equal(await admin.namespace.isOwnerRequest(request('GET')), false);
assert.equal(await admin.namespace.isOwnerRequest(request('GET', { 'oai-authenticated-user-email': 'dipuraj.thapa@gmail.com' })), false);
assert.equal(await admin.namespace.isOwnerRequest(request('GET', { 'oai-authenticated-user-id': 'another-id', 'oai-authenticated-user-email': 'another@example.test' })), false);
assert.equal(await admin.namespace.isOwnerRequest(request('GET', { 'oai-authenticated-user-id': 'owner-id', 'oai-authenticated-user-email': 'dipuraj.thapa@gmail.com' })), true); checks += 4;
async function routes(dir) {
  const found = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await routes(`${dir}/${entry.name}`));
    else if (entry.name === 'route.ts') found.push(`${dir}/${entry.name}`);
  }
  return found;
}
for (const path of await routes('app/api/admin')) {
  const mod = await actual(path);
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    if (!mod.namespace[method]) continue;
    for (const headers of [{}, { 'oai-authenticated-user-id': 'another-id', 'oai-authenticated-user-email': 'another@example.test' }]) {
      const response = await mod.namespace[method](request(method, headers), { params: Promise.resolve({ id: 'synthetic-id', type: 'applications' }) });
      assert.equal(response.status, 401, `${method} ${path}`); checks++;
    }
  }
}
const robots = await actual('app/robots.txt/route.ts');
assert.match(await (await robots.namespace.GET(request('GET'))).text(), /Disallow: \/\n/); checks++;
const sitemap = await actual('app/sitemap.xml/route.ts');
assert.doesNotMatch(await (await sitemap.namespace.GET(request('GET'))).text(), /<url>/); checks++;
assert.equal(forbiddenCalls, 0);
console.log(`PASS: ${checks} demo intake, admin authorization and crawler checks; no body parsing or storage calls.`);
