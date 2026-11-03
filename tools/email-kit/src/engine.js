/* ==========================================================================
   CLIENT RECORDS AND COMMUNICATION LIFECYCLE. No interface code in this block.

   The records form one structure: organisation, contact, conversation. Every
   change runs as one command that returns a list of changes. Nothing reaches
   memory or storage until the whole command has succeeded, so a failed
   command leaves no half-written records.

   Three statuses stay separate because they describe different things:
   a contact (who they are to us), a conversation (where it stands) and a
   message (what happened to that message).
   ========================================================================== */
const Engine = (function () {
  const TABLES = ['orgs', 'contacts', 'convs', 'msgs', 'events', 'tasks', 'meetings', 'facts', 'sources', 'suppressions', 'queue', 'meta'];

  const LABELS = {
    conv: {
      draft: 'Draft', ready: 'Ready for review', awaiting: 'Sent, awaiting a response', followUpDue: 'Follow-up due',
      responseReceived: 'Response received', interested: 'Interested', clarification: 'Clarification needed', postponed: 'Postponed',
      meetingProposed: 'Meeting proposed', meetingConfirmed: 'Meeting confirmed', completed: 'Meeting completed',
      noResponse: 'No response', wrongContact: 'Wrong contact', referred: 'Referred to another person', changedEmployer: 'Changed employer',
      deliveryFailure: 'Delivery failure', optedOut: 'Opted out', closed: 'Closed'
    },
    msg: { draft: 'Draft', ready: 'Ready for review', sent: 'Sent', failed: 'Delivery failed', received: 'Received', superseded: 'Replaced', cancelled: 'Cancelled' },
    contact: { active: 'Active', wrongContact: 'Wrong contact', moved: 'Changed employer, not verified', optedOut: 'Opted out', review: 'Restriction under review' },
    fact: { requirement: 'Requirement', decision: 'Decision', commitment: 'Commitment', question: 'Open question', objection: 'Objection', note: 'Note' },
    factStatus: { confirmed: 'Confirmed', proposed: 'Proposed', unresolved: 'Unresolved', resolved: 'Resolved', corrected: 'Corrected' },
    meeting: { proposed: 'Proposed', confirmed: 'Confirmed', cancelled: 'Cancelled', completed: 'Completed' }
  };

  /* Which conversation status may follow which. Anything else is refused, so
     a draft cannot become sent, and a proposed meeting cannot jump to completed. */
  const RESPONSES = ['responseReceived', 'interested', 'clarification', 'postponed', 'meetingProposed', 'meetingConfirmed', 'completed', 'wrongContact', 'referred', 'changedEmployer', 'deliveryFailure', 'optedOut', 'closed'];
  const ALLOWED = {
    draft: ['ready', 'awaiting', 'responseReceived', 'closed'],
    ready: ['draft', 'awaiting', 'responseReceived', 'closed'],
    awaiting: ['followUpDue', 'noResponse'].concat(RESPONSES),
    followUpDue: ['awaiting', 'noResponse'].concat(RESPONSES),
    responseReceived: ['awaiting', 'followUpDue'].concat(RESPONSES),
    interested: ['awaiting', 'followUpDue', 'noResponse'].concat(RESPONSES),
    clarification: ['awaiting', 'followUpDue', 'noResponse'].concat(RESPONSES),
    postponed: ['awaiting', 'followUpDue', 'noResponse'].concat(RESPONSES),
    meetingProposed: ['awaiting', 'followUpDue', 'noResponse'].concat(RESPONSES),
    meetingConfirmed: ['awaiting', 'followUpDue'].concat(RESPONSES),
    completed: ['awaiting', 'followUpDue', 'noResponse'].concat(RESPONSES),
    deliveryFailure: ['awaiting', 'followUpDue', 'ready'].concat(RESPONSES),
    /* A closed conversation reopens only on a real response. */
    noResponse: RESPONSES,
    wrongContact: RESPONSES,
    referred: RESPONSES,
    changedEmployer: RESPONSES,
    closed: RESPONSES,
    /* An opt-out ends only through an explicit opt-in. */
    optedOut: ['closed']
  };
  const ENDED = ['noResponse', 'wrongContact', 'changedEmployer', 'optedOut', 'closed'];
  const FOLLOW_KINDS = ['reminder', 'final', 'checkIn', 'nudge', 'resume', 'askDate'];

  const SETTINGS = () => ({
    firstReminder: CONFIG.cadence.firstReminder, finalReminder: CONFIG.cadence.finalReminder, afterReply: CONFIG.cadence.afterReply,
    closeAfterFinal: CONFIG.closeAfterFinal, maxReminders: CONFIG.maxReminders, weekendDays: CONFIG.weekendDays.slice(), timeZone: CONFIG.timeZone, owner: ''
  });

  class EngineError extends Error {}
  const refuse = msg => { throw new EngineError(msg); };

  /* ---------- Small helpers ---------- */
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const lower = s => norm(s).toLowerCase();
  function hash(text) {
    const t = lower(text);
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + '-' + t.length.toString(36);
  }
  /* 'Usha' is the stored name of the system actor (kept so records from the
     earlier app stay valid). People see it as Email Kit. */
  const who = v => (v === 'Usha' ? 'Email Kit' : v);
  const newId = prefix => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function todayIn(zone, date) {
    const d = date || new Date();
    try {
      const p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { return d.toISOString().slice(0, 10); }
  }

  function emptyState() {
    const s = {};
    TABLES.forEach(t => { s[t] = {}; });
    return s;
  }
  const rows = (state, table) => Object.values(state[table] || {});
  /* Saved rules that fail the test are ignored, so they can never stop the app. */
  const settingsOf = state => {
    const merged = Object.assign(SETTINGS(), (state.meta && state.meta.settings && state.meta.settings.value) || {});
    return settingsError(merged) ? SETTINGS() : merged;
  };

  /* The only valid form of the rules. A backup is held to the same test. */
  function settingsError(next) {
    if (!next || typeof next !== 'object') return 'The follow-up rules are not valid.';
    if (['firstReminder', 'finalReminder', 'afterReply', 'closeAfterFinal'].some(k => !Number.isInteger(next[k]) || next[k] < 1 || next[k] > 60)) return 'Follow-up gaps must be whole working days from 1 to 60.';
    if (!Number.isInteger(next.maxReminders) || next.maxReminders < 0 || next.maxReminders > 5) return 'The maximum number of reminders must be from 0 to 5.';
    if (!Array.isArray(next.weekendDays) || next.weekendDays.length > 5 || next.weekendDays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Keep at least two working days.';
    try { new Intl.DateTimeFormat('en-GB', { timeZone: next.timeZone }); } catch (e) { return 'That time zone is not recognised.'; }
    return '';
  }

  /* Rules read CONFIG, so saved settings are applied there. */
  function applySettings(state) {
    const s = settingsOf(state);
    CONFIG.cadence.firstReminder = s.firstReminder;
    CONFIG.cadence.finalReminder = s.finalReminder;
    CONFIG.cadence.afterReply = s.afterReply;
    CONFIG.closeAfterFinal = s.closeAfterFinal;
    CONFIG.maxReminders = s.maxReminders;
    CONFIG.weekendDays = s.weekendDays.slice();
    CONFIG.timeZone = s.timeZone;
    return s;
  }

  /* ---------- One command, all or nothing ---------- */
  function begin(state, ctx) {
    const overlay = {};
    const now = ctx.now || new Date().toISOString();
    const settings = settingsOf(state);
    const tx = {
      now,
      today: ctx.today || todayIn(settings.timeZone, new Date(now)),
      actor: ctx.actor || settings.owner || 'Consultant',
      source: ctx.source || 'form',
      settings,
      get(table, id) {
        const o = overlay[table];
        if (o && id in o) return o[id] ? clone(o[id]) : null;
        return state[table][id] ? clone(state[table][id]) : null;
      },
      put(table, rec, keepTime) {
        overlay[table] = overlay[table] || {};
        overlay[table][rec.id] = keepTime ? clone(rec) : Object.assign(clone(rec), { updatedAt: now });
        return rec;
      },
      del(table, id) {
        overlay[table] = overlay[table] || {};
        overlay[table][id] = null;
      },
      /* Copies, so a command that fails later has changed nothing. */
      all(table) { return tx.raw(table).map(clone); },
      /* The live rows, for reading only. */
      raw(table) {
        const map = Object.assign({}, state[table], overlay[table] || {});
        return Object.values(map).filter(Boolean);
      },
      log(type, refs, detail, outcome, key) {
        const event = { id: newId('e'), at: now, actor: tx.actor, source: tx.source, type, detail: detail || '', outcome: outcome || '', key: key || '', orgId: refs.orgId || '', contactId: refs.contactId || '', convId: refs.convId || '' };
        overlay.events = overlay.events || {};
        overlay.events[event.id] = event;
        return event;
      }
    };
    tx.changes = () => {
      const out = [];
      Object.keys(overlay).forEach(table => Object.keys(overlay[table]).forEach(id => {
        out.push({ table, id, value: overlay[table][id], prev: state[table][id] || null });
      }));
      return out;
    };
    return tx;
  }
  const clone = v => JSON.parse(JSON.stringify(v));

  function applyChanges(state, changes) {
    changes.forEach(c => {
      if (c.value) state[c.table][c.id] = c.value;
      else delete state[c.table][c.id];
    });
  }
  const invert = changes => changes.map(c => ({ table: c.table, id: c.id, value: c.prev, prev: c.value }));

  function run(state, name, args, ctx) {
    const tx = begin(state, ctx || {});
    const result = COMMANDS[name](tx, args || {});
    return { result, changes: tx.changes() };
  }

  function move(tx, conv, to, why) {
    if (conv.status === to) return conv;
    if (!(ALLOWED[conv.status] || []).includes(to)) refuse('A conversation cannot move from "' + LABELS.conv[conv.status] + '" to "' + LABELS.conv[to] + '".');
    const from = conv.status;
    conv.status = to;
    tx.log('status', conv, LABELS.conv[from] + ' to ' + LABELS.conv[to], why || '');
    return conv;
  }

  /* ---------- Finding the organisation and contact ---------- */
  /* Two different full names on one mailbox are two people. */
  function sameName(a, b) {
    if (!a || !b) return true;
    if (a === b || a.split(' ').sort().join(' ') === b.split(' ').sort().join(' ')) return true;
    const x = a.split(' '), y = b.split(' ');
    if (x.length < 2 || y.length < 2) return Rules.namesOverlap(a, b);
    return x[x.length - 1] === y[y.length - 1] && Rules.namesOverlap(x[0], y[0]);
  }
  function findContact(people, keys, orgId, answer) {
    const atOrg = c => (c.affiliations || []).some(a => a.orgId === orgId && a.current);
    const known = c => [c.nameKey].concat(c.aliases || []);
    if (keys.contact) {
      const byKey = people.find(c => (c.keys || []).includes(keys.contact) && sameName(c.nameKey, keys.name));
      if (byKey && atOrg(byKey)) return { contact: byKey };
      if (byKey) return { contact: null, review: { kind: 'employer', otherId: byKey.id, why: 'The address ' + keys.contact + ' belongs to ' + (byKey.name || 'an earlier contact') + '.' } };
    }
    if (keys.name) {
      const exact = people.find(c => known(c).includes(keys.name) && atOrg(c));
      /* The same name with a new address may be someone else. It joins the record only once confirmed. */
      if (exact && keys.contact && exact.keys.length && !exact.keys.includes(keys.contact) && answer !== 'same') {
        return answer === 'different' ? { contact: null } : { contact: null, review: { kind: 'duplicate', otherId: exact.id, why: 'The name matches ' + exact.name + ', but the address is new.' } };
      }
      if (exact) return { contact: exact };
      const near = people.find(c => c.nameKey && atOrg(c) && Rules.namesOverlap(c.nameKey, keys.name) && c.nameKey.split(' ').pop() === keys.name.split(' ').pop());
      if (near) return { contact: null, review: { kind: 'duplicate', otherId: near.id, why: 'The name is close to ' + near.name + ', who is already on record at this company.' } };
      const elsewhere = keys.name.includes(' ') ? people.find(c => known(c).includes(keys.name)) : null;
      if (elsewhere) return { contact: null, review: { kind: 'employer', otherId: elsewhere.id, why: elsewhere.name + ' is already on record at another company.' } };
      return { contact: null };
    }
    /* A company with no name given may mean a different person each time. */
    return { contact: null };
  }

  /* A known name with an address not on record needs one answer. */
  function addressQuestion(state, s) {
    if (s.addressAnswer) return null;
    const k = Rules.prospectKey(s);
    if (!k.name || !k.contact) return null;
    const org = rows(state, 'orgs').find(o => (o.keys || []).includes(k.company));
    if (!org) return null;
    return rows(state, 'contacts').find(c => [c.nameKey].concat(c.aliases || []).includes(k.name) && c.affiliations.some(a => a.orgId === org.id && a.current) && c.keys.length && !c.keys.includes(k.contact)) || null;
  }

  /* Read-only. Used to show what a save would do. */
  function resolve(state, s) {
    const k = Rules.prospectKey(s);
    const org = rows(state, 'orgs').find(o => (o.keys || []).includes(k.company)) || null;
    const people = rows(state, 'contacts');
    const found = org ? findContact(people, k, org.id, s.addressAnswer) : findContact(people, k, '', s.addressAnswer);
    return { org, contact: found.contact || null, review: found.review || null, keys: k };
  }

  function addReview(tx, review, refs, question) {
    const key = 'review:' + review.kind + ':' + review.otherId + ':' + (refs.contactId || '');
    if (tx.all('tasks').some(t => t.key === key)) return;
    tx.put('tasks', {
      id: newId('t'), key, kind: 'review', status: 'open', convId: refs.convId || '', contactId: refs.contactId || '', orgId: refs.orgId || '',
      title: question, reason: review.why, owner: tx.settings.owner || tx.actor, due: tx.today, createdAt: tx.now, review: { kind: review.kind, otherId: review.otherId }
    });
  }

  function party(tx, s) {
    const k = Rules.prospectKey(s);
    if (!k.company) refuse('Add the company name.');
    let org = tx.all('orgs').find(o => (o.keys || []).includes(k.company));
    if (!org) {
      org = { id: newId('o'), name: Rules.shortCompany(s.company), legalName: norm(s.company), keys: [k.company], industry: norm(s.industry), location: norm(s.location), createdAt: tx.now };
      tx.log('created', { orgId: org.id }, 'Organisation ' + org.name);
    } else {
      if (!org.industry && s.industry) org.industry = norm(s.industry);
      if (!org.location && s.location) org.location = norm(s.location);
    }
    tx.put('orgs', org);
    const found = findContact(tx.all('contacts'), k, org.id, s.addressAnswer);
    let contact = found.contact;
    if (!contact) {
      contact = {
        id: newId('c'), name: Rules.parseName(s.recipientName, '').full, nameKey: k.name, aliases: [], title: Rules.parseName(s.recipientName, s.recipientTitle).title, contact: norm(s.recipientContact), keys: k.contact ? [k.contact] : [],
        designation: norm(s.designation), responsibility: s.responsibility || 'unknown', status: 'active',
        affiliations: [{ orgId: org.id, designation: norm(s.designation), from: tx.today, to: '', current: true, verified: true }], createdAt: tx.now
      };
      tx.log('created', { orgId: org.id, contactId: contact.id }, 'Contact ' + (contact.name || 'at ' + org.name));
      if (found.review) addReview(tx, found.review, { orgId: org.id, contactId: contact.id }, found.review.kind === 'employer' ? 'Is ' + (contact.name || 'this contact') + ' the same person who has moved company?' : 'Is ' + (contact.name || 'this contact') + ' a duplicate of an existing contact?');
    } else {
      fillContact(contact, s, k);
    }
    tx.put('contacts', contact);
    return { org, contact };
  }

  function fillContact(contact, s, k) {
    if (!contact.name && k.name) { contact.name = Rules.parseName(s.recipientName, '').full; contact.nameKey = k.name; }
    const title = Rules.parseName(s.recipientName, s.recipientTitle).title;
    if (!contact.title && title) contact.title = title;
    if (k.contact && !(contact.keys || []).includes(k.contact)) { contact.keys = (contact.keys || []).concat(k.contact); contact.contact = norm(s.recipientContact); }
    if (norm(s.designation) && !contact.designation) contact.designation = norm(s.designation);
    if (s.responsibility && contact.responsibility === 'unknown') contact.responsibility = s.responsibility;
  }

  /* A loaded conversation already knows who it belongs to, even after a move. */
  function partyFor(tx, s) {
    const conv = s.activeRecordId ? tx.get('convs', s.activeRecordId) : null;
    if (!conv) return party(tx, s);
    const contact = tx.get('contacts', conv.contactId);
    /* A different name changes nothing here. The consultant answers that first. */
    fillContact(contact, s, Rules.prospectKey(s));
    tx.put('contacts', contact);
    return { org: tx.get('orgs', conv.orgId), contact };
  }

  /* What a draft was written for, so it reopens as exactly that message. */
  const DRAFT_FIELDS = ['stage', 'channel', 'responseCategory', 'responseText', 'agreedDate', 'agreedStep', 'askTopics', 'referredName', 'referredRole', 'referralPermission', 'meetingAction', 'meetingDate', 'meetingTime', 'meetingZone', 'meetingMode', 'movedTo', 'optOutScope', 'optOutChannels', 'noReplyRequested', 'includeTerms', 'accepted', 'followTask', 'promise', 'owedAnswer', 'resend', 'priorChannel', 'priorType'];
  const draftContext = s => { const c = {}; DRAFT_FIELDS.forEach(k => { if (s[k] !== undefined) c[k] = s[k]; }); return c; };

  const FORM_FIELDS = ['recipientTitle', 'recipientName', 'recipientContact', 'company', 'designation', 'responsibility', 'industry', 'location', 'roles', 'hiringLocations', 'hiringType', 'reason', 'observation', 'sourceUrl', 'sourceQuote', 'includeSource', 'dateChecked', 'verification', 'postAuthor', 'referrer', 'referrerConsent', 'conversationWhen', 'desired', 'whatsappConsent'];
  const formOf = s => { const f = {}; FORM_FIELDS.forEach(k => { if (s[k] !== undefined) f[k] = s[k]; }); return f; };

  function newConversation(tx, org, contact, s) {
    const conv = {
      id: newId('v'), orgId: org.id, contactId: contact.id, status: 'draft', channel: s.channel || 'email', subject: '', topic: '', lastType: '', lastSentAt: '', attempts: 0,
      termsSentAt: '', resumeOn: '', outcome: '', pendingOutcome: '', referredBy: s.referredBy || '', form: formOf(s), next: null, createdAt: tx.now
    };
    tx.log('created', conv, 'Conversation opened');
    return conv;
  }

  /* An open conversation is reused. A second one is never created by a repeat. */
  function conversationFor(tx, s, org, contact) {
    if (s.activeRecordId) {
      const conv = tx.get('convs', s.activeRecordId);
      if (conv) return conv;
    }
    const open = tx.all('convs').filter(c => c.contactId === contact.id && c.orgId === org.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return open.find(c => !ENDED.includes(c.status)) || open.find(c => c.lastType) || newConversation(tx, org, contact, s);
  }

  /* A follow-up typed by hand may refer to a message Email Kit never recorded. */
  function ensurePrior(tx, conv, s) {
    if (tx.all('msgs').some(m => m.convId === conv.id && m.direction === 'out' && ['sent', 'failed'].includes(m.status))) return;
    if (s.stage !== 'followup' || s.activeRecordId) return;
    /* A first message still in draft was never sent, whatever the form now says. */
    if (tx.all('msgs').some(m => m.convId === conv.id && m.direction === 'out' && m.type === 'first' && ['draft', 'ready'].includes(m.status))) return;
    if (![s.priorDate, s.priorSubject, s.priorText, s.priorTopic].some(norm)) return;
    const at = s.priorDate || tx.today;
    tx.put('msgs', {
      id: newId('m'), convId: conv.id, direction: 'out', status: 'sent', type: s.priorType || 'first', channel: s.priorChannel || 'email', subject: norm(s.priorSubject), body: String(s.priorText || ''), summary: Rules.deriveTopic(s),
      hash: hash(s.priorText || ''), at: at + 'T09:00:00.000Z', sentAt: at + 'T09:00:00.000Z', actor: tx.actor, source: 'typed by the consultant', imported: true, createdAt: tx.now
    });
    conv.lastType = s.priorType || 'first';
    conv.lastSentAt = at;
    conv.channel = s.priorChannel || conv.channel;
    conv.subject = norm(s.priorSubject) || conv.subject;
    conv.topic = Rules.deriveTopic(s) || conv.topic;
    conv.attempts = s.priorType === 'reminder' ? 1 : 0;
    if (conv.status === 'draft' || conv.status === 'ready') move(tx, conv, 'awaiting', 'An earlier message was recorded by hand.');
    tx.log('imported', conv, 'Earlier message recorded by hand, dated ' + at);
  }

  /* ---------- Tasks and the next action ---------- */
  const TASK = {
    confirmReply: ['Confirm the reply you pasted', 'A reply is saved, but its category is not confirmed yet.'],
    sendDraft: ['Review and send the draft', 'This draft has not been sent.'],
    answerOwed: ['Send the answer you promised', 'You told them you would reply separately.'],
    askDate: ['Ask again for a suitable date', 'They asked you to wait, but no date is agreed.'],
    resend: ['Send the message again', 'The earlier message did not reach them.'],
    reminder: ['Prepare a reminder', 'No reply has arrived since the last message.'],
    final: ['Prepare the final reminder', 'No reply has arrived, and this is the last message in the sequence.'],
    closeOut: ['Close as no response', 'The final reminder has had no reply.'],
    checkIn: ['Make the agreed contact', 'You agreed this date with them.'],
    nudge: ['Check whether they want to continue', 'They have not replied to your last message.'],
    resume: ['Contact them again', 'They asked you to wait until this date.'],
    reply: ['Reply to their message', 'Their response has not been answered yet.'],
    referral: ['Contact the person they named', 'They referred you to this person.'],
    verifyEmployer: ['Verify the new employer', 'They may have moved, and outreach stays stopped until this is confirmed.'],
    fixAddress: ['Check the address or number', 'The last message did not reach them.'],
    meeting: ['Attend the meeting', 'The meeting is confirmed.'],
    meetingOutcome: ['Record the meeting outcome', 'The meeting date has passed.'],
    meetingClarify: ['Agree the meeting details', 'The date, time or time zone is not settled.'],
    review: ['Review this', 'Email Kit could not decide this safely.']
  };

  function addTask(tx, conv, kind, due, extra) {
    const t = TASK[kind];
    const task = Object.assign({
      id: newId('t'), kind, status: 'open', convId: conv.id, contactId: conv.contactId, orgId: conv.orgId, title: t[0], reason: t[1],
      owner: kind === 'closeOut' ? 'Usha' : (tx.settings.owner || tx.actor), due, createdAt: tx.now, key: ''
    }, extra || {});
    tx.put('tasks', task);
    return task;
  }

  /* A promise you made survives new replies, until you keep it or the conversation ends. */
  function closeTasks(tx, conv, kinds, status, why, keepPromise) {
    tx.all('tasks').filter(t => t.convId === conv.id && t.status === 'open' && (!kinds || kinds.includes(t.kind)) && (!t.promise || !kinds || keepPromise === false)).forEach(t => {
      t.status = status; t.resolvedAt = tx.now; t.resolution = why;
      tx.put('tasks', t);
    });
  }

  /* Drafts and queued items that a new event has made obsolete. */
  function cancelObsolete(tx, conv, why) {
    closeTasks(tx, conv, FOLLOW_KINDS.concat(['closeOut']), 'cancelled', why);
    tx.all('msgs').filter(m => m.convId === conv.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status)).forEach(m => {
      m.status = 'cancelled'; m.cancelReason = why;
      tx.put('msgs', m);
    });
    tx.all('queue').filter(q => q.convId === conv.id && ['waiting', 'ready'].includes(q.status)).forEach(q => {
      q.status = 'cancelled'; q.reason = why; q.checkedAt = tx.now;
      tx.put('queue', q);
    });
  }

  /* Every conversation ends in an outcome or a named next step. */
  function setNext(tx, conv) {
    const open = tx.all('tasks').filter(t => t.convId === conv.id && t.status === 'open').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const human = open.find(t => t.owner !== 'Usha') || open[0];
    conv.next = human ? { action: human.title, owner: human.owner, due: human.due, reason: human.reason, kind: human.kind, taskId: human.id } : null;
    tx.put('convs', conv);
  }

  function nextFollowKind(attempts, max) {
    if (attempts >= max) return '';
    return attempts === max - 1 ? 'final' : 'reminder';
  }

  function scheduleReminder(tx, conv, from) {
    const kind = nextFollowKind(conv.attempts, tx.settings.maxReminders);
    if (!kind) {
      addTask(tx, conv, 'closeOut', Rules.addWorkdays(from, tx.settings.closeAfterFinal));
      return;
    }
    const days = conv.attempts === 0 ? tx.settings.firstReminder : tx.settings.finalReminder;
    addTask(tx, conv, kind, Rules.addWorkdays(from, days));
  }

  function restrict(tx, refs, scope, channels, s, reason) {
    const contact = tx.get('contacts', refs.contactId);
    const org = tx.get('orgs', refs.orgId);
    const existing = tx.all('suppressions').find(x => x.status === 'active' && x.contactId === refs.contactId && x.scope === scope && String(x.channels) === String(channels || []));
    if (existing) return existing;
    const entry = Object.assign({
      id: newId('x'), scope, channels: channels || [], status: 'active', contactId: refs.contactId, orgId: refs.orgId,
      name: contact ? contact.name : '', company: org ? org.name : '', date: tx.today, reason: reason || '', source: tx.source, createdAt: tx.now
    }, keysFor(contact, org, tx));
    /* A company restriction covers that company only, not this person's past employers. */
    if (scope === 'organisation' && org) entry.companyKeys = org.keys.slice();
    tx.put('suppressions', entry);
    tx.log('restriction', refs, 'Restriction recorded: ' + (CONFIG.optOutScopes.find(o => o.id === scope) || {}).label + (channels && channels.length ? ' (' + channels.join(', ') + ')' : ''));
    return entry;
  }

  /* Every name, address and company a person has used. A restriction keeps its
     own copy, so renaming or deleting a record can never loosen it. */
  function keysFor(contact, org, tx) {
    const orgKeys = [];
    if (org) orgKeys.push(...org.keys);
    if (contact) contact.affiliations.forEach(a => { const o = tx.get('orgs', a.orgId); if (o) orgKeys.push(...o.keys); });
    return {
      nameKey: contact ? contact.nameKey : '', companyKey: org ? org.keys[0] : '', contactKey: contact && contact.keys[0] || '',
      nameKeys: contact ? Array.from(new Set([contact.nameKey].concat(contact.aliases || []))) : [''],
      contactKeys: contact ? contact.keys.slice() : [],
      companyKeys: Array.from(new Set(orgKeys))
    };
  }
  function freezeKeys(tx, contactId) {
    const contact = tx.get('contacts', contactId);
    if (!contact) return;
    tx.all('suppressions').filter(x => x.contactId === contactId).forEach(x => {
      const now = keysFor(contact, tx.get('orgs', x.orgId), tx);
      x.nameKeys = Array.from(new Set((x.nameKeys || []).concat(now.nameKeys)));
      x.contactKeys = Array.from(new Set((x.contactKeys || []).concat(now.contactKeys)));
      x.companyKeys = Array.from(new Set((x.companyKeys || []).concat(now.companyKeys)));
      tx.put('suppressions', x);
    });
  }

  /* Stops other live conversations that a restriction now covers. */
  function stopCovered(tx, entry, why) {
    tx.all('convs').filter(c => {
      if (ENDED.includes(c.status)) return false;
      if (entry.scope === 'organisation') return c.orgId === entry.orgId;
      if (entry.scope === 'channel') return false;
      return c.contactId === entry.contactId;
    }).forEach(c => {
      cancelObsolete(tx, c, why);
      closeTasks(tx, c, null, 'cancelled', why);
      if (['draft', 'ready'].includes(c.status)) { c.status = 'closed'; c.outcome = why; tx.log('status', c, 'Draft closed', why); } else if (entry.scope !== 'review') { move(tx, c, 'optedOut', why); c.outcome = why; }
      setNext(tx, c);
    });
  }

  function upsertMeeting(tx, conv, s, status) {
    /* Any meeting in play replaces reminders and queued drafts. */
    cancelObsolete(tx, conv, 'A meeting is being arranged.');
    let m = tx.all('meetings').find(x => x.convId === conv.id && ['proposed', 'confirmed'].includes(x.status));
    const fresh = { date: s.meetingDate || '', time: s.meetingTime || '', zone: s.meetingZone || '', mode: s.meetingMode || 'call' };
    if (!m) {
      m = Object.assign({ id: newId('g'), convId: conv.id, contactId: conv.contactId, orgId: conv.orgId, status, sequence: 0, history: [], createdAt: tx.now }, fresh);
      tx.log('meeting', conv, 'Meeting ' + status + ': ' + meetingText(m));
    } else {
      const changed = ['date', 'time', 'zone', 'mode'].some(k => fresh[k] && fresh[k] !== m[k]);
      if (changed) {
        m.history.push({ date: m.date, time: m.time, zone: m.zone, status: m.status, at: tx.now });
        if (m.status === 'confirmed') m.sequence += 1;
        ['date', 'time', 'zone', 'mode'].forEach(k => { if (fresh[k]) m[k] = fresh[k]; });
        tx.log('meeting', conv, 'Meeting changed: ' + meetingText(m));
      }
      if (m.status !== status) tx.log('meeting', conv, 'Meeting ' + status + ': ' + meetingText(m));
      m.status = status;
    }
    tx.put('meetings', m);
    return m;
  }

  function meetingText(m) {
    const zone = (CONFIG.zones.find(z => z.id === m.zone) || {}).label || '';
    return [Rules.formatDate(m.date, ''), Rules.formatTime(m.time), zone.split(',')[0]].filter(Boolean).join(', ') || 'details not agreed';
  }

  /* A confirmed meeting replaces earlier reminders with a single dated task. */
  function confirmMeeting(tx, conv, s) {
    const m = upsertMeeting(tx, conv, s, 'confirmed');
    closeTasks(tx, conv, ['meeting', 'meetingOutcome', 'meetingClarify'], 'cancelled', 'The meeting details changed.');
    cancelObsolete(tx, conv, 'A meeting is confirmed.');
    addTask(tx, conv, 'meeting', m.date, { meetingId: m.id });
    move(tx, conv, 'meetingConfirmed', 'Date, time and time zone are agreed.');
    return m;
  }

  function cancelMeetingTx(tx, conv, why) {
    const m = tx.all('meetings').find(x => x.convId === conv.id && ['proposed', 'confirmed'].includes(x.status));
    if (!m) return null;
    m.status = 'cancelled'; m.cancelledAt = tx.now; m.sequence += 1;
    tx.put('meetings', m);
    /* A draft that confirms this meeting must not survive it. */
    tx.all('msgs').filter(x => x.convId === conv.id && x.direction === 'out' && ['draft', 'ready'].includes(x.status)).forEach(x => { x.status = 'cancelled'; x.cancelReason = 'The meeting was cancelled.'; tx.put('msgs', x); });
    closeTasks(tx, conv, ['meeting', 'meetingOutcome', 'meetingClarify'], 'cancelled', why);
    tx.log('meeting', conv, 'Meeting cancelled: ' + meetingText(m), why);
    return m;
  }

  /* ---------- What a response does ---------- */
  function applyResponse(tx, conv, s, msg) {
    const cat = s.responseCategory;
    const label = (CONFIG.responses.find(r => r.id === cat) || {}).label || cat;
    const reply = () => addTask(tx, conv, 'reply', tx.today);
    /* A narrow channel restriction leaves the rest of the conversation alone. */
    if (!(cat === 'optOut' && s.optOutScope === 'channel')) {
      cancelObsolete(tx, conv, 'A new response arrived: ' + label + '.');
      closeTasks(tx, conv, ['reply', 'fixAddress', 'referral', 'meetingClarify'], 'cancelled', 'Replaced by the latest response.');
    }
    conv.pendingOutcome = '';
    /* A reply still unanswered carries its questions into the next one. */
    const earlier = conv.pending && conv.pending.msgId !== msg.id ? conv.pending : null;
    const earlierMsg = earlier && earlier.msgId ? tx.get('msgs', earlier.msgId) : null;
    const askTopics = Array.from(new Set((earlier ? earlier.fields.askTopics || [] : []).concat(s.askTopics || [])));
    const wantsTerms = !!earlier && !conv.termsSentAt && (earlier.category === 'commercial' || !!earlier.fields.includeTerms || (!!earlierMsg && Rules.interpret(earlierMsg.body, tx.today).matches.includes('commercial')));
    conv.pending = cat === 'optOut' ? null : { category: cat, msgId: msg.id, fields: { includeTerms: wantsTerms, agreedDate: s.agreedDate || '', agreedStep: s.agreedStep || '', referredName: s.referredName || '', referredRole: s.referredRole || '', referralPermission: s.referralPermission || 'unclear', askTopics, meetingAction: s.meetingAction || 'accept', meetingDate: s.meetingDate || '', meetingTime: s.meetingTime || '', meetingZone: s.meetingZone || '', meetingMode: s.meetingMode || 'call', movedTo: s.movedTo || '' } };
    switch (cat) {
      case 'interested': case 'commercial':
        move(tx, conv, 'interested', label); reply(); break;
      case 'moreInfo':
        move(tx, conv, 'clarification', label); reply(); break;
      case 'postponed':
        move(tx, conv, 'postponed', s.agreedDate ? 'They asked to wait until ' + s.agreedDate + '.' : 'They asked to wait, with no date.');
        conv.resumeOn = s.agreedDate || '';
        reply();
        break;
      case 'meeting':
        applyMeetingResponse(tx, conv, s, reply);
        break;
      case 'meetingHeld': {
        const m = tx.all('meetings').find(x => x.convId === conv.id && x.status === 'confirmed');
        if (!m) refuse('Only a confirmed meeting can be recorded as held. Record the meeting first.');
        m.status = 'completed'; m.completedAt = tx.now;
        tx.put('meetings', m);
        closeTasks(tx, conv, ['meeting', 'meetingOutcome'], 'done', 'The meeting took place.');
        move(tx, conv, 'completed', 'The meeting took place.');
        reply();
        break;
      }
      case 'referred':
        move(tx, conv, 'referred', 'Referred to ' + norm(s.referredName) + '.');
        conv.referredName = norm(s.referredName); conv.referredRole = norm(s.referredRole); conv.referralPermission = s.referralPermission || 'unclear';
        addTask(tx, conv, 'referral', tx.today, { title: 'Contact ' + norm(s.referredName), key: 'referral:' + conv.id + ':' + lower(s.referredName) });
        reply();
        break;
      case 'wrongContact': {
        move(tx, conv, 'wrongContact', 'They are not the right contact.');
        conv.pendingOutcome = 'Not the right contact';
        const contact = tx.get('contacts', conv.contactId);
        contact.status = 'wrongContact';
        tx.put('contacts', contact);
        reply();
        break;
      }
      case 'changedEmployer':
        tx.put('convs', conv);
        moveEmployer(tx, conv.contactId, s.movedTo, '', 'Their reply says they have moved.');
        Object.assign(conv, tx.get('convs', conv.id));
        reply();
        break;
      case 'noRequirement': case 'otherAgency': case 'notInterested':
        move(tx, conv, 'responseReceived', label);
        conv.pendingOutcome = label;
        reply();
        break;
      case 'optOut': applyOptOut(tx, conv, s, msg); break;
      case 'deliveryFailure': {
        const last = tx.all('msgs').filter(m => m.convId === conv.id && m.direction === 'out' && m.status === 'sent').sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
        if (last) { last.status = 'failed'; last.failedAt = tx.now; tx.put('msgs', last); }
        conv.attempts = Math.max(0, conv.attempts - (last && ['reminder', 'final'].includes(last.type) ? 1 : 0));
        conv.pending = null;
        conv.failedMsgId = last ? last.id : '';
        move(tx, conv, 'deliveryFailure', 'The last message did not reach them.');
        addTask(tx, conv, 'fixAddress', tx.today);
        break;
      }
      case 'unclear':
        move(tx, conv, 'clarification', 'Email Kit could not read the reply safely.');
        addTask(tx, conv, 'reply', tx.today, { title: 'Decide what this reply means', reason: 'The reply is saved, but it could not be read safely.' });
        break;
      default:
        move(tx, conv, 'responseReceived', label); reply();
    }
    addQuestions(tx, conv, msg);
    if (norm(s.agreedStep) && Rules.AGREED_CATS.includes(cat)) addFactTx(tx, conv, 'commitment', norm(s.agreedStep), 'proposed', msg.id);
    tx.log('response', conv, label, msg.imported ? 'Imported' : '', 'response:' + msg.hash + ':' + cat);
  }

  function applyMeetingResponse(tx, conv, s, reply) {
    if (s.meetingAction === 'cancel') {
      cancelMeetingTx(tx, conv, 'They asked to cancel.');
      move(tx, conv, 'clarification', 'The meeting was cancelled.');
      reply();
      return;
    }
    const clear = !Rules.missingMeeting(s).length;
    if (clear && s.meetingAction === 'confirmed') confirmMeeting(tx, conv, s);
    else {
      upsertMeeting(tx, conv, s, 'proposed');
      closeTasks(tx, conv, ['meeting'], 'cancelled', 'The meeting is no longer confirmed.');
      move(tx, conv, 'meetingProposed', clear ? 'A meeting time has been proposed.' : 'The details are not complete.');
    }
    reply();
  }

  function applyOptOut(tx, conv, s, msg) {
    const scope = s.optOutScope || 'all';
    const channels = scope === 'channel' ? (s.optOutChannels || []) : [];
    if (scope === 'channel' && !channels.length) refuse('Tick the channels this restriction covers.');
    const contact = tx.get('contacts', conv.contactId);
    if (scope === 'review') {
      const entry = restrict(tx, conv, 'review', [], s, msg ? msg.body.slice(0, 200) : '');
      contact.status = 'review';
      tx.put('contacts', contact);
      cancelObsolete(tx, conv, 'A possible opt-out needs review.');
      addTask(tx, conv, 'review', tx.today, { title: 'Decide the scope of this restriction', reason: 'The wording may be an opt-out, but its scope is not clear. Outreach is paused until you decide.', key: 'review:restriction:' + entry.id, review: { kind: 'restriction', suppressionId: entry.id, messageId: msg && msg.id } });
      move(tx, conv, 'clarification', 'A possible opt-out needs review.');
      return;
    }
    const entry = restrict(tx, conv, scope, channels, s, msg ? msg.body.slice(0, 200) : '');
    if (scope === 'channel') {
      /* Only drafts on the restricted channel are obsolete. */
      tx.all('queue').filter(q => q.convId === conv.id && ['waiting', 'ready'].includes(q.status) && channels.includes(channelGroup(q.channel))).forEach(q => { q.status = 'cancelled'; q.reason = 'They restricted this channel.'; tx.put('queue', q); });
      tx.log('status', conv, 'Channel restricted', channels.join(', '));
      if (channels.includes(channelGroup(conv.channel))) {
        cancelObsolete(tx, conv, 'They restricted this channel.');
        closeTasks(tx, conv, ['reply', 'fixAddress'], 'cancelled', 'They restricted this channel.');
        addTask(tx, conv, 'reply', tx.today, { title: 'Decide whether another channel is appropriate', reason: 'They restricted the channel you used.' });
      }
      const fresh = tx.get('contacts', conv.contactId);
      if (fresh.status === 'review') { fresh.status = 'active'; tx.put('contacts', fresh); }
      return;
    }
    if (scope === 'organisation') {
      tx.put('convs', conv);
      stopCovered(tx, entry, 'This company asked for no further contact.');
      const fresh = tx.get('convs', conv.id);
      Object.assign(conv, fresh);
    }
    contact.status = 'optedOut';
    tx.put('contacts', contact);
    cancelObsolete(tx, conv, 'They asked for no further contact.');
    closeTasks(tx, conv, null, 'cancelled', 'They asked for no further contact.');
    if (conv.status !== 'optedOut') move(tx, conv, 'optedOut', 'They asked for no further contact.');
    conv.outcome = 'Opted out';
    if (scope === 'all') {
      tx.put('convs', conv);
      stopCovered(tx, entry, 'They asked for no further contact.');
      Object.assign(conv, tx.get('convs', conv.id));
    }
  }
  const channelGroup = ch => ({ email: 'email', invite: 'linkedin', message: 'linkedin', whatsapp: 'whatsapp' }[ch] || ch);

  function addQuestions(tx, conv, msg) {
    if (!msg || !msg.body) return;
    Rules.interpret(msg.body, tx.today).questions.forEach(q => {
      const key = 'question:' + hash(q) + ':' + conv.id;
      if (!tx.all('facts').some(f => f.key === key)) addFactTx(tx, conv, 'question', q, 'unresolved', msg.id, key);
    });
  }

  function addFactTx(tx, conv, kind, text, status, msgId, key) {
    const fact = { id: newId('f'), convId: conv.id, contactId: conv.contactId, orgId: conv.orgId, kind, text: norm(text), status, msgId: msgId || '', at: tx.now, actor: tx.actor, key: key || '', supersedes: '' };
    tx.put('facts', fact);
    tx.log('fact', conv, LABELS.fact[kind] + ': ' + fact.text, LABELS.factStatus[status]);
    return fact;
  }

  function moveEmployer(tx, contactId, company, designation, why) {
    const contact = tx.get('contacts', contactId);
    /* Correcting an unverified move replaces it and adds no second job. */
    if (contact.status === 'moved') contact.affiliations = contact.affiliations.filter(a => !(a.current && !a.verified));
    (contact.affiliations || []).forEach(a => { if (a.current) { a.current = false; a.to = tx.today; } });
    const held = tx.all('suppressions').some(x => x.status === 'active' && x.contactId === contactId);
    contact.status = held ? contact.status : 'moved';
    let org = null;
    if (norm(company)) {
      const key = Rules.companyKey(company);
      org = tx.all('orgs').find(o => o.keys.includes(key));
      if (!org) { org = { id: newId('o'), name: Rules.shortCompany(company), legalName: norm(company), keys: [key], industry: '', location: '', createdAt: tx.now }; tx.put('orgs', org); }
      contact.affiliations.push({ orgId: org.id, designation: norm(designation), from: tx.today, to: '', current: true, verified: false });
    }
    tx.put('contacts', contact);
    tx.log('employer', { contactId, orgId: org ? org.id : '' }, 'Change of employer recorded' + (org ? ': ' + org.name : ''), why);
    let anchor = null;
    tx.all('tasks').filter(t => t.contactId === contactId && t.kind === 'verifyEmployer' && t.status === 'open').forEach(t => { t.status = 'cancelled'; t.resolution = 'Replaced by newer details.'; tx.put('tasks', t); });
    tx.all('convs').filter(c => c.contactId === contactId && !ENDED.includes(c.status)).forEach(c => {
      cancelObsolete(tx, c, 'They have moved, so messages based on the old role stop.');
      closeTasks(tx, c, null, 'cancelled', 'They have moved.');
      if (['draft', 'ready'].includes(c.status)) { c.status = 'closed'; c.outcome = 'Changed employer'; } else { move(tx, c, 'changedEmployer', why); c.outcome = 'Changed employer'; }
      tx.put('convs', c);
      anchor = c;
      setNext(tx, c);
    });
    anchor = anchor || tx.all('convs').filter(c => c.contactId === contactId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (anchor) {
      addTask(tx, anchor, 'verifyEmployer', tx.today, { key: 'verify:' + contactId + ':' + tx.today, title: org ? 'Verify that ' + (contact.name || 'this contact') + ' now works at ' + org.name : 'Find out where ' + (contact.name || 'this contact') + ' now works' });
      setNext(tx, anchor);
    }
  }

  /* ---------- Rechecks before anything goes out ---------- */
  function recheck(state, conv, today, opts) {
    const o = opts || {};
    if (!conv) return { ok: true, reason: '' };
    const contact = state.contacts[conv.contactId];
    const list = rows(state, 'suppressions').filter(x => x.status === 'active' && (x.contactId === conv.contactId || (x.scope === 'organisation' && x.orgId === conv.orgId)));
    const channel = channelGroup(o.channel || conv.channel);
    const stop = list.find(x => x.scope !== 'channel' || x.channels.includes(channel));
    if (stop) return { ok: false, code: 'restricted', reason: stop.scope === 'review' ? 'A restriction on this contact needs review.' : 'This contact has a restriction that covers this message.' };
    if (conv.status === 'optedOut') return { ok: false, code: 'optedOut', reason: 'They asked for no further contact.' };
    if (contact && contact.status === 'moved') return { ok: false, code: 'moved', reason: 'This contact has moved company, and the new company is not verified.' };
    if (o.followUp) {
      if (conv.status === 'postponed' && conv.resumeOn && conv.resumeOn > today) return { ok: false, code: 'postponed', reason: 'They asked you to wait until ' + Rules.formatDate(conv.resumeOn, today) + '.' };
      if (conv.status === 'postponed' && !conv.resumeOn && o.followTask !== 'askDate') return { ok: false, code: 'postponed', reason: 'They asked you to wait. Agree a date first.' };
      if (['meetingProposed', 'meetingConfirmed'].includes(conv.status) && o.followTask !== 'meetingClarify') return { ok: false, code: 'meeting', reason: 'A meeting is in progress, so a reminder is not needed.' };
      if (conv.heldReply) return { ok: false, code: 'held', reason: 'A reply is waiting for you to confirm it.' };
      if (conv.status === 'deliveryFailure') return { ok: false, code: 'delivery', reason: 'The last message did not reach them. Correct the address first.' };
      if (['noResponse', 'closed', 'wrongContact', 'changedEmployer'].includes(conv.status)) return { ok: false, code: 'ended', reason: 'This conversation has ended.' };
    }
    if (o.msg) {
      const newer = rows(state, 'msgs').find(m => m.convId === conv.id && m.direction === 'in' && m.at > o.msg.createdAt && !o.reply);
      if (newer) return { ok: false, code: 'newer', reason: 'A newer response arrived after this draft was made.' };
    }
    return { ok: true, reason: '' };
  }

  /* The form no longer matches the conversation it was loaded from. */
  function differs(state, conv, s) {
    const contact = state.contacts[conv.contactId], org = state.orgs[conv.orgId];
    const k = Rules.prospectKey(s);
    const name = !!k.name && !!contact.nameKey && !sameSpelling(contact, k.name);
    const company = !!k.company && !org.keys.includes(k.company);
    return name || company;
  }
  const sameSpelling = (contact, key) => [contact.nameKey].concat(contact.aliases || []).includes(key);

  /* Blocks and notes added to the form's own validation. */
  function guards(state, s, today) {
    const blockers = [], notes = [];
    const conv = s.activeRecordId ? state.convs[s.activeRecordId] : null;
    const found = resolve(state, s);
    const contact = conv ? state.contacts[conv.contactId] : found.contact;
    const followup = s.stage === 'followup';
    const cat = followup ? s.responseCategory : '';
    if (conv && differs(state, conv, s)) blockers.push({ field: 'nameChoice', msg: 'These details differ from the conversation you opened. Choose whether this is a correction or a different person.' });
    if (contact && contact.status === 'moved' && !['optOut', 'changedEmployer'].includes(cat)) {
      const aff = (contact.affiliations || []).find(a => a.current);
      blockers.push({ field: 'employerVerify', msg: (contact.name || 'This contact') + ' has moved' + (aff && state.orgs[aff.orgId] ? ' to ' + state.orgs[aff.orgId].name : '') + ', and the new company is not verified. Verify it in the client record before writing.' });
    }
    if (conv && followup && cat === 'noResponse') {
      const check = recheck(state, conv, today, { followUp: true, channel: s.channel, followTask: s.followTask });
      if (!check.ok && !['restricted', 'moved', 'ended'].includes(check.code)) blockers.push({ field: 'responseCategory', msg: check.reason + ' Email Kit will not draft a reminder.' });
      const owed = rows(state, 'tasks').find(t => t.convId === conv.id && t.status === 'open' && ['reply', 'answerOwed'].includes(t.kind));
      if (owed) blockers.push({ field: 'responseCategory', msg: 'You still owe them a reply, so a reminder would be wrong. Choose the response category.' });
      const planned = rows(state, 'tasks').find(t => t.convId === conv.id && t.status === 'open' && FOLLOW_KINDS.includes(t.kind));
      if (planned && planned.due > today) notes.push({ msg: 'This follow-up is not due until ' + Rules.formatDate(planned.due, today) + '. Sending it now uses one of your reminders.', field: '' });
    }
    if (conv) history(state, conv, today, s).forEach(msg => notes.push({ msg, field: '' }));
    if (!conv && !followup && found.contact) {
      const declined = rows(state, 'convs').find(c => c.contactId === found.contact.id && c.status === 'closed' && c.orgId !== (found.org || {}).id);
      if (declined) notes.push({ msg: 'This person closed an earlier conversation: ' + (declined.outcome || 'closed') + '. Please check that you should write again.', field: '' });
    }
    return { blockers, notes, conv, contact };
  }

  /* What the record says before another message is written. */
  function history(state, conv, today, s) {
    const out = [];
    const facts = rows(state, 'facts').filter(f => f.convId === conv.id);
    facts.filter(f => f.kind === 'question' && f.status === 'unresolved').slice(-3).forEach(f => out.push('Open question from ' + Rules.formatDate(f.at.slice(0, 10), today) + ': ' + f.text));
    facts.filter(f => f.kind === 'commitment' && ['confirmed', 'proposed'].includes(f.status)).slice(-2).forEach(f => out.push('You said you would ' + f.text.replace(/\.$/, '') + '.'));
    facts.filter(f => f.kind === 'objection' && f.status !== 'corrected').slice(-2).forEach(f => out.push('Objection on record: ' + f.text));
    rows(state, 'meetings').filter(m => m.convId === conv.id && ['proposed', 'confirmed'].includes(m.status)).forEach(m => out.push('Meeting ' + m.status + ': ' + meetingText(m) + '.'));
    if (conv.termsSentAt && s && (s.includeTerms || s.responseCategory === 'commercial')) out.push('You already sent the commercial terms on ' + Rules.formatDate(conv.termsSentAt, today) + ', so you may not need to repeat them.');
    rows(state, 'suppressions').filter(x => x.status === 'active' && x.scope === 'channel' && x.contactId === conv.contactId).forEach(x => out.push('They restricted these channels: ' + x.channels.join(', ') + '.'));
    return out;
  }

  /* ---------- After a message goes out ---------- */
  function afterSend(tx, conv, s, type) {
    const cat = s.stage === 'followup' ? s.responseCategory : '';
    const reply = type === 'reply';
    /* A note about one channel changes nothing else, so the sequence keeps its place. */
    if (cat === 'optOut' && s.optOutScope === 'channel') { closeTasks(tx, conv, ['reply'], 'done', 'The message was sent.'); conv.pending = null; return; }
    const keptPromise = Rules.followKind(s) === 'promise';
    const answered = cat === 'moreInfo' && (!!s.owedAnswer || (s.askTopics || []).length > 0);
    closeTasks(tx, conv, FOLLOW_KINDS.concat(['reply', 'closeOut', 'fixAddress', 'sendDraft', 'resend', 'meetingClarify'], answered ? ['answerOwed'] : []), 'done', 'The message was sent.', keptPromise ? false : undefined);
    if (answered) conv.owedReply = null;
    const max = tx.settings.maxReminders;
    if (!reply) {
      const kind = Rules.followKind(s);
      /* A check-in or a nudge is followed by the final reminder, then the sequence ends. */
      if (type === 'final' || ['askDate', 'meetingChase'].includes(kind)) conv.attempts = max;
      else if (['checkIn', 'nudge', 'promise'].includes(kind)) conv.attempts = Math.max(0, max - 1);
      else if (type === 'reminder') conv.attempts = (conv.attempts || 0) + 1;
      conv.lastType = type;
      if (keptPromise) {
        conv.promise = '';
        tx.all('facts').filter(f => f.convId === conv.id && f.kind === 'commitment' && ['confirmed', 'proposed'].includes(f.status)).forEach(f => { f.status = 'resolved'; tx.put('facts', f); });
      }
      conv.resumeOn = '';
      if (conv.status !== 'awaiting') move(tx, conv, 'awaiting', 'A message was sent.');
      scheduleReminder(tx, conv, tx.today);
      return;
    }
    const held = conv.pending;
    conv.pending = null;
    /* A resent reply needs its usual check, and it uses no reminder. */
    if (s.resend) {
      conv.lastType = 'reply';
      addTask(tx, conv, 'nudge', Rules.addWorkdays(tx.today, tx.settings.afterReply));
      return;
    }
    const agreed = s.agreedDate && Rules.AGREED_CATS.includes(cat);
    if (agreed) {
      conv.lastType = 'agreed';
      conv.resumeOn = s.agreedDate;
      if (conv.status !== 'postponed' && !['meetingProposed', 'meetingConfirmed'].includes(conv.status)) move(tx, conv, 'postponed', 'You agreed a later date.');
      addTask(tx, conv, 'checkIn', s.agreedDate, norm(s.agreedStep) ? { title: 'Keep your promise: ' + norm(s.agreedStep), reason: 'You agreed this with them.', promise: true } : {});
      if (norm(s.agreedStep)) { confirmCommitment(tx, conv, s.agreedStep); conv.promise = norm(s.agreedStep); }
      return;
    }
    switch (cat) {
      case 'interested': case 'commercial': case 'moreInfo': case 'unclear': case 'meetingHeld':
        conv.lastType = 'reply';
        if (cat === 'unclear' || cat === 'moreInfo') { if (conv.status !== 'clarification') move(tx, conv, 'clarification', 'Waiting for their answer.'); }
        /* A holding reply is a promise, so the next step is the answer. */
        if (cat === 'moreInfo' && !(s.askTopics || []).length && held && !s.owedAnswer) {
          conv.owedReply = held;
          addTask(tx, conv, 'answerOwed', Rules.addWorkdays(tx.today, tx.settings.afterReply));
        } else if (!tx.raw('tasks').some(t => t.convId === conv.id && t.status === 'open' && t.promise)) addTask(tx, conv, 'nudge', Rules.addWorkdays(tx.today, tx.settings.afterReply));
        break;
      case 'postponed':
        conv.lastType = 'reply';
        addTask(tx, conv, 'askDate', Rules.addWorkdays(tx.today, tx.settings.afterReply));
        break;
      case 'meeting':
        conv.lastType = 'reply';
        if (s.meetingAction === 'cancel') {
          cancelMeetingTx(tx, conv, 'You cancelled the meeting.');
          if (conv.status !== 'clarification') move(tx, conv, 'clarification', 'The meeting was cancelled.');
          addTask(tx, conv, 'nudge', Rules.addWorkdays(tx.today, tx.settings.afterReply));
        } else if (!Rules.missingMeeting(s).length) {
          confirmMeeting(tx, conv, s);
        } else {
          addTask(tx, conv, 'meetingClarify', Rules.addWorkdays(tx.today, tx.settings.afterReply));
        }
        break;
      case 'referred': conv.lastType = 'closed'; conv.outcome = 'Referred to ' + (conv.referredName || norm(s.referredName)); break;
      case 'changedEmployer': conv.lastType = 'closed'; break;
      case 'wrongContact': case 'noRequirement': case 'otherAgency': case 'notInterested': {
        conv.lastType = 'closed';
        conv.outcome = conv.pendingOutcome || (CONFIG.responses.find(r => r.id === cat) || {}).label;
        if (norm(s.agreedStep) && !s.agreedDate) {
          conv.lastType = 'agreed';
          conv.resumeOn = Rules.addWorkdays(tx.today, tx.settings.afterReply);
          addTask(tx, conv, 'checkIn', conv.resumeOn, { title: norm(s.agreedStep) });
          if (conv.status !== 'postponed') move(tx, conv, 'postponed', 'You agreed a next step.');
          break;
        }
        if (cat !== 'wrongContact') move(tx, conv, 'closed', conv.outcome);
        break;
      }
      case 'optOut': conv.lastType = 'closed'; break;
      default:
        conv.lastType = 'reply';
    }
  }

  function confirmCommitment(tx, conv, text) {
    const key = lower(text);
    const fact = tx.all('facts').find(f => f.convId === conv.id && f.kind === 'commitment' && lower(f.text) === key);
    if (fact) { fact.status = 'confirmed'; tx.put('facts', fact); } else addFactTx(tx, conv, 'commitment', text, 'confirmed');
  }

  /* ---------- Commands ---------- */
  const COMMANDS = {
    /* Saves a generated draft. It records text. It never records a send. */
    saveDraft(tx, { s, body, subject, ready, auto }) {
      /* Generating again for the same form stays in the same conversation. */
      const linked = s.draftConvId ? tx.get('convs', s.draftConvId) : null;
      const linkedPerson = linked && tx.get('contacts', linked.contactId);
      const key = Rules.prospectKey(s);
      const same = linkedPerson && (tx.get('orgs', linked.orgId) || {keys: []}).keys.includes(key.company)
        && (!key.name || sameSpelling(linkedPerson, key.name)) && (!key.contact || (linkedPerson.keys || []).includes(key.contact));
      const { org, contact } = same ? { org: tx.get('orgs', linked.orgId), contact: tx.get('contacts', linked.contactId) } : partyFor(tx, s);
      const conv = same ? linked : conversationFor(tx, s, org, contact);
      conv.form = Object.assign({}, conv.form, formOf(s));
      if (!conv.topic) conv.topic = Rules.topicFor(s);
      /* The request made in the first message carries through its reminders. */
      if (!conv.lastType) conv.form.desired = Rules.buildContext(s, tx.today).desired || conv.form.desired;
      if (s.channel === 'email' && norm(subject) && !conv.subject) conv.subject = norm(subject);
      const h = hash(body);
      const open = tx.all('msgs').filter(m => m.convId === conv.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status));
      let msg = open.find(m => m.hash === h);
      open.filter(m => m !== msg).forEach(m => { m.status = 'superseded'; tx.put('msgs', m); });
      const status = ready ? 'ready' : 'draft';
      if (!msg) {
        msg = { id: newId('m'), convId: conv.id, direction: 'out', status, type: Rules.sentType(s), channel: s.channel, subject: norm(subject), body, hash: h, at: tx.now, actor: auto ? 'Usha' : tx.actor, source: auto ? 'prepared automatically' : tx.source, auto: !!auto, createdAt: tx.now, context: draftContext(s) };
        tx.log('draft', conv, 'Draft saved', '', 'draft:' + h);
      } else {
        msg.status = status; msg.subject = norm(subject); msg.body = body; msg.context = draftContext(s);
      }
      if (s.channel === 'whatsapp' && s.whatsappConsent && norm(s.waEvidence)) {
        const number = Rules.parseContact(s.waNumber).phone;
        if (number && !contact.keys.includes(number)) { contact.keys.push(number); tx.put('contacts',contact); }
      }
      msg.agencyVersion = s.agencyVersion;
      msg.waPermission = s.channel === 'whatsapp' && s.whatsappConsent ? {number: s.waNumber, evidence: s.waEvidence, recordedAt: tx.now, actor: tx.actor} : null;
      tx.put('msgs', msg);
      if (conv.status === 'draft' && ready) move(tx, conv, 'ready', 'The draft passed every check.');
      if (conv.status === 'ready' && !ready) move(tx, conv, 'draft', 'The draft needs more work.');
      if (!conv.lastType && !tx.all('tasks').some(t => t.convId === conv.id && t.kind === 'sendDraft' && t.status === 'open')) addTask(tx, conv, 'sendDraft', tx.today);
      setNext(tx, conv);
      return { convId: conv.id, msgId: msg.id, contactId: conv.contactId, orgId: conv.orgId };
    },

    /* The only way a message becomes sent. The user must ask for it. */
    markSent(tx, { s, convId, msgId, channel, subject, body }) {
      const conv = tx.get('convs', convId);
      if (!conv) refuse('Email Kit could not find this conversation.');
      const msg = tx.get('msgs', msgId);
      if (msg && msg.status === 'sent') return { duplicate: true, convId, next: conv.next };
      /* Only the draft on screen can become a sent message. */
      if (msg && !['draft', 'ready'].includes(msg.status)) refuse('This draft is no longer current, so Email Kit did not record it as sent. Generate it again.');
      const profile = tx.get('meta','agency');
      if (!profile || !msg || msg.convId !== convId || msg.agencyVersion !== profile.value.revision || !s.agencyVersion || s.agencyVersion !== CONFIG.profileVersion || profile.value.reviewBy < tx.today)
        refuse('Generate a new draft with the current approved agency profile.');
      if (channel !== s.channel || channel !== msg.channel || body !== msg.body) refuse('The draft or channel has changed. Generate it again.');
      if (channel === 'whatsapp' && (!msg.waPermission || !s.whatsappConsent || !Rules.parseContact(s.waNumber).phone || msg.waPermission.number !== s.waNumber || !norm(s.waEvidence))) refuse('Record the WhatsApp permission and destination first.');
      if (s.stage === 'followup' && s.responseCategory === 'optOut' && (s.noReplyRequested || s.optOutScope === 'review')) refuse('No acknowledgement is permitted.');
      ensurePrior(tx, conv, s);
      const type = Rules.sentType(s);
      /* An acknowledgement and a request to confirm a move are not outreach. */
      const courtesy = s.stage === 'followup' && ['optOut', 'changedEmployer'].includes(s.responseCategory);
      if (courtesy && s.responseCategory === 'optOut' && (s.priorChannel !== channel || Rules.detectNoReply(s.responseText))) refuse('No acknowledgement on this channel.');
      if (!courtesy) {
        const check = recheckTx(tx, conv, { channel, followUp: s.stage === 'followup' && s.responseCategory === 'noResponse', msg, reply: s.stage === 'followup' && s.responseCategory !== 'noResponse', followTask: s.followTask });
        if (!check.ok) refuse(check.reason + ' Email Kit did not record this as sent.');
      }
      if (channel === 'whatsapp' && !courtesy && Rules.findDoNotContact(suppressionView(transactionView(tx)), s)?.exact)
        refuse('This WhatsApp destination is restricted.');
      const rec = msg || { id: newId('m'), convId, direction: 'out', type, createdAt: tx.now, actor: tx.actor, source: tx.source };
      Object.assign(rec, { status: 'sent', type, channel, subject: norm(subject), body, hash: hash(body), at: tx.now, sentAt: tx.now, sentDate: tx.today });
      tx.put('msgs', rec);
      conv.lastSentAt = tx.today;
      conv.resend = '';
      conv.channel = channel;
      if (channel === 'email' && norm(subject)) conv.subject = norm(subject);
      if (CONFIG.commercial.lines.some(line => body.includes(line))) conv.termsSentAt = tx.today;
      if (s.stage === 'followup') closeAnswered(tx, conv, s);
      tx.log('sent', conv, type + ' by ' + channel, 'Sent', 'sent:' + rec.id);
      tx.all('queue').filter(q => q.msgId === rec.id && ['waiting', 'ready'].includes(q.status)).forEach(q => { q.status = 'done'; q.checkedAt = tx.now; tx.put('queue', q); });
      tx.all('msgs').filter(m => m.convId === convId && m.id !== rec.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status)).forEach(m => { m.status = 'superseded'; tx.put('msgs', m); });
      afterSend(tx, conv, s, type);
      setNext(tx, conv);
      const meeting = tx.all('meetings').find(m => m.convId === conv.id && m.status === 'confirmed');
      return { convId, msgId: rec.id, next: conv.next, status: conv.status, meetingId: meeting ? meeting.id : '' };
    },

    /* Reprocessing the same reply changes nothing. A new category is a correction. */
    processResponse(tx, { s, text, source }) {
      if (s.responseCategory === 'meeting' && Rules.interpret(text,tx.today).category === 'unclear' && !['change','cancel'].includes(s.meetingAction))
        refuse('The reply does not confirm a meeting. Clarify the date or record a cancellation.');
      const { org, contact } = partyFor(tx, s);
      const conv = conversationFor(tx, s, org, contact);
      ensurePrior(tx, conv, s);
      const cat = s.responseCategory;
      const body = String(text || '');
      const label = (CONFIG.responses.find(r => r.id === cat) || {}).label || cat;
      /* Coming back to a reply you still owe records nothing new. */
      if (!body && conv.pending && conv.pending.category === cat) return { duplicate: true, convId: conv.id, status: conv.status, next: conv.next, msgId: conv.pending.msgId };
      if (cat === 'optOut' && (s.optOutScope === 'review') && !body) refuse('Paste their wording, so that the restriction can be reviewed.');
      const h = hash(body || 'category:' + cat + ':' + tx.today);
      const existing = tx.all('msgs').find(m => m.convId === conv.id && m.direction === 'in' && m.hash === h);
      const detail = [cat, s.referredName, s.referralPermission, s.agreedDate, s.agreedStep, s.meetingAction, s.meetingDate, s.meetingTime, s.meetingZone, s.optOutScope, (s.optOutChannels || []).join(), s.movedTo].map(norm).join('|');
      if (existing && existing.detail === detail) return { duplicate: true, convId: conv.id, status: conv.status, next: conv.next, msgId: existing.id };
      let msg = existing;
      if (existing) {
        if (existing.category !== cat) reverseEffects(tx, conv, existing.category);
        if (existing.category !== cat) tx.log('correction', conv, 'Category corrected from "' + ((CONFIG.responses.find(r => r.id === existing.category) || {}).label || 'none') + '" to "' + label + '"');
        else tx.log('correction', conv, 'Details of the response corrected');
        msg.category = cat;
        msg.corrected = true;
      } else {
        msg = { id: newId('m'), convId: conv.id, direction: 'in', status: 'received', type: 'response', channel: s.priorChannel || conv.channel, subject: norm(s.priorSubject), body, hash: h, category: cat, at: tx.now, actor: 'Client', source: source || 'pasted', createdAt: tx.now, noText: !body };
      }
      msg.detail = detail;
      conv.heldReply = '';
      closeTasks(tx, conv, ['confirmReply'], 'done', 'The reply was confirmed.');
      tx.put('msgs', msg);
      if (['draft', 'ready'].includes(conv.status)) move(tx, conv, 'responseReceived', 'A reply arrived, and nothing has been recorded as sent.');
      applyResponse(tx, conv, s, msg);
      setNext(tx, conv);
      const latest = tx.get('convs', conv.id);
      if (latest.status !== conv.status) conv.status = latest.status;
      return { convId: conv.id, msgId: msg.id, status: conv.status, next: conv.next };
    },

    /* Runs when Email Kit opens, comes back online or the day changes. One conversation
       at a time, so a fault in one can never stop the others. Safe to repeat. */
    reconcileConversation(tx, { convId, sender, composer }) {
      const report = { overdue: 0, drafted: 0, closed: 0 };
      const today = tx.today;
      tx.all('tasks').filter(t => t.convId === convId && t.status === 'open' && t.due && t.due <= today).forEach(t => {
        const conv = tx.get('convs', t.convId);
        if (!conv) return;
        if (t.kind === 'closeOut') {
          /* Only a conversation still waiting can end as no response. */
          if (!['awaiting', 'followUpDue'].includes(conv.status)) {
            closeTasks(tx, conv, ['closeOut'], 'cancelled', 'The conversation has moved on.');
            tx.log('task', conv, 'A stale close-out was cancelled');
            setNext(tx, conv);
            return;
          }
          closeTasks(tx, conv, ['closeOut'], 'done', 'No reply arrived.');
          conv.outcome = 'No response';
          conv.lastType = 'closed';
          move(tx, conv, 'noResponse', 'The sequence ended with no reply.');
          setNext(tx, conv);
          report.closed++;
          return;
        }
        if (t.kind === 'meeting' && t.due < today) {
          closeTasks(tx, conv, ['meeting'], 'done', 'The meeting date passed.');
          addTask(tx, conv, 'meetingOutcome', today, { meetingId: t.meetingId });
          setNext(tx, conv);
          report.overdue++;
          return;
        }
        report.overdue++;
        if (!FOLLOW_KINDS.includes(t.kind)) return;
        if (['awaiting', 'interested', 'clarification', 'postponed'].includes(conv.status)) {
          if (conv.status === 'postponed') conv.lastDue = t.due;
          move(tx, conv, 'followUpDue', t.title + ' is due.');
          setNext(tx, conv);
        }
        if (composer && sender && sender.senderName && sender.senderRole) {
          const openDraft = tx.raw('msgs').some(m => m.convId === conv.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status));
          if (!openDraft && recheckTx(tx, tx.get('convs', conv.id), { followUp: true, followTask: t.kind }).ok) {
            const made = composer(formFor(tx, tx.get('convs', conv.id), sender));
            if (made) { COMMANDS.saveDraft(tx, { s: made.s, body: made.body, subject: made.subject, ready: false, auto: true }); report.drafted++; }
          }
        }
      });
      return report;
    },
    /* The same work as one command, for tools that want a single call. */
    reconcile(tx, { sender, composer }) {
      const total = { overdue: 0, drafted: 0, closed: 0, cancelled: 0, ready: 0, failed: 0 };
      const add = r => Object.keys(r).forEach(k => { total[k] += r[k]; });
      Array.from(new Set(tx.raw('tasks').filter(t => t.status === 'open' && t.due && t.due <= tx.today && t.convId).map(t => t.convId))).forEach(convId => {
        try { add(COMMANDS.reconcileConversation(tx, { convId, sender, composer })); } catch (e) { total.failed++; }
      });
      add(COMMANDS.reconcileQueue(tx));
      return total;
    },
    reconcileQueue(tx) {
      const report = { cancelled: 0, ready: 0 };
      tx.all('queue').filter(q => ['waiting', 'ready'].includes(q.status)).forEach(q => {
        const conv = tx.get('convs', q.convId), msg = tx.get('msgs', q.msgId);
        const check = !conv || !msg || !['draft', 'ready'].includes(msg.status) ? { ok: false, reason: 'The draft is no longer current.' } : recheckTx(tx, conv, { channel: q.channel, msg });
        if (!check.ok) { q.status = 'cancelled'; q.reason = check.reason; q.checkedAt = tx.now; report.cancelled++; tx.put('queue', q); tx.log('queue', conv || {}, 'A queued draft was cancelled', check.reason); }
        else if (check.ok && q.status === 'waiting') { q.checkedAt = tx.now; tx.put('queue', q); report.ready++; }
      });
      return report;
    },

    enqueue(tx, { convId, msgId, channel }) {
      if (tx.all('queue').some(q => q.msgId === msgId && ['waiting', 'ready'].includes(q.status))) return { duplicate: true };
      tx.put('queue', { id: newId('q'), convId, msgId, channel, status: 'waiting', reason: '', createdAt: tx.now, checkedAt: '' });
      tx.log('queue', tx.get('convs', convId), 'Draft queued to send later');
      return { ok: true };
    },
    finishQueue(tx, { id, status, reason }) {
      const q = tx.get('queue', id);
      if (q) { q.status = status; q.reason = reason || ''; q.checkedAt = tx.now; tx.put('queue', q); }
    },

    postpone(tx, { convId, date, reason }) {
      const conv = tx.get('convs', convId);
      if (!date) refuse('Add the date to come back to this.');
      if (date <= tx.today) refuse('Choose a date after today.');
      if (!norm(reason)) refuse('Add the reason for postponing, so the record explains it.');
      cancelObsolete(tx, conv, 'Postponed to ' + date + '.');
      closeTasks(tx, conv, ['reply', 'answerOwed', 'nudge', 'askDate'], 'cancelled', 'Postponed to ' + date + '.');
      conv.pending = null;
      if (conv.status !== 'postponed') move(tx, conv, 'postponed', norm(reason));
      /* Your own postponement agrees nothing with them, so the wording must not claim it. */
      conv.resumeOn = date;
      addTask(tx, conv, 'resume', date, { reason: norm(reason) });
      tx.log('postponed', conv, 'Postponed to ' + date, norm(reason));
      setNext(tx, conv);
    },
    closeConversation(tx, { convId, outcome }) {
      const conv = tx.get('convs', convId);
      if (!norm(outcome || conv.pendingOutcome)) refuse('Say why this conversation is closing.');
      cancelObsolete(tx, conv, 'The conversation was closed.');
      cancelMeetingTx(tx, conv, 'The conversation was closed.');
      closeTasks(tx, conv, null, 'cancelled', 'The conversation was closed.');
      conv.outcome = norm(outcome) || conv.pendingOutcome;
      conv.lastType = 'closed';
      if (conv.status === 'wrongContact') tx.log('status', conv, 'Closed', conv.outcome);
      else if (conv.status !== 'closed') move(tx, conv, 'closed', conv.outcome);
      setNext(tx, conv);
    },
    addressFixed(tx, { convId, contact: detail }) {
      const conv = tx.get('convs', convId);
      const contact = tx.get('contacts', conv.contactId);
      const key = Rules.prospectKey({ recipientContact: detail, recipientName: '', company: '' }).contact;
      if (!key) refuse('Add a valid email address or mobile number.');
      if (!contact.keys.includes(key)) contact.keys.push(key);
      contact.contact = norm(detail);
      tx.put('contacts', contact);
      closeTasks(tx, conv, ['fixAddress'], 'done', 'The address was corrected.');
      conv.form = Object.assign({}, conv.form, { recipientContact: norm(detail) });
      /* They never saw the message, so the same message goes again as a new draft. */
      /* After a real exchange the address worked, so only the failed message goes again. */
      const failed = conv.failedMsgId ? tx.get('msgs', conv.failedMsgId) : null;
      if (failed && failed.body && tx.all('msgs').some(m => m.convId === conv.id && m.direction === 'in' && m.category !== 'deliveryFailure')) {
        tx.put('msgs', { id: newId('m'), convId: conv.id, direction: 'out', status: 'ready', type: failed.type, channel: failed.channel, subject: failed.subject, body: failed.body, hash: hash(failed.body), at: tx.now, actor: tx.actor, source: 'copy of the failed message', agencyVersion: failed.agencyVersion, auto: true, resendOf: failed.id, createdAt: tx.now });
        conv.resend = failed.type;
        move(tx, conv, 'followUpDue', 'The address was corrected.');
        addTask(tx, conv, 'resend', tx.today);
        setNext(tx, conv);
        return;
      }
      /* Nothing has reached the new address, so the sequence starts again from the first message. */
      const opening = tx.all('msgs').filter(m => m.convId === conv.id && m.direction === 'out' && ['sent', 'failed'].includes(m.status) && m.body).sort((a, b) => a.at.localeCompare(b.at))[0];
      conv.lastType = ''; conv.lastSentAt = ''; conv.attempts = 0;
      if (opening) tx.put('msgs', { id: newId('m'), convId: conv.id, direction: 'out', status: 'ready', type: 'first', channel: opening.channel, subject: opening.subject, body: opening.body, hash: hash(opening.body), at: tx.now, actor: tx.actor, source: 'copy of the first message', agencyVersion: opening.agencyVersion, auto: true, resendOf: opening.id, createdAt: tx.now });
      move(tx, conv, 'ready', 'The address was corrected.');
      addTask(tx, conv, 'resend', tx.today);
      setNext(tx, conv);
    },
    resolveTask(tx, { id, status, why }) {
      const task = tx.get('tasks', id);
      if (!task || task.status !== 'open') return;
      task.status = status || 'done'; task.resolvedAt = tx.now; task.resolution = why || '';
      tx.put('tasks', task);
      const conv = task.convId && tx.get('convs', task.convId);
      if (conv) { tx.log('task', conv, task.title, status === 'cancelled' ? 'Cancelled' : 'Done'); setNext(tx, conv); }
    },

    setMeeting(tx, { convId, date, time, zone, mode, confirmed }) {
      const conv = tx.get('convs', convId);
      const s = { meetingDate: date, meetingTime: time, meetingZone: zone, meetingMode: mode };
      if (confirmed) {
        if (Rules.missingMeeting(s).length) refuse('A meeting needs a date, a time and a time zone before it can be confirmed.');
        confirmMeeting(tx, conv, s);
      } else {
        upsertMeeting(tx, conv, s, 'proposed');
        if (conv.status !== 'meetingProposed') move(tx, conv, 'meetingProposed', 'A meeting was proposed.');
        closeTasks(tx, conv, ['meetingClarify'], 'cancelled', 'Replaced by newer details.');
        addTask(tx, conv, 'meetingClarify', Rules.addWorkdays(tx.today, tx.settings.afterReply));
      }
      setNext(tx, conv);
    },
    meetingHeld(tx, { convId }) {
      const conv = tx.get('convs', convId);
      const m = tx.all('meetings').find(x => x.convId === convId && x.status === 'confirmed');
      if (!m) refuse('Only a confirmed meeting can be recorded as held.');
      m.status = 'completed'; m.completedAt = tx.now;
      tx.put('meetings', m);
      closeTasks(tx, conv, ['meeting', 'meetingOutcome'], 'done', 'The meeting took place.');
      move(tx, conv, 'completed', 'The meeting took place.');
      conv.pending = { category: 'meetingHeld', msgId: '', fields: {} };
      addTask(tx, conv, 'reply', tx.today, { title: 'Follow up on the meeting', reason: 'A short note keeps the agreed points on record.' });
      setNext(tx, conv);
    },
    cancelMeeting(tx, { convId, why }) {
      const conv = tx.get('convs', convId);
      cancelMeetingTx(tx, conv, norm(why) || 'Cancelled by the consultant.');
      if (['meetingProposed', 'meetingConfirmed'].includes(conv.status)) move(tx, conv, 'clarification', 'The meeting was cancelled.');
      conv.pending = { category: 'meeting', msgId: '', fields: { meetingAction: 'cancel', meetingDate: '', meetingMode: 'call' } };
      addTask(tx, conv, 'reply', tx.today, { title: 'Tell them the meeting is cancelled', reason: 'They may still expect it.' });
      setNext(tx, conv);
    },

    addFact(tx, { convId, kind, text, status }) {
      if (!norm(text)) refuse('Add the text of this note.');
      const conv = tx.get('convs', convId);
      return addFactTx(tx, conv, kind, text, status).id;
    },
    correctFact(tx, { id, text, status, why }) {
      const old = tx.get('facts', id);
      if (!old) refuse('Email Kit could not find this note.');
      const conv = tx.get('convs', old.convId);
      old.status = text && norm(text) !== old.text ? 'corrected' : status;
      if (text && norm(text) !== old.text) {
        const fresh = addFactTx(tx, conv, old.kind, text, status || 'confirmed', old.msgId);
        fresh.supersedes = old.id;
        tx.put('facts', fresh);
      }
      tx.put('facts', old);
      tx.log('correction', conv, 'Corrected: ' + old.text, norm(why));
    },

    addSource(tx, { convId, kind, label, url, summary, quote, fileId, fileType, size }) {
      if (!norm(label) && !norm(url)) refuse('Add a label or a link for this source.');
      const conv = tx.get('convs', convId);
      const key = hash([label, url, quote, fileId].join('|'));
      if (tx.all('sources').some(x => x.convId === convId && x.key === key)) return { duplicate: true };
      const rec = { id: newId('r'), convId, kind: kind || 'link', label: norm(label), url: norm(url), summary: norm(summary), quote: String(quote || '').trim(), fileId: fileId || '', fileType: fileType || '', size: size || 0, key, at: tx.now, actor: tx.actor };
      tx.put('sources', rec);
      tx.log('source', conv, 'Source added: ' + (rec.label || rec.url));
      return { id: rec.id };
    },
    removeSource(tx, { id }) {
      const rec = tx.get('sources', id);
      if (!rec) return null;
      tx.del('sources', id);
      tx.log('source', tx.get('convs', rec.convId) || {}, 'Source removed: ' + (rec.label || rec.url));
      return rec.fileId;
    },

    changeEmployer(tx, { contactId, company, designation, why }) {
      moveEmployer(tx, contactId, company, designation, norm(why) || 'Recorded by the consultant.');
    },
    verifyEmployer(tx, { contactId, company, designation }) {
      const contact = tx.get('contacts', contactId);
      const key = Rules.companyKey(company);
      if (!key) refuse('Add the new company name.');
      let org = tx.all('orgs').find(o => o.keys.includes(key));
      if (!org) { org = { id: newId('o'), name: Rules.shortCompany(company), legalName: norm(company), keys: [key], industry: '', location: '', createdAt: tx.now }; tx.put('orgs', org); }
      const aff = contact.affiliations.find(a => a.orgId === org.id && a.current);
      if (aff) { aff.verified = true; if (norm(designation)) aff.designation = norm(designation); } else {
        contact.affiliations.forEach(a => { if (a.current) { a.current = false; a.to = tx.today; } });
        contact.affiliations.push({ orgId: org.id, designation: norm(designation), from: tx.today, to: '', current: true, verified: true });
      }
      if (norm(designation)) contact.designation = norm(designation);
      /* Verifying a new job never lifts a restriction. */
      contact.status = tx.all('suppressions').some(x => x.status === 'active' && x.contactId === contactId) ? contact.status : 'active';
      tx.put('contacts', contact);
      tx.all('tasks').filter(t => t.contactId === contactId && t.kind === 'verifyEmployer' && t.status === 'open').forEach(t => {
        t.status = 'done'; t.resolvedAt = tx.now; t.resolution = 'Verified.'; tx.put('tasks', t);
        const c = tx.get('convs', t.convId);
        if (c) setNext(tx, c);
      });
      tx.log('employer', { contactId, orgId: org.id }, 'New employer verified: ' + org.name);
      return { orgId: org.id };
    },

    renameOrg(tx, { id, name }) {
      const org = tx.get('orgs', id);
      const key = Rules.companyKey(name);
      if (!key) refuse('Add the new name.');
      const clash = tx.all('orgs').find(o => o.id !== id && o.keys.includes(key));
      if (clash) refuse('Another organisation already uses this name.');
      const before = org.name;
      org.name = Rules.shortCompany(name); org.legalName = norm(name);
      if (!org.keys.includes(key)) org.keys.unshift(key);
      tx.put('orgs', org);
      tx.log('correction', { orgId: id }, 'Organisation renamed from ' + before + ' to ' + org.name);
    },
    renameContact(tx, { id, name, contact: detail, designation }) {
      const c = tx.get('contacts', id);
      if (norm(name) && norm(name) !== c.name) {
        const key = Rules.parseName(name, '').full.toLowerCase();
        const orgIds = c.affiliations.filter(a => a.current).map(a => a.orgId);
        if (tx.raw('contacts').some(o => o.id !== id && o.nameKey === key && o.affiliations.some(a => a.current && orgIds.includes(a.orgId)))) refuse('Someone with this name is already on record at this company. Choose A different person, or open that contact.');
        const was = c.name;
        if (c.nameKey) c.aliases = Array.from(new Set((c.aliases || []).concat(c.nameKey)));
        c.name = Rules.parseName(name, '').full; c.nameKey = c.name.toLowerCase();
        tx.log('correction', { contactId: id }, 'Contact renamed from ' + (was || 'no name') + ' to ' + c.name);
      }
      if (detail !== undefined && norm(detail) !== c.contact) {
        const key = Rules.prospectKey({ recipientContact: detail, recipientName: '', company: '' }).contact;
        if (norm(detail) && !key) refuse('That is not a valid email address or mobile number.');
        if (key && !c.keys.includes(key)) c.keys.push(key);
        c.contact = norm(detail);
        tx.log('correction', { contactId: id }, 'Contact details corrected');
      }
      if (designation !== undefined) c.designation = norm(designation);
      tx.put('contacts', c);
    },

    /* Combines two records of one person. Nothing is lost, and every reference moves. */
    mergeContacts(tx, { keepId, dropId }) {
      const keep = tx.get('contacts', keepId), drop = tx.get('contacts', dropId);
      if (!keep || !drop) refuse('Email Kit could not find both contacts.');
      keep.keys = Array.from(new Set(keep.keys.concat(drop.keys)));
      keep.aliases = Array.from(new Set((keep.aliases || []).concat(drop.aliases || [], drop.nameKey && drop.nameKey !== keep.nameKey ? [drop.nameKey] : [])));
      keep.affiliations = keep.affiliations.concat(drop.affiliations.filter(a => !keep.affiliations.some(b => b.orgId === a.orgId)));
      ['convs', 'tasks', 'facts', 'suppressions', 'meetings'].forEach(t => tx.all(t).filter(r => r.contactId === dropId).forEach(r => { r.contactId = keepId; tx.put(t, r); }));
      tx.put('contacts', keep);
      freezeKeys(tx, keepId);
      tx.del('contacts', dropId);
      tx.log('merge', { contactId: keepId }, 'Merged ' + (drop.name || 'a contact') + ' into ' + (keep.name || 'this contact'));
    },

    /* The same person, moved. The history stays and the new company is verified. */
    resolveReview(tx, { id, answer }) {
      const task = tx.get('tasks', id);
      if (!task || task.status !== 'open') return;
      const r = task.review || {};
      if (r.kind === 'restriction') {
        const entry = tx.get('suppressions', r.suppressionId);
        const conv = tx.get('convs', task.convId);
        const contact = tx.get('contacts', task.contactId);
        if (answer === 'none') {
          const original = r.messageId && tx.get('msgs', r.messageId);
          if (original && original.convId === conv.id) { original.stopReviewed = true; tx.put('msgs', original); }
          entry.status = 'lifted'; entry.liftedAt = tx.now; entry.liftReason = 'Reviewed: this was not an opt-out.';
          tx.put('suppressions', entry);
          contact.status = 'active';
          tx.put('contacts', contact);
          tx.log('restriction', conv, 'Restriction lifted after review', entry.liftReason);
          if (conv.status === 'clarification') addTask(tx, conv, 'reply', tx.today);
        } else {
          entry.status = 'lifted'; entry.liftedAt = tx.now; entry.liftReason = 'Replaced by a clear scope.';
          tx.put('suppressions', entry);
          applyOptOut(tx, conv, { optOutScope: answer === 'channel' ? 'channel' : answer, optOutChannels: answer === 'channel' ? [channelGroup(conv.channel)] : [] }, null);
          const after = tx.get('contacts', task.contactId);
          if (answer === 'channel' && after.status === 'review') { after.status = 'active'; tx.put('contacts', after); }
        }
        if (conv) { tx.put('convs', conv); setNext(tx, conv); }
      } else if (r.kind === 'employer' && answer === 'same') {
        const moved = tx.get('contacts', r.otherId), fresh = tx.get('contacts', task.contactId);
        const newOrg = (fresh.affiliations.find(a => a.current) || {}).orgId;
        const org = newOrg && tx.get('orgs', newOrg);
        /* The old role stops first, so the conversation at the new company carries on. */
        moveEmployer(tx, moved.id, org ? org.name : '', fresh.designation, 'Confirmed in review.');
        COMMANDS.mergeContacts(tx, { keepId: moved.id, dropId: fresh.id });
        if (org) COMMANDS.verifyEmployer(tx, { contactId: moved.id, company: org.name, designation: fresh.designation });
      } else if (r.kind === 'duplicate' && answer === 'same') {
        COMMANDS.mergeContacts(tx, { keepId: r.otherId, dropId: task.contactId });
      }
      const after = tx.get('tasks', id);
      after.status = 'done'; after.resolvedAt = tx.now; after.resolution = answer;
      tx.put('tasks', after);
      tx.log('review', { contactId: task.contactId, convId: task.convId }, task.title, answer);
      const c = task.convId && tx.get('convs', task.convId);
      if (c) setNext(tx, c);
    },

    /* A restriction ends only on a stated reason. It stays on record as lifted. */
    liftRestriction(tx, { id, why }) {
      const entry = tx.get('suppressions', id);
      if (!entry) return;
      if (!norm(why)) refuse('Say why this restriction is ending.');
      entry.status = 'lifted'; entry.liftedAt = tx.now; entry.liftReason = norm(why);
      tx.put('suppressions', entry);
      const contact = entry.contactId && tx.get('contacts', entry.contactId);
      if (contact && !tx.all('suppressions').some(x => x.id !== id && x.status === 'active' && x.contactId === contact.id)) { contact.status = 'active'; tx.put('contacts', contact); }
      /* The conversation stays closed, and can reopen on a real reply. */
      tx.all('convs').filter(c => c.status === 'optedOut' && (entry.scope === 'organisation' ? c.orgId === entry.orgId : c.contactId === entry.contactId)).forEach(c => {
        move(tx, c, 'closed', 'They opted back in.');
        c.outcome = 'Restriction lifted: ' + norm(why);
        c.lastType = 'closed';
        setNext(tx, c);
      });
      tx.log('restriction', entry, 'Restriction lifted', norm(why));
    },
    importContacts(tx, { rows: list, source }) {
      const report = { added: 0, existing: 0, restricted: 0, review: 0, skipped: 0, restrictedNames: [] };
      const active = tx.all('suppressions').filter(x => x.status === 'active');
      list.forEach(row => {
        const s = { recipientName: row.name, recipientTitle: '', company: row.company, designation: row.designation, recipientContact: row.contact, industry: row.industry, location: row.location, responsibility: Rules.suggestResponsibility(row.designation) || 'unknown' };
        /* A company alone is not a contact, and it could not be matched on a repeat import. */
        if (!norm(row.company) || (!norm(row.name) && !Rules.prospectKey({ recipientName: '', company: '', recipientContact: row.contact }).contact)) { report.skipped++; return; }
        const before = tx.all('contacts').length, reviewsBefore = tx.all('tasks').filter(t => t.kind === 'review').length;
        tx.source = source || 'imported';
        party(tx, s);
        const added = tx.all('contacts').length > before;
        if (tx.all('tasks').filter(t => t.kind === 'review').length > reviewsBefore) report.review++;
        else if (added) report.added++;
        else report.existing++;
        const blocked = ['email', 'message', 'whatsapp'].some(channel => { const f = Rules.findDoNotContact(active.map(toEntry), Object.assign({}, s, { channel })); return f && f.exact; });
        if (blocked) { report.restricted++; report.restrictedNames.push(row.name || row.company); }
      });
      tx.log('import', {}, 'Contact list imported', report.added + ' added, ' + report.existing + ' already on record, ' + report.restricted + ' restricted, ' + report.review + ' for review');
      return report;
    },

    saveAgency(tx, { profile }) {
      const prior = tx.get('meta', 'agency');
      if (!profile || profile.approved !== true || !norm(profile.name) || !norm(profile.services) || !/^\d{4}-\d{2}-\d{2}$/.test(profile.reviewBy) || profile.reviewBy < tx.today)
        refuse('Enter an agency name, approved service description and current review date. Confirm the recruitment scope.');
      if (prior && lower(prior.value.name) !== lower(profile.name) && (tx.all('contacts').length || tx.all('suppressions').length))
        refuse('This workspace has records for another agency. Use a separate browser profile for each agency.');
      tx.put('meta', { id: 'agency', value: Object.assign({}, profile, {revision:newId('p')}) });
      tx.log('settings', {}, 'Agency profile approved', profile.name);
    },
    setMandate(tx, { convId, status, reference }) {
      const conv = tx.get('convs', convId);
      if (!conv || !['Qualified','Proposal sent','Won','Lost'].includes(status) || !norm(reference)) refuse('Select a mandate stage and enter the supporting reference.');
      if (['Won','Lost'].includes(status) && tx.all('meetings').some(m => m.convId === convId && m.status === 'confirmed'))
        refuse('Record the outcome of the confirmed meeting, or cancel it explicitly before closing this mandate.');
      conv.mandateStatus = status; conv.mandateRef = norm(reference);
      tx.put('convs', conv);
      tx.log('mandate', conv, status, conv.mandateRef);
      if (['Won','Lost'].includes(status) && !ENDED.includes(conv.status)) COMMANDS.closeConversation(tx, {convId, outcome: 'Mandate ' + status.toLowerCase() + ': ' + conv.mandateRef});
    },
    updateSettings(tx, { settings }) {
      const next = Object.assign({}, tx.settings, settings);
      const error = settingsError(next);
      if (error) refuse(error);
      tx.put('meta', { id: 'settings', value: next });
      tx.log('settings', {}, 'Follow-up rules changed');
    },

    deleteConversation(tx, { id }) {
      const conv = tx.get('convs', id);
      if (!conv) return [];
      const files = tx.all('sources').filter(r => r.convId === id).map(r => r.fileId).filter(Boolean);
      ['msgs', 'tasks', 'meetings', 'facts', 'sources', 'queue'].forEach(t => tx.all(t).filter(r => r.convId === id).forEach(r => tx.del(t, r.id)));
      tx.all('events').filter(e => e.convId === id).forEach(e => tx.del('events', e.id));
      tx.del('convs', id);
      tx.log('deleted', { contactId: conv.contactId, orgId: conv.orgId }, 'Conversation deleted');
      return files;
    },
    /* Deletes the record. Any restriction stays, or a reimport could bypass it. */
    deleteContact(tx, { id }) {
      const contact = tx.get('contacts', id);
      if (!contact) return [];
      freezeKeys(tx, id);
      let files = [];
      tx.all('convs').filter(c => c.contactId === id).forEach(c => { files = files.concat(COMMANDS.deleteConversation(tx, { id: c.id })); });
      tx.all('tasks').filter(t => t.contactId === id).forEach(t => tx.del('tasks', t.id));
      tx.all('events').filter(e => e.contactId === id).forEach(e => tx.del('events', e.id));
      tx.all('suppressions').filter(x => x.contactId === id).forEach(x => { x.name = x.name || ''; tx.put('suppressions', x); });
      tx.del('contacts', id);
      tx.log('deleted', {}, 'A contact was deleted');
      return files;
    },

    /* Moves records saved by version 1 into the database. */
    migrateLegacy(tx, { tracker, doNotContact }) {
      const report = { moved: 0, skipped: 0 };
      (doNotContact || []).forEach(d => {
        if (!d || typeof d !== 'object' || typeof d.companyKey !== 'string' || !d.companyKey) { report.skipped++; return; }
        if (tx.all('suppressions').some(x => (x.nameKeys || []).includes(d.nameKey || '') && (x.companyKeys || []).includes(d.companyKey))) return;
        const key = Rules.companyKey(d.company || d.companyKey);
        tx.put('suppressions', { id: newId('x'), scope: 'all', channels: [], status: 'active', contactId: '', orgId: '', nameKey: d.nameKey || '', companyKey: key, contactKey: d.contactKey || '', nameKeys: [d.nameKey || ''], contactKeys: d.contactKey ? [d.contactKey] : [], companyKeys: Array.from(new Set([key, d.companyKey])), name: String(d.name || ''), company: String(d.company || ''), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : tx.today, reason: 'Carried over from version 1.', source: 'version 1', createdAt: tx.now });
      });
      (tracker || []).forEach(raw => {
        /* One damaged record must not stop the others from moving. */
        if (!raw || typeof raw !== 'object' || !Rules.companyKey(raw.company)) { report.skipped++; return; }
        const e = Object.assign({}, Rules.normaliseEntry(raw), { lastDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.lastDate) ? raw.lastDate : tx.today, nextDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.nextDate) ? raw.nextDate : '' });
        const s = { recipientTitle: e.recipientTitle, recipientName: e.recipientName, company: e.company, designation: e.designation, responsibility: e.responsibility, recipientContact: e.recipientContact, industry: e.industry, location: '' };
        const k = Rules.prospectKey(s);
        if (k.name && tx.all('contacts').some(c => c.nameKey === k.name && c.affiliations.some(a => (tx.get('orgs', a.orgId) || { keys: [] }).keys.includes(k.company)))) return;
        const { org, contact } = party(tx, s);
        tx.all('suppressions').filter(x => !x.contactId && (x.nameKeys || []).includes(contact.nameKey) && (x.companyKeys || []).some(c => org.keys.includes(c))).forEach(x => { x.contactId = contact.id; x.orgId = org.id; tx.put('suppressions', x); });
        const conv = newConversation(tx, org, contact, Object.assign({}, s, { roles: e.roles, hiringLocations: e.hiringLocations, channel: e.channel }));
        conv.form = Object.assign(conv.form, { roles: e.roles, hiringLocations: e.hiringLocations });
        conv.subject = e.subject || ''; conv.topic = e.topic || ''; conv.lastType = e.lastType || 'first'; conv.lastSentAt = e.lastDate || ''; conv.channel = e.channel || 'email';
        conv.status = { first: 'awaiting', reminder: 'awaiting', final: 'awaiting', reply: 'interested', agreed: 'postponed', closed: 'closed' }[conv.lastType] || 'awaiting';
        conv.attempts = { reminder: 1, final: tx.settings.maxReminders }[conv.lastType] || 0;
        conv.outcome = conv.lastType === 'closed' ? String(e.status || 'Closed') : '';
        conv.resumeOn = conv.lastType === 'agreed' ? e.nextDate || '' : '';
        if (e.referredName) { conv.referredName = e.referredName; conv.referredRole = e.referredRole; conv.referralPermission = e.referralPermission; }
        const at = (/^\d{4}-\d{2}-\d{2}$/.test(e.lastDate) ? e.lastDate : tx.today) + 'T09:00:00.000Z';
        tx.put('msgs', { id: newId('m'), convId: conv.id, direction: 'out', status: 'sent', type: conv.lastType, channel: conv.channel, subject: e.subject || '', body: '', summary: e.topic || '', hash: '', at, sentAt: at, actor: tx.actor, source: 'version 1 tracker', imported: true, createdAt: tx.now });
        if (e.nextDate) addTask(tx, conv, conv.lastType === 'agreed' ? 'checkIn' : conv.lastType === 'reply' ? 'nudge' : conv.lastType === 'reminder' ? 'final' : 'reminder', e.nextDate);
        else if (conv.lastType === 'final') addTask(tx, conv, 'closeOut', Rules.addWorkdays(e.lastDate || tx.today, tx.settings.closeAfterFinal));
        if (e.referredName && conv.lastType !== 'closed') addTask(tx, conv, 'referral', tx.today, { title: 'Contact ' + e.referredName });
        setNext(tx, conv);
        report.moved++;
      });
      tx.log('migration', {}, 'Records moved from the earlier version', report.moved + ' records moved, ' + report.skipped + ' damaged records skipped');
      return report;
    },

    /* Merges a backup by identifier. Restrictions always survive a restore. */
    restore(tx, { data }) {
      const report = { added: 0, updated: 0, rejected: 0 };
      const incoming = {};
      TABLES.forEach(table => { incoming[table] = Array.isArray(data[table]) ? data[table] : []; });
      const savedAgency = incoming.meta.find(r => r && r.id === 'agency');
      const activeAgency = tx.get('meta','agency');
      if (activeAgency && savedAgency && lower(activeAgency.value.name) !== lower(savedAgency.value.name)) refuse('This backup belongs to another agency. Use its own browser profile.');
      TABLES.forEach(table => incoming[table].forEach(row => {
        if (!validRow(table, row)) { report.rejected++; return; }
        if (table === 'meta') {
          if (row.id === 'settings' && !tx.get('meta', 'settings') && !settingsError(Object.assign(SETTINGS(), row.value))) tx.put('meta', row, true);
          return;
        }
        const have = tx.get(table, row.id);
        /* A backup can add a restriction. It can never change or remove one. */
        if (table === 'suppressions' && have) return;
        if (have && (have.updatedAt || '') >= (row.updatedAt || '')) return;
        if (have) report.updated++; else report.added++;
        tx.put(table, row, true);
      }));
      tx.all('convs').forEach(c => { if (!tx.get('orgs', c.orgId) || !tx.get('contacts', c.contactId)) { tx.del('convs', c.id); report.rejected++; } });
      tx.all('msgs').forEach(m => { if (!tx.get('convs', m.convId)) tx.del('msgs', m.id); });
      tx.log('restore', {}, 'Backup restored', report.added + ' added, ' + report.updated + ' updated, ' + report.rejected + ' rejected');
      return report;
    },
    /* A reply pasted but not yet confirmed is kept, so a restart cannot lose it. */
    holdReply(tx, { convId, text }) {
      const conv = tx.get('convs', convId);
      if (!conv) return;
      conv.heldReply = String(text || '');
      /* A waiting reply is the next action, and it stops reminders until confirmed. */
      closeTasks(tx, conv, ['confirmReply'], 'done', 'Replaced.');
      if (conv.heldReply.trim()) addTask(tx, conv, 'confirmReply', tx.today);
      setNext(tx, conv);
    },
    dropDraft(tx, { msgId }) {
      const msg = tx.get('msgs', msgId);
      if (msg && ['draft', 'ready'].includes(msg.status)) { msg.status = 'cancelled'; msg.cancelReason = 'Withdrawn by the consultant.'; tx.put('msgs', msg); }
    },
    undone(tx, { what }) { tx.log('undo', {}, what || 'The last step was undone.'); },
    eraseAll(tx) {
      tx.all('contacts').forEach(c => freezeKeys(tx, c.id));
      tx.all('suppressions').forEach(x => {
        const org = tx.get('orgs', x.orgId);
        if (org) { x.companyKeys = Array.from(new Set((x.companyKeys || []).concat(org.keys))); tx.put('suppressions', x); }
      });
      TABLES.filter(t => t !== 'suppressions' && t !== 'meta').forEach(t => tx.all(t).forEach(r => tx.del(t, r.id)));
      tx.log('deleted', {}, 'All client records were deleted. Restrictions were kept.');
    }
  };
  /* Everything a restored record must have before the app can rely on it. */
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const text = v => typeof v === 'string';
  const ROW = {
    orgs: r => text(r.name) && Array.isArray(r.keys) && r.keys.every(text) && r.keys.length > 0,
    contacts: r => text(r.name) && text(r.nameKey) && Array.isArray(r.keys) && Array.isArray(r.affiliations) && r.affiliations.every(a => a && text(a.orgId)) && has(LABELS.contact, r.status),
    convs: r => has(LABELS.conv, r.status) && text(r.orgId) && text(r.contactId) && text(r.createdAt) && text(r.channel),
    msgs: r => has(LABELS.msg, r.status) && text(r.convId) && text(r.at) && text(r.direction) && text(r.body) && text(r.channel),
    events: r => text(r.at) && text(r.type) && text(r.detail),
    tasks: r => text(r.kind) && text(r.title) && ['open', 'done', 'cancelled'].includes(r.status) && text(r.owner),
    meetings: r => /^[a-z0-9]+$/i.test(r.id) && has(LABELS.meeting, r.status) && text(r.convId) && Array.isArray(r.history),
    facts: r => has(LABELS.fact, r.kind) && has(LABELS.factStatus, r.status) && text(r.text) && text(r.at),
    sources: r => text(r.convId) && text(r.label) && text(r.url),
    suppressions: r => ['all', 'channel', 'organisation', 'review'].includes(r.scope) && ['active', 'lifted'].includes(r.status) && ['nameKeys', 'contactKeys', 'companyKeys'].every(k => r[k] === undefined || (Array.isArray(r[k]) && r[k].every(text))) && Array.isArray(r.channels) && (r.scope !== 'channel' || r.channels.length > 0) && text(r.company),
    queue: r => text(r.convId) && text(r.msgId) && text(r.status),
    meta: r => text(r.id)
  };
  function validRow(table, row) {
    if (row && ['__proto__','constructor','prototype'].includes(row.id)) return false;
    if (!row || typeof row !== 'object' || !text(row.id) || !row.id || row.id.length > 80) return false;
    try { return ROW[table](row); } catch (e) { return false; }
  }

  /* Undoing a wrong category puts back what the wrong one changed. */
  function reverseEffects(tx, conv, old) {
    const contact = tx.get('contacts', conv.contactId);
    if (old === 'optOut' && tx.all('suppressions').some(x => x.status === 'active' && x.contactId === conv.contactId)) refuse('This contact has a restriction. If it was a mistake, clear it first, then correct the category.');
    if (old === 'wrongContact') { contact.status = 'active'; tx.put('contacts', contact); }
    if (old === 'changedEmployer' && contact.status === 'moved') {
      contact.affiliations = contact.affiliations.filter(a => !(a.current && !a.verified));
      const last = contact.affiliations[contact.affiliations.length - 1];
      if (last) { last.current = true; last.to = ''; }
      contact.status = 'active';
      tx.put('contacts', contact);
      tx.all('tasks').filter(t => t.contactId === contact.id && t.kind === 'verifyEmployer' && t.status === 'open').forEach(t => { t.status = 'cancelled'; t.resolution = 'The category was corrected.'; tx.put('tasks', t); });
    }
    if (old === 'deliveryFailure' && conv.failedMsgId) {
      const m = tx.get('msgs', conv.failedMsgId);
      if (m) { m.status = 'sent'; tx.put('msgs', m); if (['reminder', 'final'].includes(m.type)) conv.attempts += 1; }
      conv.failedMsgId = '';
    }
    if (old === 'meeting') cancelMeetingTx(tx, conv, 'The category was corrected.');
    if (old === 'postponed') conv.resumeOn = '';
    if (old === 'referred') { conv.referredName = ''; conv.referredRole = ''; conv.referralPermission = ''; }
  }

  function transactionView(tx) {
    const view = {};
    TABLES.forEach(t => { view[t] = {}; tx.raw(t).forEach(r => { view[t][r.id] = r; }); });
    return view;
  }
  function recheckTx(tx, conv, opts) {
    return recheck(transactionView(tx), conv, tx.today, opts);
  }

  function closeAnswered(tx, conv, s) {
    /* Topics the reply answers stop being open questions. */
    const answered = s.askTopics || [];
    const termsGiven = s.responseCategory === 'commercial' || !!s.includeTerms;
    const meetingAnswered = s.responseCategory === 'meeting' && !Rules.missingMeeting(s).length;
    const owed = s.owedAnswer && conv.owedReply ? conv.owedReply.msgId : '';
    if (!answered.length && !termsGiven && !meetingAnswered && !owed) return;
    tx.all('facts').filter(f => f.convId === conv.id && f.kind === 'question' && f.status === 'unresolved').forEach(f => {
      const read = Rules.interpret(f.text, tx.today);
      const hit = (!!owed && f.msgId === owed) || read.topics.some(t => answered.includes(t)) || (termsGiven && read.matches.includes('commercial')) || (meetingAnswered && read.category === 'meeting');
      if (hit) { f.status = 'resolved'; tx.put('facts', f); tx.log('fact', conv, 'Answered: ' + f.text, 'Resolved'); }
    });
  }

  /* ---------- Reading the records ---------- */
  function formFor(view, conv, sender) {
    const read = view.get ? (t, id) => view.get(t, id) : (t, id) => view[t][id];
    const list = t => (view.raw ? view.raw(t) : rows(view, t));
    const contact = read('contacts', conv.contactId), org = read('orgs', conv.orgId);
    const current = contact.affiliations.find(a => a.orgId === conv.orgId) || {};
    const f = conv.form || {};
    const tasks = list('tasks').filter(t => t.convId === conv.id && t.status === 'open');
    const kind = (conv.next && conv.next.kind) || '';
    const base = { recipientTitle: '', industry: '', location: '', roles: '', hiringLocations: '', hiringType: 'permanent', reason: 'role', observation: '', sourceUrl: '', sourceQuote: '', dateChecked: '', verification: 'unchecked', postAuthor: 'recipient', referrer: '', referrerConsent: false, conversationWhen: '', desired: '', includeTerms: false, includeSource: false, whatsappConsent: !!f.whatsappConsent, askTopics: [], priorText: '', responseText: '', agreedStep: '', agreedDate: '', referredName: '', referredRole: '', referralPermission: 'unclear', noReplyRequested: false, scopeConfirmed: false, dncDifferent: false, accepted: false, movedTo: '', optOutScope: 'all', meetingAction: 'accept', meetingDate: '', meetingTime: '', meetingZone: '', meetingMode: 'call' };
    const person = { recipientName: contact.name, recipientTitle: contact.title || '', recipientContact: contact.contact || '', company: org.legalName || org.name, designation: current.designation || contact.designation || '', responsibility: contact.responsibility || 'unknown', activeRecordId: conv.id };
    /* A conversation with nothing sent is still a first message. */
    if (!conv.lastType && !conv.pending) return Object.assign(base, f, sender || {}, person, { stage: 'first', channel: conv.channel, activeRecordId: '' });
    const out = Object.assign(base, f, sender || {}, person, {
      stage: 'followup', priorChannel: conv.channel, priorType: conv.lastType || 'first', priorDate: conv.lastSentAt || '', priorSubject: conv.subject || '', priorTopic: conv.topic || '',
      responseCategory: 'noResponse', channel: conv.channel === 'invite' ? 'email' : conv.channel, remindersSent: conv.attempts || 0,
      reason: 'role', observation: '', sourceQuote: '', includeSource: false, followTask: kind, promise: conv.promise || '', desiredConfirmed: true, resend: conv.resend || ''
    });
    const owed = tasks.find(t => ['reply', 'answerOwed'].includes(t.kind));
    const open = owed && owed.kind === 'answerOwed' && !tasks.some(t => t.kind === 'reply') ? conv.owedReply : conv.pending;
    if (owed && open) {
      const msg = open.msgId ? read('msgs', open.msgId) : null;
      Object.assign(out, open.fields, { responseCategory: open.category, responseText: msg ? msg.body : '', owedAnswer: open === conv.owedReply, followTask: '' });
    } else if (conv.heldReply) out.responseText = conv.heldReply;
    if (kind === 'meetingClarify') {
      const m = list('meetings').find(x => x.convId === conv.id && x.status === 'proposed');
      if (m) Object.assign(out, { meetingDate: m.date, meetingTime: m.time, meetingZone: m.zone, meetingMode: m.mode });
    }
    return out;
  }

  function toEntry(x) { return { id: x.id, scope: x.scope, channels: x.channels, nameKey: x.nameKey, companyKey: x.companyKey, contactKey: x.contactKey, name: x.name, company: x.company, date: x.date, contactId: x.contactId }; }

  /* Every address on the contact is covered, not only the first. */
  function suppressionView(state) {
    const out = [];
    rows(state, 'suppressions').filter(x => x.status === 'active').forEach(x => {
      const contact = state.contacts[x.contactId], home = state.orgs[x.orgId];
      const names = new Set((x.nameKeys || [x.nameKey]).concat(contact ? [contact.nameKey].concat(contact.aliases || []) : []));
      const mails = new Set((x.contactKeys || [x.contactKey]).concat(contact ? contact.keys : []));
      const companies = new Set((x.companyKeys || [x.companyKey]).concat(home ? home.keys : []));
      if (contact && x.scope !== 'organisation') contact.affiliations.forEach(a => { const o = state.orgs[a.orgId]; if (o) o.keys.forEach(k => companies.add(k)); });
      const keys = mails.size ? Array.from(mails) : [''];
      companies.forEach(company => names.forEach(name => keys.forEach(key => out.push(Object.assign(toEntry(x), { nameKey: name, companyKey: company, contactKey: key })))));
    });
    return out;
  }

  /* A real exchange at a former company, which a new message can honestly refer to. */
  function formerLink(state, contact) {
    if (!contact || contact.status !== 'active') return null;
    const current = (contact.affiliations.find(a => a.current) || {}).orgId;
    const conv = rows(state, 'convs').filter(c => c.contactId === contact.id && c.orgId !== current && c.status === 'changedEmployer').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .find(c => rows(state, 'msgs').some(m => m.convId === c.id && m.direction === 'in'));
    return conv && state.orgs[conv.orgId] ? { conv, org: state.orgs[conv.orgId], topic: conv.topic } : null;
  }

  /* The list shape the form rules already understand. */
  function trackerView(state) {
    return rows(state, 'convs').filter(c => c.lastType).map(c => {
      const contact = state.contacts[c.contactId] || {}, org = state.orgs[c.orgId] || {};
      const human = c.next && c.next.owner !== 'Usha' ? c.next : null;
      /* After a verified move, the old conversation no longer speaks for this person. */
      const home = contact.affiliations && contact.affiliations.find(a => a.current);
      const former = contact.status === 'active' && !!home && home.orgId !== c.orgId;
      return {
        id: c.id, nameKey: former ? '' : contact.nameKey || '', companyKey: (org.keys || [''])[0], contactKey: former ? '' : (contact.keys || [''])[0] || '', recipientName: contact.name || '', company: org.name || '', recipientContact: contact.contact || '', designation: contact.designation || '',
        channel: c.channel, lastType: ENDED.includes(c.status) ? 'closed' : c.lastType, lastDate: c.lastSentAt, status: LABELS.conv[c.status], subject: c.subject, topic: c.topic, nextDate: human ? human.due : '',
        nextAction: human ? human.action : '', owner: human ? human.owner : '', outcome: c.outcome || '', mandateStatus: c.mandateStatus || '', mandateRef: c.mandateRef || '',
        roles: (c.form || {}).roles || '', industry: (c.form || {}).industry || '', referredName: c.referredName || '', referredRole: c.referredRole || '', referralPermission: c.referralPermission || ''
      };
    });
  }

  function actions(state, today) {
    const list = [];
    rows(state, 'tasks').filter(t => t.status === 'open' && t.owner !== 'Usha').forEach(t => {
      const conv = state.convs[t.convId], contact = state.contacts[t.contactId], org = state.orgs[t.orgId || (conv && conv.orgId)];
      list.push({ task: t, conv, contact, org, due: t.due, overdue: !!t.due && t.due < today, today: t.due === today, future: !!t.due && t.due > today });
    });
    return list.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  }

  function folders(state) {
    const orgs = rows(state, 'orgs').sort((a, b) => a.name.localeCompare(b.name));
    return orgs.map(org => {
      const contacts = rows(state, 'contacts').filter(c => c.affiliations.some(a => a.orgId === org.id)).sort((a, b) => a.name.localeCompare(b.name));
      return {
        org,
        contacts: contacts.map(contact => ({
          contact,
          past: !contact.affiliations.some(a => a.orgId === org.id && a.current),
          convs: rows(state, 'convs').filter(c => c.orgId === org.id && c.contactId === contact.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        }))
      };
    });
  }

  function timeline(state, convId) {
    const items = [];
    rows(state, 'msgs').filter(m => m.convId === convId).forEach(m => items.push({ at: m.sentAt || m.at, kind: 'message', msg: m }));
    rows(state, 'events').filter(e => e.convId === convId && !['draft', 'sent', 'response', 'created'].includes(e.type)).forEach(e => items.push({ at: e.at, kind: 'event', event: e }));
    return items.sort((a, b) => a.at.localeCompare(b.at));
  }

  /* Confirmed requirements and decisions, reused instead of asked for again. */
  function confirmedFacts(state, convId) {
    return rows(state, 'facts').filter(f => f.convId === convId && f.status === 'confirmed' && ['requirement', 'decision'].includes(f.kind)).map(f => f.text.replace(/\.$/, '') + '.');
  }

  /* ---------- Export ---------- */
  /* Folder names can never climb out of the export or use a reserved name. */
  const safeName = t => {
    const name = norm(String(t).replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ')).replace(/^\.+|\.+$/g, '').trim().slice(0, 60).trim();
    if (!name) return 'Unnamed';
    return /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name) ? '_' + name : name;
  };
  function folderFiles(state, today) {
    const root = 'Email Kit clients ' + today + '/';
    const files = [{ path: root + 'README.txt', text: 'This folder is a readable copy of your Email Kit records on ' + today + '.\nThe database inside Email Kit remains the source of truth, so changes made here do not go back into Email Kit.\n' }];
    folders(state).forEach(({ org, contacts }) => {
      const orgPath = root + safeName(org.name) + '/';
      files.push({ path: orgPath + 'organisation.txt', text: ['Organisation: ' + org.name, 'Legal name: ' + (org.legalName || org.name), 'Industry: ' + (org.industry || 'Not recorded'), 'Location: ' + (org.location || 'Not recorded')].join('\n') + '\n' });
      contacts.forEach(({ contact, convs }) => {
        const path = orgPath + safeName(contact.name || 'Unnamed contact') + '/';
        const lines = ['Name: ' + (contact.name || 'Not recorded'), 'Status: ' + LABELS.contact[contact.status], 'Designation: ' + (contact.designation || 'Not recorded'), 'Contact: ' + (contact.contact || 'Not recorded'), '', 'Employment history:'];
        contact.affiliations.forEach(a => { const o = state.orgs[a.orgId]; lines.push('- ' + (o ? o.name : 'Unknown') + ', ' + (a.designation || 'role not recorded') + ', from ' + a.from + (a.to ? ' to ' + a.to : ', current') + (a.verified ? '' : ', not verified')); });
        files.push({ path: path + 'contact.txt', text: lines.join('\n') + '\n' });
        convs.forEach((conv, i) => {
          const dir = path + String(i + 1).padStart(2, '0') + ' ' + safeName(conv.topic || 'Conversation') + '/';
          const ctx = ['Status: ' + LABELS.conv[conv.status], 'Outcome: ' + (conv.outcome || 'Open'), 'Subject: ' + (conv.subject || 'None'), 'Next action: ' + (conv.next ? conv.next.action + ', owner ' + who(conv.next.owner) + ', due ' + (conv.next.due || 'not set') + '. ' + conv.next.reason : 'None'), ''];
          const group = (title, list, line) => { if (list.length) ctx.push(title + ':', ...list.map(line), ''); };
          const facts = rows(state, 'facts').filter(f => f.convId === conv.id);
          group('Confirmed', facts.filter(f => f.status === 'confirmed'), f => '- ' + LABELS.fact[f.kind] + ': ' + f.text);
          group('Proposed', facts.filter(f => f.status === 'proposed'), f => '- ' + LABELS.fact[f.kind] + ': ' + f.text);
          group('Unresolved', facts.filter(f => f.status === 'unresolved'), f => '- ' + LABELS.fact[f.kind] + ': ' + f.text);
          group('Corrected', facts.filter(f => f.status === 'corrected'), f => '- ' + f.text);
          group('Meetings', rows(state, 'meetings').filter(m => m.convId === conv.id), m => '- ' + LABELS.meeting[m.status] + ': ' + meetingText(m));
          group('Tasks', rows(state, 'tasks').filter(t => t.convId === conv.id), t => '- ' + t.title + ' (' + t.status + ', due ' + (t.due || 'not set') + ')');
          group('Sources', rows(state, 'sources').filter(r => r.convId === conv.id), r => '- ' + [r.label, r.url, r.summary, r.quote && '"' + r.quote + '"'].filter(Boolean).join(', '));
          rows(state, 'sources').filter(r => r.convId === conv.id && r.fileId).forEach(r => files.push({ path: dir + 'attachments/' + safeName(r.label), fileId: r.fileId }));
          group('History', rows(state, 'events').filter(e => e.convId === conv.id).sort((a, b) => a.at.localeCompare(b.at)), e => '- ' + e.at.slice(0, 16).replace('T', ' ') + ', ' + who(e.actor) + ': ' + e.detail + (e.outcome ? ' (' + e.outcome + ')' : ''));
          files.push({ path: dir + 'conversation.txt', text: ctx.join('\n') + '\n' });
          rows(state, 'msgs').filter(m => m.convId === conv.id).sort((a, b) => a.at.localeCompare(b.at)).forEach((m, n) => {
            const name = String(n + 1).padStart(3, '0') + ' ' + m.at.slice(0, 10) + ' ' + (m.direction === 'in' ? 'received' : m.status) + ' ' + m.type + '.txt';
            files.push({ path: dir + 'messages/' + safeName(name), text: ['Status: ' + LABELS.msg[m.status], 'Channel: ' + m.channel, 'Subject: ' + (m.subject || 'None'), 'Date: ' + m.at, 'Recorded by: ' + who(m.actor), 'Source: ' + who(m.source || 'Usha'), '', m.body || m.summary || ''].join('\n') + '\n' });
          });
        });
      });
    });
    return files;
  }

  return { who, TABLES, LABELS, ALLOWED, ENDED, EngineError, emptyState, settingsError, validRow, differs, formerLink, addressQuestion, run, applyChanges, invert, applySettings, settingsOf, todayIn, resolve, recheck, guards, history, trackerView, suppressionView, actions, folders, timeline, confirmedFacts, formFor, folderFiles, meetingText, rows, hash };
})();
