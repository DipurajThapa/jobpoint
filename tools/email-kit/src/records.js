/* ==========================================================================
   CLIENT RECORD VIEWS. Next actions, the client folders, one client record,
   follow-up rules and exports. Text reaches the page through textContent only.
   Opening a record reads it. Nothing here runs a command until a person asks.
   ========================================================================== */
const RecordViews = (function () {
  const $ = id => document.getElementById(id);
  const MAX_FILE = 5 * 1048576;
  let ctx = null, openConv = '', openContact = '', signature = '';

  const today = () => Engine.todayIn(Engine.settingsOf(ctx.db()).timeZone);
  const date = iso => Rules.formatDate(iso, today());
  const L = Engine.LABELS;
  const title = t => t.charAt(0).toUpperCase() + t.slice(1);

  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'text') node.textContent = v;
      else if (k === 'on') node.addEventListener('click', v);
      else if (k === 'class') node.className = v;
      else if (v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().filter(Boolean).forEach(k => node.append(k));
    return node;
  }
  /* Buttons that only show or export records are available at every access level.
     Anything that changes records needs Edit; restoring a recovery point needs Manage. */
  const READ_ONLY = ['Add to calendar', 'Open the file', 'Open the record', 'Open', 'Hide', 'Dismiss', 'Review the draft', 'Review the saved draft'];
  const button = (label, run, cls) => {
    const b = el('button', { type: 'button', class: 'btn quiet small ' + (cls || ''), text: label, on: run });
    if (!READ_ONLY.includes(label)) b.dataset.needs = label === 'Restore' ? 'manage' : 'edit';
    return b;
  };

  function miniForm(spec, submit, run) {
    const form = el('div', { class: 'mini' });
    const inputs = {};
    spec.forEach(f => {
      const id = 'mini-' + f.name;
      const input = f.type === 'select' ? el('select', { id }, f.options.map(o => el('option', { value: o.id, text: o.label })))
        : f.type === 'area' ? el('textarea', { id, rows: 2 }) : el('input', { id, type: f.type || 'text' });
      if (f.value !== undefined) input.value = f.value;
      inputs[f.name] = input;
      form.appendChild(el('div', { class: 'field' }, el('label', { for: id, text: f.label }), input));
    });
    form.appendChild(button(submit, async () => {
      const values = {};
      Object.keys(inputs).forEach(k => { values[k] = inputs[k].value; });
      await run(values);
    }, 'go'));
    return form;
  }
  /* A step that needs input opens under the record, and only one at a time. */
  function openStep(title, spec, submit, run) {
    const slot = $('recordStep');
    slot.textContent = '';
    slot.append(el('h4', { text: title }), miniForm(spec, submit, run));
    slot.hidden = false;
    const first = slot.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  /* ---------- Next actions ---------- */
  function whoOf(a) { return [a.contact && a.contact.name, a.org && a.org.name].filter(Boolean).join(', ') || 'Contact'; }

  function reviewButtons(task) {
    const r = task.review || {};
    const send = (label, answer) => button(label, async () => {
      const out = await ctx.attempt('resolveReview', { id: task.id, answer });
      if (out) { ctx.renderAll(); ctx.say('The review is recorded.'); }
    });
    if (r.kind === 'restriction') return [send('No contact at all', 'all'), send('This channel only', 'channel'), send('Everyone at the company', 'organisation'), send('Not an opt-out', 'none')];
    return [send('Same person', 'same'), send('Different person', 'different')];
  }

  function renderActions() {
    const list = $('trackerList');
    list.textContent = '';
    const db = ctx.db();
    const items = Engine.actions(db, today());
    items.forEach(a => {
      const t = a.task;
      const when = !t.due ? 'No date set.' : a.overdue ? 'Overdue since ' + date(t.due) + '.' : a.today ? 'Due today.' : 'Due on ' + date(t.due) + '.';
      const li = el('li', { 'data-kind': t.kind },
        el('strong', { text: t.title }),
        el('span', { class: 'who', text: whoOf(a) }),
        el('span', { class: a.overdue || a.today ? 'due' : '', text: when + ' Owner: ' + Engine.who(t.owner) + '.' }),
        el('span', { class: 'why', text: t.reason }));
      const row = el('div', { class: 'track-actions' });
      if (t.kind === 'review') row.append(...reviewButtons(t));
      if (a.conv) {
        const stored = Engine.rows(db, 'msgs').find(m => m.convId === a.conv.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status));
        if (stored) row.append(button('Review the draft', () => ctx.continueEntry({ id: a.conv.id }, stored)));
        if (t.kind === 'referral') row.append(button(t.title, () => ctx.prepareReferred({ id: a.conv.id })));
        else if (t.kind !== 'review' && (a.conv.lastType || a.conv.pending || a.conv.heldReply) && !['verifyEmployer', 'fixAddress', 'meeting', 'meetingOutcome'].includes(t.kind)) row.append(button('Continue', () => ctx.continueEntry({ id: a.conv.id })));
        row.append(button('Open the record', () => showConversation(a.conv.id)));
      }
      else if (a.contact) row.append(button('Open', () => showContact(a.contact.id)));
      li.appendChild(row);
      list.appendChild(li);
    });
    const queued = Engine.rows(db, 'queue').filter(q => q.status !== 'done').sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 8);
    const box = $('queueList');
    box.textContent = '';
    queued.forEach(q => {
      const conv = db.convs[q.convId], contact = conv && db.contacts[conv.contactId], msg = db.msgs[q.msgId];
      const state = q.status === 'cancelled' ? 'Cancelled. ' + q.reason : navigator.onLine ? 'Checked and ready for you to send.' : 'Waiting for a connection. Nothing has been sent.';
      const li = el('li', {}, el('strong', { text: 'Queued draft' }), el('span', { class: 'who', text: contact ? contact.name || 'Contact' : 'Contact' }), el('span', { text: state }));
      const row = el('div', { class: 'track-actions' });
      if (q.status !== 'cancelled' && conv && msg) row.append(button('Review the draft', async () => {
        await ctx.reconcile();
        const fresh = ctx.db().queue[q.id];
        if (!fresh || fresh.status === 'cancelled') { ctx.showToast('This draft is no longer current. ' + (fresh ? fresh.reason : '')); ctx.renderAll(); return; }
        await ctx.attempt('finishQueue', { id: q.id, status: 'done' });
        ctx.continueEntry({ id: conv.id }, ctx.db().msgs[q.msgId]);
      }));
      row.append(button('Dismiss', async () => { if (await ctx.attempt('finishQueue', { id: q.id, status: 'done' })) ctx.renderAll(); }));
      li.appendChild(row);
      box.appendChild(li);
    });
    $('todayEmpty').hidden = items.length > 0 || queued.length > 0;
    return items;
  }

  /* ---------- Folders ---------- */
  function renderFolders() {
    const tree = $('folderTree');
    tree.textContent = '';
    const db = ctx.db();
    const q = $('clientSearch').value.trim().toLowerCase();
    const hit = t => !q || String(t || '').toLowerCase().includes(q);
    Engine.folders(db).forEach(({ org, contacts }) => {
      const people = contacts.filter(({ contact, convs }) => hit(org.name) || hit(contact.name) || hit(contact.contact) || convs.some(c => hit(c.topic) || hit(c.subject)));
      if (!people.length) return;
      const open = !!q || people.some(p => p.contact.id === openContact || p.convs.some(c => c.id === openConv));
      const folder = el('details', { class: 'folder', open }, el('summary', { text: org.name + ' (' + people.length + ')' }));
      people.forEach(({ contact, convs, past }) => {
        const row = el('div', { class: 'folder-contact' },
          button((contact.name || 'Unnamed contact') + (past ? ', former' : ''), () => showContact(contact.id), 'plain'),
          el('span', { class: 'hint', text: L.contact[contact.status] }));
        folder.appendChild(row);
        convs.forEach(c => folder.appendChild(el('div', { class: 'folder-conv' },
          button(title(c.topic || 'Conversation'), () => showConversation(c.id), 'plain'),
          el('span', { class: 'hint', text: L.conv[c.status] }))));
      });
      tree.appendChild(folder);
    });
    if (!tree.children.length) tree.appendChild(el('p', { class: 'hint', text: q ? 'No client matches this search.' : 'Your clients will appear here.' }));
  }

  /* ---------- One record ---------- */
  function facts(convId) {
    const rows = Engine.rows(ctx.db(), 'facts').filter(f => f.convId === convId);
    const box = el('div', {});
    [['confirmed', 'Confirmed'], ['proposed', 'Proposed'], ['unresolved', 'Unresolved'], ['resolved', 'Resolved'], ['corrected', 'Corrected']].forEach(([status, title]) => {
      const list = rows.filter(f => f.status === status);
      if (!list.length) return;
      box.appendChild(el('h4', { text: title }));
      box.appendChild(el('ul', { class: 'facts' }, list.map(f => el('li', {},
        el('span', { text: L.fact[f.kind] + ': ' + f.text }),
        status === 'corrected' ? null : el('div', { class: 'track-actions' }, button('Correct', () => openStep('Correct this note', [
          { name: 'text', label: 'Correct text', type: 'area', value: f.text },
          { name: 'status', label: 'Status', type: 'select', options: ['confirmed', 'proposed', 'unresolved', 'resolved'].map(id => ({ id, label: L.factStatus[id] })), value: f.status },
          { name: 'why', label: 'Why is it changing?' }
        ], 'Save the correction', async v => { if (await ctx.attempt('correctFact', { id: f.id, text: v.text, status: v.status, why: v.why })) ctx.renderAll(); })))))));
    });
    if (!box.children.length) box.appendChild(el('p', { class: 'hint', text: 'No notes yet.' }));
    box.appendChild(button('Add a note', () => openStep('Add a note', [
      { name: 'kind', label: 'Type', type: 'select', options: Object.keys(L.fact).map(id => ({ id, label: L.fact[id] })) },
      { name: 'text', label: 'Note', type: 'area' },
      { name: 'status', label: 'Status', type: 'select', options: ['confirmed', 'proposed', 'unresolved'].map(id => ({ id, label: L.factStatus[id] })) }
    ], 'Save the note', async v => { if (await ctx.attempt('addFact', { convId, kind: v.kind, text: v.text, status: v.status })) ctx.renderAll(); })));
    return box;
  }

  function timeline(convId) {
    const list = el('ol', { class: 'timeline' });
    Engine.timeline(ctx.db(), convId).forEach(item => {
      if (item.kind === 'event') {
        const e = item.event;
        list.appendChild(el('li', {}, el('span', { class: 'hint', text: date(Engine.todayIn(CONFIG.timeZone, new Date(e.at))) + ', ' + Engine.who(e.actor) }), el('span', { text: e.detail + (e.outcome ? ' (' + e.outcome + ')' : '') })));
        return;
      }
      const m = item.msg;
      const head = (m.direction === 'in' ? 'Received' : L.msg[m.status]) + ', ' + m.channel + (m.category ? ', ' + (CONFIG.responses.find(r => r.id === m.category) || {}).label : '');
      const text = m.body || m.summary || (m.noText ? 'No text was pasted.' : '');
      const body = el('details', {}, el('summary', { text: head }), m.subject ? el('p', { text: 'Subject: ' + m.subject }) : null, el('p', { class: 'msg', text }), el('p', { class: 'hint', text: 'Source: ' + Engine.who(m.source || 'Usha') + '. Recorded by ' + Engine.who(m.actor) + '.' }));
      list.appendChild(el('li', { 'data-status': m.status }, el('span', { class: 'hint', text: date(Engine.todayIn(CONFIG.timeZone, new Date(item.at))) }), body));
    });
    return list;
  }

  function meetingCalendar(m, cancelled) {
    const db = ctx.db(), contact = db.contacts[m.contactId] || {}, org = db.orgs[m.orgId] || {}, conv = db.convs[m.convId] || {};
    ctx.saveFile('email-kit-meeting-' + m.date + '.ics', Rules.meetingFile(m, [contact.name, org.name].filter(Boolean).join(', '), conv.topic, !!cancelled), 'text/calendar');
  }

  function meetings(conv) {
    const box = el('div', {});
    const list = Engine.rows(ctx.db(), 'meetings').filter(m => m.convId === conv.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    list.forEach(m => {
      box.appendChild(el('p', { text: L.meeting[m.status] + ': ' + Engine.meetingText(m) + (m.sequence ? ', changed ' + m.sequence + (m.sequence === 1 ? ' time' : ' times') : '') }));
      const row = el('div', { class: 'track-actions' });
      if (m.status === 'confirmed') row.append(button('Add to calendar', () => meetingCalendar(m)), button('We held it', async () => { if (await ctx.attempt('meetingHeld', { convId: conv.id })) ctx.renderAll(); }));
      if (['confirmed', 'proposed'].includes(m.status)) row.append(button('Cancel it', async () => {
        const wasConfirmed = m.status === 'confirmed';
        const out = await ctx.attempt('cancelMeeting', { convId: conv.id, why: '' });
        if (!out) return;
        ctx.renderAll();
        if (wasConfirmed) ctx.showToast('The meeting is cancelled. Remove it from your calendar.', { label: 'Save a cancellation file', run: () => meetingCalendar(ctx.db().meetings[m.id], true) });
      }));
      box.appendChild(row);
    });
    if (!Engine.ENDED.includes(conv.status)) box.appendChild(button(list.some(m => ['confirmed', 'proposed'].includes(m.status)) ? 'Change the meeting' : 'Record a meeting', () => {
      const m = list.find(x => ['confirmed', 'proposed'].includes(x.status)) || {};
      openStep('Meeting details', [
        { name: 'date', label: 'Date', type: 'date', value: m.date || '' }, { name: 'time', label: 'Time', type: 'time', value: m.time || '' },
        { name: 'zone', label: 'Time zone', type: 'select', options: [{ id: '', label: 'Not clear yet' }].concat(CONFIG.zones), value: m.zone || '' },
        { name: 'state', label: 'Status', type: 'select', options: [{ id: 'proposed', label: 'Proposed, not yet agreed' }, { id: 'confirmed', label: 'Confirmed by both sides' }], value: m.status || 'proposed' }
      ], 'Save the meeting', async v => {
        if (await ctx.attempt('setMeeting', { convId: conv.id, date: v.date, time: v.time, zone: v.zone, mode: m.mode || 'call', confirmed: v.state === 'confirmed' })) ctx.renderAll();
      });
    }));
    return box;
  }

  function dataUrlBlob(url) {
    const [head, body] = url.split(',');
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, type: (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream' };
  }

  function sources(conv) {
    const box = el('div', {});
    const list = Engine.rows(ctx.db(), 'sources').filter(r => r.convId === conv.id);
    list.forEach(r => {
      const li = el('div', { class: 'source' });
      if (r.url && /^https?:\/\//i.test(r.url)) li.appendChild(el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.label || r.url }));
      else li.appendChild(el('strong', { text: r.label || r.url }));
      if (r.summary) li.appendChild(el('p', { text: r.summary }));
      if (r.quote) li.appendChild(el('blockquote', { text: r.quote }));
      const row = el('div', { class: 'track-actions' });
      if (r.fileId) row.appendChild(button('Open the file', async () => {
        const f = await Store.getFile(r.fileId);
        if (!f) { ctx.showToast('Email Kit could not find this file.'); return; }
        const d = dataUrlBlob(f.data);
        ctx.saveFile(f.name, d.bytes, d.type);
      }));
      row.appendChild(button('Remove', async () => {
        const out = await ctx.attempt('removeSource', { id: r.id });
        if (out && out.result) await Store.deleteFiles([out.result]);
        if (out) ctx.renderAll();
      }));
      li.appendChild(row);
      box.appendChild(li);
    });
    const file = el('input', { type: 'file', hidden: true, 'aria-label': 'Choose a file to attach' });
    file.addEventListener('change', () => { attach(conv.id, file.files[0]); file.value = ''; });
    box.append(el('div', { class: 'track-actions' },
      button('Add a source', () => openStep('Add a source', [
        { name: 'label', label: 'What is it?' }, { name: 'url', label: 'Link', type: 'url' },
        { name: 'summary', label: 'Your summary', type: 'area' }, { name: 'quote', label: 'Exact wording, if it matters', type: 'area' }
      ], 'Save the source', async v => { if (await ctx.attempt('addSource', Object.assign({ convId: conv.id, kind: /linkedin/i.test(v.url) ? 'post' : 'link' }, v))) ctx.renderAll(); })),
      button('Attach a file', () => file.click())), file);
    return box;
  }

  function attach(convId, file) {
    if (!file) return;
    if (file.size > MAX_FILE) { ctx.showToast('That file is over 5 MB, so Email Kit did not attach it.'); return; }
    const reader = new FileReader();
    reader.onerror = () => ctx.showToast('Email Kit could not read that file, so nothing was attached.');
    reader.onload = async () => {
      const id = 'file' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try {
        await Store.putFile(id, file.name, file.type, reader.result);
      } catch (e) { ctx.showToast('Email Kit could not store that file, so nothing was attached.'); return; }
      const out = await ctx.attempt('addSource', { convId, kind: 'attachment', label: file.name, fileId: id, fileType: file.type, size: file.size });
      if (!out) await Store.deleteFiles([id]);
      ctx.renderAll();
    };
    reader.readAsDataURL(file);
  }

  function contactPanel(contact) {
    const db = ctx.db();
    const box = el('div', {});
    box.appendChild(el('p', { text: 'Contact details: ' + (contact.contact || 'None recorded') }));
    box.appendChild(el('h4', { text: 'Employment history' }));
    box.appendChild(el('ul', { class: 'facts' }, contact.affiliations.map(a => {
      const org = db.orgs[a.orgId];
      return el('li', { text: (org ? org.name : 'Unknown company') + (a.designation ? ', ' + a.designation : '') + ', from ' + date(a.from) + (a.to ? ' to ' + date(a.to) : ', current') + (a.verified ? '' : ', not verified') });
    })));
    const current = contact.affiliations.find(a => a.current);
    const row = el('div', { class: 'track-actions' });
    if (contact.status === 'moved') row.append(button('Verify the new employer', () => openStep('Verify the new employer', [
      { name: 'company', label: 'New company', value: current && db.orgs[current.orgId] ? db.orgs[current.orgId].name : '' }, { name: 'designation', label: 'Their designation' }
    ], 'Confirm the new employer', async v => { if (await ctx.attempt('verifyEmployer', { contactId: contact.id, company: v.company, designation: v.designation })) ctx.renderAll(); })));
    else if (contact.status === 'active' && contact.affiliations.length > 1 && current && !Engine.rows(db, 'convs').some(c => c.contactId === contact.id && c.orgId === current.orgId) && !Engine.rows(db, 'suppressions').some(x => x.status === 'active' && x.contactId === contact.id)) row.append(button('Start at ' + (db.orgs[(current || {}).orgId] || {}).name, () => ctx.startAtNewCompany(contact)));
    if (contact.status !== 'moved') row.append(button('They changed employer', () => openStep('Record a change of employer', [
      { name: 'company', label: 'New company, if known' }, { name: 'designation', label: 'Their designation, if known' }
    ], 'Record the change', async v => { if (await ctx.attempt('changeEmployer', { contactId: contact.id, company: v.company, designation: v.designation })) ctx.renderAll(); })));
    row.append(button('Correct the details', () => openStep('Correct the details', [
      { name: 'name', label: 'Name', value: contact.name }, { name: 'detail', label: 'Email or mobile number', value: contact.contact }, { name: 'designation', label: 'Designation', value: contact.designation }
    ], 'Save the details', async v => { if (await ctx.attempt('renameContact', { id: contact.id, name: v.name, contact: v.detail, designation: v.designation })) ctx.renderAll(); })));
    if (current && db.orgs[current.orgId]) row.append(button('Rename the company', () => openStep('Rename the company', [{ name: 'name', label: 'Company name', value: db.orgs[current.orgId].legalName || db.orgs[current.orgId].name }], 'Save the name', async v => { if (await ctx.attempt('renameOrg', { id: current.orgId, name: v.name })) ctx.renderAll(); })));
    row.append(button('Delete this contact', async function () {
      if (this.dataset.armed !== 'yes') { this.dataset.armed = 'yes'; this.textContent = 'Confirm: delete this contact and history'; return; }
      const out = await ctx.attempt('deleteContact', { id: contact.id });
      if (!out) return;
      close();
      ctx.renderAll();
      ctx.showToast('The contact and history are deleted. Any Do not contact mark stays.', { label: 'Undo', run: () => ctx.undo(out.changes, 'The contact is back.') });
    }));
    box.appendChild(row);
    return box;
  }

  function section(title, node, open) {
    return el('details', { class: 'sub', open }, el('summary', { text: title }), node);
  }

  function header(name) {
    return el('div', { class: 'record-head' }, el('h3', { id: 'recordName', text: name }), button('Hide', close));
  }

  function renderConversation() {
    const db = ctx.db(), conv = db.convs[openConv], box = $('recordBox');
    if (!conv) { close(); return; }
    const contact = db.contacts[conv.contactId], org = db.orgs[conv.orgId];
    const last = Engine.rows(db, 'msgs').filter(m => m.convId === conv.id && !['superseded', 'cancelled'].includes(m.status)).sort((a, b) => a.at.localeCompare(b.at)).pop();
    const draftMsg = Engine.rows(db, 'msgs').find(m => m.convId === conv.id && ['draft', 'ready'].includes(m.status));
    box.textContent = '';
    box.appendChild(header([contact.name, org.name].filter(Boolean).join(', ')));
    if (conv.topic) box.appendChild(el('p', { class: 'hint', text: title(conv.topic) }));
    const dl = el('dl', { class: 'status' });
    const row = (k, v) => dl.append(el('dt', { text: k }), el('dd', { text: v }));
    row('Contact', L.contact[contact.status]);
    row('Conversation', L.conv[conv.status]);
    row('Last message', last ? L.msg[last.status] + ', ' + date(Engine.todayIn(CONFIG.timeZone, new Date(last.at))) : 'None');
    if (conv.next) {
      row('Next action', conv.next.action);
      row('Owner', Engine.who(conv.next.owner));
      row('Due', conv.next.due ? date(conv.next.due) : 'No date set');
      row('Reason', conv.next.reason);
    } else row('Outcome', conv.outcome || 'No next step is set.');
    box.appendChild(dl);

    const actions = el('div', { class: 'track-actions' });
    const replyOnly = Engine.ENDED.includes(conv.status);
    if (draftMsg) actions.append(button('Review the saved draft', () => { ctx.continueEntry({ id: conv.id }, draftMsg); }));
    if (conv.lastType || conv.pending) actions.append(button(replyOnly ? 'They replied' : 'Continue', () => ctx.continueEntry({ id: conv.id })));
    if (conv.referredName && Engine.rows(db, 'tasks').some(t => t.convId === conv.id && t.kind === 'referral' && t.status === 'open')) actions.append(button('Contact ' + conv.referredName, () => ctx.prepareReferred({ id: conv.id })));
    const human = conv.next && conv.next.owner !== 'Usha' ? conv.next : null;
    if (human && human.due) actions.append(button('Add to calendar', () => ctx.saveFile('email-kit-follow-up-' + human.due + '.ics', Rules.calendarFile({ id: conv.id, nextDate: human.due, recipientName: contact.name, company: org.name }), 'text/calendar')));
    if (conv.status === 'deliveryFailure') actions.append(button('Correct the address', () => openStep('Correct the address', [{ name: 'detail', label: 'Email or mobile number', value: contact.contact }], 'Save and try again', async v => { if (await ctx.attempt('addressFixed', { convId: conv.id, contact: v.detail })) ctx.renderAll(); })));
    if (!replyOnly && (conv.lastType || conv.pending)) {
      actions.append(button('Postpone', () => openStep('Postpone this', [{ name: 'date', label: 'New date', type: 'date' }, { name: 'reason', label: 'Reason' }], 'Postpone', async v => { if (await ctx.attempt('postpone', { convId: conv.id, date: v.date, reason: v.reason })) ctx.renderAll(); })));
      actions.append(button('Close the conversation', () => openStep('Close this conversation', [{ name: 'outcome', label: 'Outcome', value: conv.pendingOutcome || '' }], 'Close the conversation', async v => { if (await ctx.attempt('closeConversation', { convId: conv.id, outcome: v.outcome })) ctx.renderAll(); })));
    }
    if (conv.status === 'wrongContact' && conv.next) actions.append(button('Close the conversation', async () => { if (await ctx.attempt('closeConversation', { convId: conv.id, outcome: conv.pendingOutcome || 'Not the right contact' })) ctx.renderAll(); }));
    if (conv.mandateStatus) row('Mandate', conv.mandateStatus + ' · ' + conv.mandateRef);
    actions.append(button('Record mandate stage', () => openStep('Employer opportunity', [
      {name:'status',label:'Stage',type:'select',options:['Qualified','Proposal sent','Won','Lost'].map(id => ({id,label:id})), value:conv.mandateStatus || 'Qualified'},
      {name:'reference',label:'Agreed hiring need, proposal or CRM reference',value:conv.mandateRef || ''}
    ], 'Save mandate stage', async values => { if (await ctx.attempt('setMandate',Object.assign({convId:conv.id},values))) ctx.renderAll(); })));
    box.appendChild(actions);
    box.appendChild(el('div', { id: 'recordStep', class: 'step', hidden: true }));
    box.appendChild(section('What we know', facts(conv.id), true));
    box.appendChild(section('History', timeline(conv.id)));
    box.appendChild(section('Meeting', meetings(conv)));
    box.appendChild(section('Sources and attachments', sources(conv)));
    box.appendChild(section('Contact and employer', contactPanel(contact)));
    box.appendChild(el('div', { class: 'track-actions' }, button('Delete this conversation', async function () {
      if (this.dataset.armed !== 'yes') { this.dataset.armed = 'yes'; this.textContent = 'Confirm: delete this conversation'; return; }
      ctx.removeEntry({ id: conv.id });
      close();
    })));
    box.hidden = false;
  }

  function renderContactOnly() {
    const db = ctx.db(), contact = db.contacts[openContact], box = $('recordBox');
    if (!contact) { close(); return; }
    box.textContent = '';
    const aff = contact.affiliations.find(a => a.current) || contact.affiliations[0] || {};
    const org = db.orgs[aff.orgId];
    box.appendChild(header([contact.name || 'Unnamed contact', org && org.name].filter(Boolean).join(', ')));
    box.appendChild(el('dl', { class: 'status' }, el('dt', { text: 'Contact' }), el('dd', { text: L.contact[contact.status] })));
    const convs = Engine.rows(db, 'convs').filter(c => c.contactId === contact.id);
    convs.forEach(c => box.appendChild(button(title(c.topic || 'Conversation') + ': ' + L.conv[c.status], () => showConversation(c.id), 'plain')));
    if (!convs.length) box.appendChild(el('p', { class: 'hint', text: 'No messages yet. Email Kit has not contacted this person.' }));
    box.appendChild(el('div', { id: 'recordStep', class: 'step', hidden: true }));
    box.appendChild(contactPanel(contact));
    box.hidden = false;
  }

  function close() {
    openConv = ''; openContact = '';
    $('recordBox').hidden = true;
    $('recordBox').textContent = '';
  }
  function reveal() {
    signature = '';
    ctx.renderAll();
    $('recordBox').scrollIntoView({ block: 'start' });
    $('recordBox').focus();
  }
  function showConversation(id) { openConv = id; openContact = ''; reveal(); }
  function showContact(id) { openContact = id; openConv = ''; reveal(); }

  /* ---------- Panel ---------- */
  function render() {
    const db = ctx.db();
    const convs = Object.keys(db.convs).length, people = Object.keys(db.contacts).length;
    const marks = Engine.rows(db, 'suppressions').filter(x => x.status === 'active').length;
    $('trackerBox').hidden = !convs && !people && !marks;
    const mark = [Object.keys(db.events).length, Object.keys(db.tasks).length, convs, people, marks, today(), Engine.rows(db, 'tasks').filter(t => t.status === 'open').length, Engine.rows(db, 'queue').filter(q => q.status !== 'done').length, navigator.onLine, $('clientSearch').value].join('|');
    const tab = document.querySelector('input[name=clientTab]:checked').value;
    $('panelToday').hidden = tab !== 'today';
    $('panelFolders').hidden = tab !== 'folders';
    $('panelLimits').hidden = tab !== 'limits';
    if (mark === signature) return;
    signature = mark;
    const items = renderActions();
    const due = items.filter(a => !a.future).length;
    $('trackerSummary').textContent = 'Clients: ' + due + ' due, ' + convs + (convs === 1 ? ' conversation' : ' conversations');
    renderFolders();
    if (openConv) renderConversation();
    else if (openContact) renderContactOnly();
    if (document.body.dataset.ready) {
      const count = Object.keys(db.convs).length;
      const text = $('storageText');
      if (text.textContent) text.textContent = text.textContent.replace(/\d+ conversations?\./, count + (count === 1 ? ' conversation.' : ' conversations.'));
    }
  }

  /* ---------- Follow-up rules ---------- */
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function showRules() {
    const s = Engine.settingsOf(ctx.db());
    $('setFirst').value = s.firstReminder; $('setFinal').value = s.finalReminder; $('setAfterReply').value = s.afterReply;
    $('setClose').value = s.closeAfterFinal; $('setMax').value = s.maxReminders; $('setZone').value = s.timeZone; $('setOwner').value = s.owner;
    const box = $('setDays');
    box.textContent = '';
    DAYS.forEach((d, i) => box.appendChild(el('label', { class: 'check' }, el('input', { type: 'checkbox', id: 'off-' + i, checked: s.weekendDays.includes(i) }), el('span', { text: d }))));
  }
  async function saveRules() {
    const num = id => parseInt($(id).value, 10);
    const out = await ctx.attempt('updateSettings', { settings: {
      firstReminder: num('setFirst'), finalReminder: num('setFinal'), afterReply: num('setAfterReply'), closeAfterFinal: num('setClose'), maxReminders: num('setMax'),
      timeZone: $('setZone').value, owner: $('setOwner').value.trim(), weekendDays: DAYS.map((d, i) => i).filter(i => $('off-' + i).checked)
    } });
    if (out) { $('rulesStatus').textContent = 'The rules are saved.'; ctx.say('The rules are saved.'); ctx.renderAll(); }
  }

  async function showRecovery() {
    const list = await Store.snapshots();
    const box = $('recoveryList');
    box.textContent = '';
    box.textContent = '';
    list.forEach(p => box.appendChild(el('li', {}, el('span', { text: date(p.id) }), button('Restore', async () => {
      const raw = await Store.snapshotData(p.id);
      if (!raw) { ctx.showToast('That recovery point is no longer available.'); return; }
      const state = JSON.parse(raw);
      const data = { app: 'usha', schema: 3 };
      Engine.TABLES.forEach(t => { data[t] = Object.values(state[t] || {}); });
      await ctx.restoreData(data);
    }))));
    $('recoverySection').hidden = list.length === 0;
  }

  /* ---------- A readable folder, as a zip file ---------- */
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.path), data = f.bytes || enc.encode(f.text), crc = crc32(data);
      const common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      const local = Uint8Array.from([].concat(u32(0x04034b50), common));
      parts.push(local, name, data);
      central.push({ head: Uint8Array.from([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name });
      offset += local.length + name.length + data.length;
    });
    const start = offset;
    let size = 0;
    central.forEach(c => { parts.push(c.head, c.name); size += c.head.length + c.name.length; });
    parts.push(Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(size), u32(start), u16(0))));
    const total = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total);
    let at = 0;
    parts.forEach(p => { out.set(p, at); at += p.length; });
    return out;
  }
  async function exportFolder() {
    const files = Engine.folderFiles(ctx.db(), today());
    for (const f of files) {
      if (!f.fileId) continue;
      const stored = await Store.getFile(f.fileId);
      if (stored) f.bytes = dataUrlBlob(stored.data).bytes;
      else f.text = 'This attachment could not be found.';
    }
    const name = 'email-kit-clients-' + today() + '.zip';
    if (await ctx.saveFile(name, zip(files), 'application/zip')) ctx.backupNote('The readable folder is saved as ' + name + '. Email Kit still treats its own database as the record.');
  }

  async function importContacts(file) {
    if (!file) return;
    if (file.size > MAX_FILE) { ctx.backupNote('That file is over 5 MB, so nothing was imported.'); return; }
    const parsed = Rules.contactsFromCsv(await file.text());
    if (parsed.error) { ctx.backupNote(parsed.error + ' Nothing was imported.'); return; }
    const out = await ctx.attempt('importContacts', { rows: parsed.rows, source: 'imported from ' + file.name });
    if (!out) { ctx.backupNote('Nothing was imported.'); return; }
    const r = out.result;
    ctx.backupNote('Email Kit added ' + r.added + ', found ' + r.existing + ' already on record, and flagged ' + r.review + ' for review.' + (r.skipped ? ' It skipped ' + r.skipped + ' with no company.' : '') + (r.restricted ? ' ' + r.restricted + ' remain restricted, and an import cannot change that.' : ''));
    ctx.renderAll();
  }

  function init(context) {
    ctx = context;
    $('saveRules').addEventListener('click', saveRules);
    $('exportFolder').addEventListener('click', exportFolder);
    $('importContacts').addEventListener('click', () => $('contactsFile').click());
    $('contactsFile').addEventListener('change', e => { importContacts(e.target.files[0]); e.target.value = ''; });
    $('eraseAll').addEventListener('click', async function () {
      if (this.dataset.armed !== 'yes') { this.dataset.armed = 'yes'; this.textContent = 'Confirm: delete everything except Do not contact marks'; return; }
      this.dataset.armed = ''; this.textContent = 'Delete all client records';
      const out = await ctx.attempt('eraseAll', {});
      if (!out) return;
      await Store.eraseFiles();
      close();
      ctx.renderAll();
      ctx.backupNote('All client records are deleted. Do not contact marks remain.');
    });
  }

  return { init, render, showRules, showRecovery, showConversation, showContact, meetingCalendar };
})();
