/* ==========================================================================
   SHARED STORAGE FOR THE RECORDS. Replaces the browser database of the
   standalone app. The Working Platform server is the source of truth: every
   command is sent as one commit that the server writes completely or not at
   all, checked against the revision this page last saw. The server checks the
   signed-in person and their Email Kit access on every request.
   ========================================================================== */
const Store = (function () {
  const API = '/api/platform/email-kit';
  const SESSION = window.EMAIL_KIT_SESSION || { access: 'view', user: { id: '', name: '' } };
  const RANK = { view: 1, edit: 2, manage: 3 };
  let mode = 'none', cached = null, problem = '';

  class Stale extends Error {}

  /* A signed-out or revoked session stops the app and offers sign-in. */
  function lost(text) {
    mode = 'failed';
    problem = text;
    document.body.dataset.lost = 'true';
    const note = document.getElementById('ekLostText');
    if (note) note.textContent = text;
    if (Store.onlost) Store.onlost();
  }

  async function call(path, options) {
    const opts = Object.assign({ credentials: 'same-origin', headers: {} }, options || {});
    if (opts.body !== undefined && typeof opts.body !== 'string') { opts.body = JSON.stringify(opts.body); opts.headers['content-type'] = 'application/json'; }
    let res;
    try { res = await fetch(API + path, opts); } catch (e) { throw new Error('Email Kit could not reach the Working Platform. Check your connection and try again. Nothing was changed.'); }
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.ok) return data;
    const msg = (data && data.error) || 'The Working Platform refused this request.';
    if (res.status === 401) { lost('Your session has ended. Sign in again to continue. Nothing was changed.'); throw new Error(msg); }
    if (res.status === 403 && data && data.code === 'NO_TOOL_ACCESS') { lost('Your access to Email Kit was removed by an administrator.'); throw new Error(msg); }
    if (res.status === 409 && data && data.code === 'STALE') throw new Stale();
    if (res.status === 404) return null;
    throw new Error(msg);
  }

  const withRev = body => {
    const state = Engine.emptyState();
    Object.keys(body.state || {}).forEach(t => { if (state[t]) state[t] = body.state[t]; });
    state.meta.rev = { id: 'rev', n: body.rev };
    return state;
  };

  async function open() {
    try {
      const body = await call('/state');
      cached = withRev(body);
      mode = 'database';
    } catch (e) {
      if (mode !== 'failed') { mode = 'failed'; problem = problem || e.message; }
    }
    return mode;
  }

  async function load() {
    if (cached) { const s = cached; cached = null; return s; }
    return withRev(await call('/state'));
  }

  /* The client's own meta/rev row and each change's previous value stay here;
     the server keeps the revision itself. */
  function commit(changes, expected, command) {
    if (mode !== 'database') return Promise.reject(new Error(problem || 'Email Kit cannot save right now.'));
    const list = changes.filter(c => !(c.table === 'meta' && c.id === 'rev')).map(c => ({ table: c.table, id: c.id, value: c.value || null }));
    return call('/commit', { method: 'POST', body: { expected, command: command || 'unknown', changes: list } }).then(() => undefined);
  }

  async function revision() {
    if (mode !== 'database') return 0;
    const body = await call('/revision');
    return body ? body.rev : 0;
  }

  async function putFile(id, name, type, data) {
    await call('/files/' + encodeURIComponent(id), { method: 'PUT', body: { name, type, data } });
  }
  async function getFile(id) {
    return call('/files/' + encodeURIComponent(id));
  }
  async function fileIds() {
    const body = await call('/files');
    return body ? body.ids : [];
  }
  /* The server deletes a file only when no saved record uses it, so another
     person's upload that is not yet saved is never removed. */
  async function deleteFiles(ids) {
    if (!ids.length || Store.readOnly) return;
    await call('/files', { method: 'POST', body: { action: 'delete', ids } });
  }
  async function eraseFiles() {
    await call('/files', { method: 'POST', body: { action: 'erase' } });
  }

  /* The server builds the daily recovery copy from its own records. */
  async function snapshot(state, today) {
    if (Store.readOnly || mode !== 'database') return;
    await call('/snapshots', { method: 'POST', body: { today } });
  }
  async function snapshots() {
    if (mode !== 'database') return [];
    const body = await call('/snapshots');
    return body ? body.snapshots : [];
  }
  async function snapshotData(id) {
    const body = await call('/snapshots?id=' + encodeURIComponent(id));
    return body ? body.data : null;
  }

  const fail = () => { mode = 'failed'; };
  const can = level => (RANK[SESSION.access] || 0) >= RANK[level];
  return {
    Stale, open, load, commit, fail, revision, putFile, getFile, fileIds, deleteFiles, snapshot, snapshots, snapshotData, eraseFiles, can,
    get mode() { return mode; }, get problem() { return problem; },
    get access() { return SESSION.access; }, get readOnly() { return !can('edit'); }, get user() { return SESSION.user; }
  };
})();
