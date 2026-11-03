/* ==========================================================================
   LOCAL STORAGE FOR THE RECORDS. The database in this browser is the source of
   truth. A commit either writes every change or writes none, and it reports
   success only after the browser confirms that the transaction finished.
   If the database is unavailable, Usha falls back to one saved document. If
   that also fails, the app says so and never claims that anything was saved.
   ========================================================================== */
const Store = (function () {
  const NAME = 'usha-records', VERSION = 1, LOCAL = 'usha-records-fallback';
  const EXTRA = ['files', 'snapshots'];
  let db = null, mode = 'none', local = null;

  const asPromise = r => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('The database request failed.'));
  });

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        Engine.TABLES.concat(EXTRA).forEach(t => { if (!req.result.objectStoreNames.contains(t)) req.result.createObjectStore(t, { keyPath: 'id' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('The database is in use by another version of Usha.'));
    });
  }

  async function open() {
    try {
      if (typeof indexedDB === 'undefined') throw new Error('No database');
      db = await openDb();
      /* Another tab updating the app must not be blocked by this one. */
      db.onversionchange = () => { db.close(); db = null; mode = 'failed'; if (Store.onlost) Store.onlost(); };
      mode = 'database';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      /* A database that exists but will not open may hold real restrictions, so
         Usha stops. It uses the fallback only where no database can exist. */
      if (typeof indexedDB !== 'undefined') { mode = 'failed'; return mode; }
      try {
        const probe = LOCAL + '-probe';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        mode = 'document';
      } catch (e2) { mode = 'none'; }
    }
    return mode;
  }

  async function load() {
    if (mode === 'database') {
      const state = Engine.emptyState();
      const tx = db.transaction(Engine.TABLES, 'readonly');
      await Promise.all(Engine.TABLES.map(async t => {
        const all = await asPromise(tx.objectStore(t).getAll());
        all.forEach(r => { state[t][r.id] = r; });
      }));
      return state;
    }
    if (mode === 'document') {
      local = Object.assign(Engine.emptyState(), JSON.parse(localStorage.getItem(LOCAL) || '{}'));
      return JSON.parse(JSON.stringify(local));
    }
    return Engine.emptyState();
  }

  /* The revision is checked inside the write, so two tabs can never overwrite
     each other, even where the browser offers no locks. */
  class Stale extends Error {}
  function commit(changes, expected) {
    if (mode === 'database') {
      return new Promise((resolve, reject) => {
        const tables = Array.from(new Set(changes.map(c => c.table).concat('meta')));
        const forgetHistory = changes.some(c => !c.value && ['contacts','convs'].includes(c.table));
        if (forgetHistory) tables.push('snapshots');
        let tx, stale = false;
        const writeAll = () => {
          if (forgetHistory) tx.objectStore('snapshots').clear();
          changes.forEach(c => {
          const store = tx.objectStore(c.table);
          if (c.value) store.put(c.value); else store.delete(c.id);
          });
        };
        try {
          tx = db.transaction(tables, 'readwrite');
          if (expected === undefined) writeAll();
          else {
            const read = tx.objectStore('meta').get('rev');
            read.onsuccess = () => {
              if ((read.result ? read.result.n : 0) !== expected) { stale = true; tx.abort(); return; }
              try { writeAll(); } catch (e) { tx.abort(); }
            };
          }
        } catch (e) { if (tx) { try { tx.abort(); } catch (e2) { /* already ended */ } } reject(e); return; }
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(stale ? new Stale() : tx.error || new Error('The save was cancelled.'));
        tx.onerror = () => { if (!stale) reject(tx.error || new Error('The save failed.')); };
      });
    }
    if (mode === 'document') {
      const saved = Object.assign(Engine.emptyState(), JSON.parse(localStorage.getItem(LOCAL) || '{}'));
      if (expected !== undefined && ((saved.meta.rev || {}).n || 0) !== expected) return Promise.reject(new Stale());
      Engine.applyChanges(saved, changes);
      localStorage.setItem(LOCAL, JSON.stringify(saved));
      local = saved;
      return Promise.resolve();
    }
    return Promise.reject(new Error('This browser is not allowing Usha to save.'));
  }

  /* Lets a tab notice that another tab has changed the records. */
  async function revision() {
    if (mode === 'document') return ((JSON.parse(localStorage.getItem(LOCAL) || '{}').meta || {}).rev || {}).n || 0;
    if (mode !== 'database') return 0;
    const row = await asPromise(db.transaction('meta').objectStore('meta').get('rev'));
    return row ? row.n : 0;
  }

  /* Attachments stay out of memory until someone opens them. */
  async function putFile(id, name, type, data) {
    if (mode !== 'database') throw new Error('Attachments need the local database.');
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id, name, type, data });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
  }
  async function getFile(id) {
    if (mode !== 'database') return null;
    return asPromise(db.transaction('files').objectStore('files').get(id));
  }
  async function fileIds() {
    if (mode !== 'database') return [];
    return asPromise(db.transaction('files').objectStore('files').getAllKeys());
  }
  async function deleteFiles(ids) {
    if (mode !== 'database' || !ids.length) return;
    const tx = db.transaction('files', 'readwrite');
    ids.forEach(id => tx.objectStore('files').delete(id));
  }

  /* One recovery point a day, and the last seven are kept. */
  async function snapshot(state, today) {
    if (mode !== 'database' || !Object.keys(state.convs).length) return;
    const store = db.transaction('snapshots', 'readwrite').objectStore('snapshots');
    await asPromise(store.put({ id: today, at: new Date().toISOString(), data: JSON.stringify(state) }));
    const keys = await asPromise(db.transaction('snapshots').objectStore('snapshots').getAllKeys());
    const old = keys.sort().slice(0, Math.max(0, keys.length - 7));
    if (old.length) { const tx = db.transaction('snapshots', 'readwrite'); old.forEach(k => tx.objectStore('snapshots').delete(k)); }
  }
  async function snapshots() {
    if (mode !== 'database') return [];
    const all = await asPromise(db.transaction('snapshots').objectStore('snapshots').getAll());
    return all.sort((a, b) => b.id.localeCompare(a.id));
  }

  async function eraseFiles() {
    if (mode !== 'database') return;
    const tx = db.transaction(EXTRA, 'readwrite');
    EXTRA.forEach(t => tx.objectStore(t).clear());
  }

  const fail = () => { mode = 'failed'; };
  return { Stale, open, load, commit, fail, revision, putFile, getFile, fileIds, deleteFiles, snapshot, snapshots, eraseFiles, get mode() { return mode; } };
})();
