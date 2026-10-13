import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

const context = createContext({ process: { env: { NODE_ENV: 'development' } }, Set });
const modules = new Map();
function synthetic(names, values) {
  return new SyntheticModule(names, function () { for (const name of names) this.setExport(name, values[name]); }, { context });
}
async function actual(path) {
  if (modules.has(path)) return modules.get(path);
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const module = new SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }), { context, identifier: path });
  modules.set(path, module);
  await module.link(specifier => {
    if (specifier === '@/lib/local-dummy-jobs') return actual('lib/local-dummy-jobs.ts');
    if (specifier === '@/db') return synthetic(['getDb'], { getDb: () => { throw Error('Local D1 unavailable'); } });
    if (specifier === '@/db/schema') return synthetic(['jobs'], { jobs: {} });
    if (specifier === 'drizzle-orm') return synthetic(['and', 'desc', 'eq', 'like', 'or'], Object.fromEntries(['and', 'desc', 'eq', 'like', 'or'].map(name => [name, () => {}])));
    throw Error(`Unexpected dependency ${specifier}`);
  });
  await module.evaluate();
  return module;
}
const fixture = (await actual('lib/local-dummy-jobs.ts')).namespace;
const listing = (await actual('lib/public-jobs.ts')).namespace;
const all = await listing.listPublicJobs();
assert.equal(all.jobs.length, 4);
assert.ok(all.jobs.every(job => job.id.startsWith('dummy-') && job.isDummy && job.company.includes('Dummy')));
assert.deepEqual([...all.locations], ['Asansol', 'Durgapur', 'Kolkata']);
assert.equal((await listing.listPublicJobs('account', 'Durgapur')).jobs[0].id, 'dummy-junior-accountant');
assert.equal((await listing.listPublicJobs('nonexistent')).jobs.length, 0);
assert.equal(fixture.findLocalDummyJob('dummy-operations-coordinator')?.location, 'Durgapur');
context.process.env.NODE_ENV = 'production';
assert.equal(fixture.findLocalDummyJob('dummy-operations-coordinator'), undefined);
assert.equal(fixture.searchLocalDummyJobs().length, 0);
await assert.rejects(listing.listPublicJobs(), /Local D1 unavailable/);
console.log('PASS: four local dummy roles, filtering and detail lookup; no production fallback.');
