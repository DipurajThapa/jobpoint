import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
async function files(dir) {
  const found = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await files(path));
    else if (entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}
const sources = new Map();
for (const path of [...await files('app'), ...await files('components')]) sources.set(path, await readFile(resolve(root, path), 'utf8'));
const routes = new Set([...sources.keys()].filter(path => path.endsWith('/page.tsx')).map(path => '/' + path.slice(4, -9).replace(/^\/$/, '')));
routes.add('/');
const ids = new Map();
for (const [path, source] of sources) {
  for (const [, id] of source.matchAll(/\bid="([\w-]+)"/g)) ids.set(id, path);
}
let checked = 0;
for (const [path, source] of sources) {
  for (const [, href] of source.matchAll(/\bhref="([^"]*)"/g)) {
    assert.ok(href && href !== '#' && !href.startsWith('javascript:'), `Empty or unsafe link in ${path}`);
    if (!href.startsWith('/')) continue;
    const [route, anchor] = href.split('#');
    assert.ok(routes.has(route), `Unknown route ${href} in ${path}`);
    if (anchor) {
      assert.ok(ids.has(anchor), `Unknown anchor ${href} in ${path}`);
      const target = ids.get(anchor);
      assert.ok(route === '/' ? target === 'app/home-client.tsx' : target.startsWith(route === '/privacy' ? 'app/privacy/' : `app${route}/`), `Anchor ${href} points to ${target}`);
    }
    checked++;
  }
}
for (const [id, path] of ids) assert.ok(id !== '', `Empty id in ${path}`);
console.log(`PASS: ${checked} literal internal links and anchors resolve to ${routes.size} defined page routes.`);
