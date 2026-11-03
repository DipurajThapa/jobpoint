/* ==========================================================================
   SELECTION RULES AND MESSAGE ASSEMBLY. No interface code in this block.
   Reads CONFIG, SLOTS, SUBJECTS and FAMILIES.
   ========================================================================== */
const Rules = (function () {
  const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* Counting convention shown to users: every character counts, including
     spaces, punctuation and line breaks. A line break counts as one. */
  const countChars = t => Array.from(String(t).replace(/\r\n?/g, '\n')).length;
  /* A word is any run of characters containing a letter or digit, so list bullets do not count. */
  const countWords = t => { const m = String(t).match(/\S*[\p{L}\p{N}]\S*/gu); return m ? m.length : 0; };

  function joinList(items) {
    if (items.length < 2) return items.join('');
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }
  const splitList = s => String(s || '').split(/[,;\n\/]+/).map(norm).filter(Boolean);

  function possessive(name) {
    if (/['\u2019]s$/i.test(name)) return name;
    return /s$/i.test(name) ? name + "'" : name + "'s";
  }

  function shortCompany(raw) {
    let t = norm(raw);
    for (let i = 0; i < 3; i++) {
      t = t.replace(/[.,\s]+$/, '').replace(/[,\s]+(private limited|private ltd\.?|pvt\.?\s*ltd\.?|pvt\.?\s*limited|p\.?\s*ltd\.?|limited|ltd\.?|llp|inc\.?|plc|corp\.?)$/i, '');
    }
    return t.replace(/^m\/s\.?\s+/i, '').replace(/\s*\(p\)$/i, '').replace(/[.,\s]+$/, '');
  }
  /* The matching form of a company name. M/s, The and Company never separate two records. */
  function companyKey(raw) {
    return shortCompany(raw).toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+(company|co)$/, '').trim();
  }
  const letters = t => String(t).toLowerCase().replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '');

  function parseName(raw, titleChoice) {
    let t = norm(raw).replace(/,.*$/, '');
    let title = titleChoice || '';
    const m = t.match(/^(mr|mrs|ms|miss|dr|prof|shri|smt)\.?\s+/i);
    if (m) { t = t.slice(m[0].length); if (!title) title = cap(m[1].toLowerCase()); }
    if (t && t === t.toLowerCase()) t = t.split(' ').map(cap).join(' ');
    const parts = t.split(' ').filter(Boolean);
    if (!parts.length) return { full: '', first: '', last: '', title: '' };
    const initial = /^[A-Za-z]\.?$/.test(parts[0]) || /^[A-Z]{2}\.?$/.test(parts[0]) || /\.$/.test(parts[0]);
    return { full: t, first: initial ? t : parts[0], last: parts[parts.length - 1], title };
  }

  function greetingFor(channel, name) {
    if (name.title && name.last) return (channel === 'email' ? 'Dear ' : 'Hello ') + name.title + ' ' + name.last + ',';
    if (name.first) return (channel === 'email' ? 'Dear ' : 'Hello ') + name.first + ',';
    return 'Hello,';
  }

  /* Turns a user's clause into something that sits inside a sentence. */
  function clause(raw, leadsToStrip) {
    let t = norm(raw).replace(/[.;:,!?]+$/, '');
    (leadsToStrip || []).forEach(lead => {
      if (lead && t.toLowerCase().startsWith(lead.toLowerCase() + ' ')) t = t.slice(lead.length + 1);
    });
    t = t.replace(/^that\s+/i, '');
    if (/^(Is|Are|Was|Were|Has|Have|Had|Will|Plans|Plan|Announced|Opened|Opening|Hiring|Our|The|A|An|Your|You|We|They|It|There|At|In|On|During|By|Call|Send|Share|Email|Write|Meet|Speak|Contact|Last|This|Next|Yesterday|Discuss|Review)\b/.test(t) || /^[A-Z][a-z]+(ed|ing)\b/.test(t)) {
      t = t.charAt(0).toLowerCase() + t.slice(1);
    }
    return t;
  }

  const lowerFirst = t => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

  /* Lets a finding sit after the company name, however it was typed. */
  function companyClause(t) {
    return t
      .replace(/^(they|the company|it) (is|are)\b/i, 'is')
      .replace(/^they're\b/i, 'is')
      .replace(/^(they|the company|it) (has|have)\b/i, 'has')
      .replace(/^(they|the company|it) (will|plans?)\b/i, (m, a, b) => (b.toLowerCase() === 'will' ? 'will' : 'plans'))
      .replace(/^are\b/i, 'is')
      .replace(/^have\b/i, 'has')
      .replace(/^(hiring|recruiting|opening|expanding|launching|building|looking|planning|setting up)\b/i, m => 'is ' + m.toLowerCase());
  }

  /* The step as a clause, with any "I will" removed. */
  function stepText(raw) {
    const t = clause(raw, ['as agreed, i will', 'as agreed,', 'i will', "i'll", 'i shall', 'will']);
    return t.replace(/^(i (will|shall|can|could|would|may|might)|i'll|i'd|will|shall)\s+/i, '');
  }
  /* "Rahul to call you" and "Ms Rao will confirm" belong to someone else. */
  const STEP_VERBS = /^(call|send|share|email|write|meet|speak|contact|discuss|review|confirm|follow|check|arrange|prepare|provide)$/i;
  const ownSubject = t => /^(you|we|they|he|she)\b/i.test(t) || /^[\p{L}.'-]+(\s[\p{L}.'-]+){0,2}\s+(will|shall)\b/iu.test(t) || (/^[A-Z][\p{L}.'-]*\s+to\b/u.test(t) && !STEP_VERBS.test(t.split(' ')[0]));
  function promiseKind(s) {
    const t = stepText(s.promise);
    if (!t) return '';
    return ownSubject(t) ? 'theirs' : 'mine';
  }
  function agreedSentence(step, date) {
    /* A step that already names its own day needs no second date. */
    const on = date && !/\b(by|on|before)\s/i.test(step) ? ' on ' + date : '';
    if (!step) return date ? 'As agreed, I will contact you again on ' + date + '.' : '';
    /* A step that belongs to someone else keeps its own subject. */
    if (ownSubject(step)) return 'As agreed, ' + step.replace(/^([A-Z][\p{L}.'-]*)\s+to\b/u, '$1 will') + on + '.';
    const text = /^[A-Z][a-z]/.test(step) ? step.charAt(0).toLowerCase() + step.slice(1) : step;
    return 'As agreed, I will ' + text + on + '.';
  }

  function formatTime(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
    if (!m) return '';
    const h = Number(m[1]);
    return ((h % 12) || 12) + (m[2] === '00' ? '' : ':' + m[2]) + (h < 12 ? ' am' : ' pm');
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function formatDate(iso, today) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    const label = Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1];
    return m[1] === String(today).slice(0, 4) ? label : label + ' ' + m[1];
  }
  function daysBetween(fromIso, toIso) {
    return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86400000);
  }
  /* Today in the time zone chosen under Follow-up rules, not the device's. */
  function localToday() {
    const d = new Date();
    try {
      const p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).forEach(x => { p[x.type] = x.value; });
      return p.year + '-' + p.month + '-' + p.day;
    } catch (e) { return d.toISOString().slice(0, 10); }
  }

  function parseRoles(raw) {
    const singular = /\b(manager|officer|executive|representative|specialist|associate|analyst|accountant|consultant|engineer|supervisor|head|lead|advisor|adviser|coordinator|assistant|partner|trainer|pharmacist)s$/i;
    return splitList(raw).map(r => r.replace(/\s+(roles?|positions?|profiles?|openings?|vacanc(y|ies))$/i, '').replace(singular, '$1')).filter(Boolean);
  }

  function rolePhrase(roles) {
    if (!roles.length) return '';
    if (roles.length > 3) return 'roles such as ' + joinList(roles.slice(0, 3));
    return joinList(roles) + ' roles';
  }

  function locationPhrase(raw) {
    const items = splitList(raw);
    if (!items.length) return '';
    if (items.some(i => /^(pan[- ]?india|all[- ]?india|across india|india)$/i.test(i))) return '';
    return 'in ' + joinList(items.slice(0, 3));
  }

  function suggestResponsibility(title) {
    const t = norm(title);
    if (!t) return '';
    const exact = CONFIG.lists.designations.find(d => d[0].toLowerCase() === t.toLowerCase());
    if (exact) return exact[1];
    const rule = CONFIG.titleRules.find(r => r.test.test(t));
    return rule ? rule.r : '';
  }

  const AGREED_CATS = ['interested', 'moreInfo', 'commercial', 'noRequirement', 'otherAgency', 'postponed', 'meetingHeld'];

  function evidenceReasonIsObservation(reason) { return ['vacancy', 'expansion', 'post'].includes(reason); }

  function followKind(s) {
    if (s.stage !== 'followup') return '';
    if (s.responseCategory !== 'noResponse') return 'reply';
    if (s.followTask === 'askDate') return 'askDate';
    if (s.followTask === 'meetingClarify') return 'meetingChase';
    /* While you owe what you promised, the promise decides the next message. */
    if (norm(s.promise)) return 'promise';
    if (s.priorType === 'agreed') return 'checkIn';
    if (s.priorType === 'closed') return 'stop';
    if (s.priorType === 'reply') return 'nudge';
    const sent = { first: 0, reminder: s.remindersSent || 1, final: CONFIG.maxReminders }[s.priorType || 'first'];
    if (sent >= CONFIG.maxReminders) return 'stop';
    return sent === CONFIG.maxReminders - 1 ? 'final' : 'reminder';
  }

  /* Which reason is really in use. Unconfirmed findings fall back to role-based. */
  function resolveReason(s, today) {
    if (s.stage === 'followup' && followKind(s) !== 'reminder') return { reason: 'role', fellBack: false };
    let reason = s.reason || 'role';
    if (s.stage === 'followup' && (reason === 'referral' || reason === 'previous')) reason = 'role';
    if (evidenceReasonIsObservation(reason)) {
      const usable = norm(s.observation) && s.verification === 'confirmed' && s.dateChecked && s.dateChecked <= today;
      if (!usable) return { reason: 'role', fellBack: true, requested: reason };
    }
    return { reason, fellBack: false };
  }

  /* Reads a topic from the earlier message, using only what the user gave. */
  function deriveTopic(s) {
    if (norm(s.priorTopic)) return clause(s.priorTopic);
    const subject = norm(s.priorSubject).replace(/^(re|fw|fwd):\s*/i, '');
    if (subject) {
      /* Subjects Email Kit wrote itself name a sentence, not a topic. */
      const about = /^(?:our conversation|your post|.*\bpost) about (.+)$/i.exec(subject);
      if (about) return clause(about[1]);
      if (/suggested that I contact you$/i.test(subject) || /^our recent conversation$/i.test(subject)) return shortCompany(s.company) ? 'recruitment support for ' + shortCompany(s.company) : 'recruitment support';
      const t = subject.replace(/^following up on\s+/i, '').replace(/[.?!]+$/, '');
      return /^(Recruitment|Permanent|Empanelment|Hiring|Introduction)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
    }
    const text = String(s.priorText || '');
    const company = shortCompany(s.company);
    /* A short single line is a summary, so it is used as written. */
    const line = text.trim();
    if (line && line.length <= 80 && !/\n|[.?!]\s/.test(line) && !/^(hi|hello|dear)\b/i.test(line)) return clause(line);
    if (/empanel/i.test(text)) return 'recruitment partner empanelment';
    if (/recruit|hiring/i.test(text)) return company ? 'recruitment support for ' + company : 'recruitment support';
    return '';
  }

  function subjectFromPaste(text) {
    const m = /^\s*subject\s*:\s*(.+)$/im.exec(String(text || ''));
    return m ? norm(m[1]) : '';
  }

  /* Suggestions from pasted text. The user confirms each one. */
  function suggestResponse(text) {
    const t = norm(text);
    if (!t) return '';
    const rule = CONFIG.responseRules.find(r => r.test.test(t));
    return rule ? rule.id : '';
  }
  function detectTopics(text) {
    return Object.keys(CONFIG.topicRules).filter(k => CONFIG.topicRules[k].test(String(text || '')));
  }
  function detectUnverified(text) {
    return CONFIG.unverifiedTopics.filter(u => u.test.test(String(text || ''))).map(u => u.label);
  }
  function detectNoReply(text) { return CONFIG.noReplyRule.test(String(text || '')); }

  function draftObservation(s) {
    const roles = parseRoles(s.roles);
    if (!roles.length) return '';
    const place = locationPhrase(s.hiringLocations);
    const what = roles.length === 1 ? (/^([aeiou]|[FHLMNRSX][A-Z])/.test(roles[0]) || /^[AEIOU]/.test(roles[0]) ? 'an ' : 'a ') + roles[0] : 'for ' + rolePhrase(roles);
    return 'is hiring ' + what + (place ? ' ' + place : '');
  }

  /* Matching rules. An exact match acts at once. A possible match on the same
     company needs the user to confirm that this is a different person. */
  function prospectKey(s) {
    const c = parseContact(s.recipientContact);
    return { name: parseName(s.recipientName, '').full.toLowerCase().replace(/\s+/g, ' '), company: companyKey(s.company), contact: c.email.toLowerCase() || c.phone };
  }
  function namesOverlap(a, b) {
    const x = a.split(' ').filter(Boolean), y = b.split(' ').filter(Boolean);
    if (!x.length || !y.length) return false;
    const same = (p, q) => p === q || (p.replace('.', '').length === 1 && q.startsWith(p[0])) || (q.replace('.', '').length === 1 && p.startsWith(q[0]));
    /* "Sharma Priya" is the same two words as "Priya Sharma". */
    if (x.slice().sort().join(' ') === y.slice().sort().join(' ')) return true;
    return same(x[0], y[0]) || x[x.length - 1] === y[y.length - 1];
  }
  function companyMatch(a, b) { return !!a && !!b && (a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ')); }
  function isSameProspect(e, s) {
    const k = prospectKey(s);
    return companyMatch(e.companyKey, k.company) && (!k.name || !e.nameKey || namesOverlap(e.nameKey, k.name));
  }

  /* A channel restriction blocks that channel only. A company restriction
     blocks everyone there. A restriction under review blocks everything. */
  const CHANNEL_GROUP = { email: 'email', invite: 'linkedin', message: 'linkedin', whatsapp: 'whatsapp' };
  function restricts(e, s) {
    return e.scope !== 'channel' || (e.channels || []).includes(CHANNEL_GROUP[s.channel]);
  }
  function findDoNotContact(list, s) {
    const k = prospectKey(s);
    const entries = (list || []).filter(e => restricts(e, s));
    const company = entries.find(e => e.scope === 'organisation' && e.companyKey === k.company);
    if (company) return { entry: company, exact: true };
    const compact = String(s.recipientContact || '').replace(/[ ()-]/g,'');
    const legacy = /^0?[1-9]\d{9}$/.test(compact) ? '91' + compact.slice(-10) : '';
    const wa = s.channel === 'whatsapp' ? parseContact(s.waNumber).phone : '';
    const exact = entries.find(e => (legacy && e.contactKey === legacy) || (wa && e.contactKey === wa) || (k.contact && e.contactKey === k.contact) || (companyMatch(e.companyKey, k.company) && !!k.name && e.nameKey === k.name));
    if (exact) return { entry: exact, exact: true };
    const near = entries.find(e => isSameProspect(e, s) && (e.scope !== 'organisation' || !k.name || !!e.nameKey))
      /* The same full name anywhere may be the same person at a new company. */
      || entries.find(e => k.name.includes(' ') && e.nameKey === k.name)
      || entries.find(e => e.scope === 'organisation' && companyMatch(e.companyKey, k.company));
    return near ? { entry: near, exact: false } : null;
  }
  /* Restrictions that do not stop this draft but must stay visible. */
  function otherRestrictions(list, s) {
    const k = prospectKey(s);
    return (list || []).filter(e => !restricts(e, s) && ((k.contact && e.contactKey === k.contact) || (companyMatch(e.companyKey, k.company) && e.nameKey === k.name)));
  }

  /* Shared mailboxes do not merge different people into one record. */
  function findTracked(list, s) {
    const k = prospectKey(s);
    return (list || []).find(e => (k.name && e.nameKey === k.name && companyMatch(e.companyKey, k.company))
      || (k.contact && e.contactKey === k.contact && (!k.name || !e.nameKey || namesOverlap(e.nameKey, k.name)))) || null;
  }
  const isEnded = e => e.lastType === 'closed';
  function findEndedNear(list, s, skipId) {
    const k = prospectKey(s);
    return (list || []).find(e => isEnded(e) && e.id !== skipId && (isSameProspect(e, s) || (k.contact && e.contactKey === k.contact))) || null;
  }

  /* Records saved by earlier versions used 'reply' for closing replies. */
  function normaliseEntry(e) {
    const closing = CONFIG.responses.filter(r => ['notInterested', 'wrongContact', 'referred', 'noRequirement', 'otherAgency'].includes(r.id)).map(r => r.label);
    if (e.lastType === 'reply' && closing.includes(e.status)) return Object.assign({}, e, { lastType: e.nextDate ? 'agreed' : 'closed' });
    return e;
  }

  function scopeApplies(s) {
    if (s.stage !== 'followup') return true;
    return s.responseCategory === 'noResponse' && followKind(s) === 'reminder' && s.channel !== 'invite';
  }

  function checkScope(s) {
    const hits = [];
    if (!scopeApplies(s)) return hits;
    if (s.hiringType === 'temporary') hits.push({ kind: 'type', term: 'temporary or contract hiring', label: 'temporary manpower supply', field: 'hiringType', canConfirm: false });
    const roleText = String(s.roles || '').replace(/non[- ]?it\b/gi, '');
    [['it', CONFIG.scope.it], ['temporary', CONFIG.scope.temporary], ['blueCollar', CONFIG.scope.blueCollar]].forEach(([key, rule]) => {
      rule.terms.forEach(re => {
        const m = roleText.match(re);
        if (m && !hits.some(h => h.key === key)) hits.push({ kind: 'role', key, term: m[0], label: rule.label, field: 'roles', canConfirm: true });
      });
    });
    CONFIG.scope.outsideIndia.forEach(re => {
      const m = String(s.hiringLocations || '').match(re);
      if (m && !hits.some(h => h.kind === 'location')) hits.push({ kind: 'location', term: m[0], label: 'hiring outside India', field: 'hiringLocations', canConfirm: true });
    });
    return hits;
  }

  /* Essential gaps stop a draft. Notes explain what was omitted or assumed. */
  function validate(s, today, doNotContact, tracked) {
    today = today || localToday();
    const blockers = [], notes = [];
    const need = (field, msg) => blockers.push({ field, msg });
    const note = (msg, field) => notes.push({ msg, field: field || '' });
    const followup = s.stage === 'followup';
    const cat = s.responseCategory;

    /* With no reply to write, an opt-out needs only enough to identify them. */
    const noReply = followup && ((cat === 'optOut' && (s.noReplyRequested || s.optOutScope === 'review')) || cat === 'deliveryFailure');
    if (!noReply && cat === 'optOut' && s.channel !== s.priorChannel) need('channel','Keep an acknowledgement on the original channel or record no reply.');
    if (!noReply && followup && cat === 'meeting' && interpret(s.responseText,today).category === 'unclear' && !['cancel','change'].includes(s.meetingAction)) need('meetingAction','They declined the proposed time. Clarify, cancel or record a new time they agreed.');
    if (!noReply && followup && !s.stopReviewed && interpret(s.responseText,today).optOut && cat !== 'optOut') need('responseCategory','This reply contains a stop request. Review its scope before any further message.');
    if (!noReply && s.includeTerms && !CONFIG.commercial.lines.length) need('includeTerms', 'Approved terms are not available. Leave the terms out and confirm them separately.');
    if (!noReply) {
      if (!norm(s.senderName)) need('senderName', 'Add your name so the message can introduce you.');
      if (!norm(s.senderRole)) need('senderRole', 'Add your designation so the message can introduce you.');
    }
    if (!norm(s.company)) need('company', 'Add the company name.');

    const dnc = findDoNotContact(doNotContact, s);
    if (dnc && !(followup && cat === 'optOut')) {
      if (dnc.exact) {
        const e = dnc.entry;
        need('doNotContact', e.scope === 'review' ? 'A restriction on this contact needs your review, so Email Kit has paused outreach. Open the record and decide its scope.'
          : e.scope === 'channel' ? 'This person asked not to be contacted on this channel. Choose another channel, or clear the restriction only if they opted back in.'
            : e.scope === 'organisation' ? 'This company asked for no further contact, so Email Kit will not draft outreach to anyone there.'
              : 'This prospect is marked Do not contact, so Email Kit will not draft outreach. Clear the mark only with documented new permission covering its scope.');
      }
      else if (!s.dncDifferent) need('dncDifferent', 'This may be someone who asked for no further contact. Please confirm that this is a different person.');
    }
    const known = findTracked(tracked, s);
    const k0 = prospectKey(s);
    const earlier = !followup && !k0.name && !k0.contact && (tracked || []).find(e => e.companyKey === k0.company);
    if (earlier) need('recipientName', 'You already wrote to ' + earlier.company + ' on ' + formatDate(earlier.lastDate, today) + ', and this message has no recipient name. Please check that it goes to someone new. Enter their name or contact address.');
    const acceptedNote = s.stage === 'accepted' && known && known.channel === 'invite';
    if (!followup && known && !acceptedNote) need('trackerMatch', 'This prospect is already in your client records. Continue the conversation there, or remove the record to start again.');
    /* A record loaded into the form does not prove who is now being written to. */
    const endedNear = findEndedNear(tracked, s, s.activeRecordId);
    const handled = endedNear && endedNear === known && !s.activeRecordId;
    if (endedNear && !handled && !(followup && cat === 'optOut') && !s.dncDifferent && !(dnc && !dnc.exact)) {
      need('dncDifferent', 'This may be someone whose conversation has ended. Please confirm that this is a different person.');
    }

    const hits = checkScope(s);
    hits.forEach(h => {
      if (h.kind === 'type') {
        need('hiringType', 'This recruitment edition supports permanent hiring and does not supply temporary manpower. Change the hiring type to permanent, or do not use Email Kit for this requirement.');
      } else if (!s.scopeConfirmed) {
        if (h.kind === 'location') need('hiringLocations', '"' + h.term + '" looks like ' + h.label + '. This recruitment edition supports hiring across India. Revise the hiring locations, or confirm below that they are in India.');
        else need('roles', '"' + h.term + '" looks like ' + h.label + ', which This recruitment edition does not offer. Revise the roles, or confirm below that they are permanent, non-IT and white-collar.');
      }
    });

    const firstLike = !followup;
    if (firstLike && s.reason === 'referral') {
      if (!norm(s.referrer)) need('referrer', 'Add the referrer\'s name, or choose another reason for contact.');
      if (!s.referrerConsent) need('referrerConsent', 'Confirm that this person really referred you and agreed to be named.');
    }
    if (firstLike && s.reason === 'previous' && !norm(s.observation)) need('observation', 'Record what you discussed, or choose another reason for contact.');

    if (s.channel === 'whatsapp' && !noReply) {
      if (!s.whatsappConsent || !norm(s.waEvidence)) need('whatsappConsent', 'Record how the recipient opted in to WhatsApp messages from your agency.');
      if (!parseContact(s.waNumber).phone) need('waNumber', 'Enter the WhatsApp number supplied by this recipient, including the country code.');
    }

    if (followup) {
      if (!cat) need('responseCategory', 'Choose the response category.');
      const pasted = norm(s.responseText);
      if (['closed', 'final'].includes(s.priorType) && !['noResponse', 'optOut', 'deliveryFailure'].includes(cat) && !pasted) need('responseText', 'This conversation has ended. Paste their reply, so Email Kit reopens it only on a real response.');
      if (cat === 'noResponse' && pasted) need('responseCategory', 'You pasted a response, so "No response" cannot be right. Confirm the correct category.');
      if (cat === 'noResponse') {
        if (followKind(s) === 'stop') need('priorType', s.priorType === 'closed'
          ? 'This conversation is closed, so Email Kit will not draft a reminder. If they have replied, choose the response category.'
          : 'You have already sent a final reminder, so Email Kit will not draft another one. Wait for the prospect to respond.');
        if (!deriveTopic(s)) need('priorTopic', 'Paste your earlier message or say what it was about. A reminder cannot refer to a message that is not on record.');
      }
      if (!noReply && s.channel === 'email' && s.priorChannel === 'email' && !norm(s.priorSubject)) need('priorSubject', 'Add the subject of your earlier email. The follow-up reuses that subject.');
      if (cat === 'referred' && !norm(s.referredName)) need('referredName', 'Add the name of the person they referred you to.');
      if (cat === 'moreInfo' && !(s.askTopics || []).length) note('No question topic is chosen, so the draft is a holding reply. Choose a topic to answer it now.', 'askTopics');
      if (s.channel === 'invite' && (cat !== 'noResponse' || s.priorChannel === 'invite' || ['final', 'checkIn', 'nudge'].includes(followKind(s)))) need('channel', 'A connection note cannot carry this follow-up. Choose email or a LinkedIn message.');
      detectUnverified(s.responseText).forEach(u => note('They may have asked about ' + u + '. Email Kit has no verified answer for this, so the draft leaves it out. Add your own answer if you have one.', 'responseText'));
      if (s.agreedDate && AGREED_CATS.includes(cat)) {
        note('Email Kit shows this date when you open it. For a reminder while Email Kit is closed, choose Add to calendar after you mark this as sent.', 'agreedDate');
        if (s.agreedDate < today) note('The agreed date has passed. Check it before sending.', 'agreedDate');
      }
      if (s.priorDate && s.priorDate > today) note('The date of your earlier message is in the future. Check it before sending.', 'priorDate');
      if (cat === 'noResponse' && s.priorChannel === 'invite' && s.channel === 'message') note('You can send a LinkedIn message only if the recipient has accepted your connection request.', 'channel');
      if (cat === 'noResponse' && followKind(s) === 'final') note('This is the final reminder. Email Kit will not draft another one.', 'priorType');
    }

    if (followup && cat === 'postponed' && !s.agreedDate) note('There is no agreed date, so the draft asks them for one. Email Kit will not guess a date.', 'agreedDate');
    if (followup && cat === 'meeting' && s.meetingDate && s.meetingDate < today && s.meetingAction !== 'cancel') need('meetingDate', 'The meeting date has passed, so this draft cannot confirm it. Correct the date, or choose Cancel the meeting.');
    if (followup && cat === 'meeting' && missingMeeting(s).length) note('The ' + joinList(missingMeeting(s)) + ' is not clear, so the draft asks for it and the meeting stays proposed.', 'meetingDate');
    const quoteWords = countWords(s.sourceQuote || '');
    if (quoteWords > CONFIG.quoteWordLimit) note('The quotation has ' + quoteWords + ' words, so the message leaves it out. Quote only the words that matter, or rely on your summary.', 'sourceQuote');

    const used = resolveReason(s, today);
    if (['vacancy', 'expansion'].includes(used.reason) && /^[A-Z]/.test(companyClause(clause(s.observation, [shortCompany(s.company), norm(s.company)])))) {
      note('Please check the finding. It should follow the company name, for example "is hiring a Store Manager in Pune".', 'observation');
    }
    if (used.fellBack) {
      const url = norm(s.sourceUrl), obs = norm(s.observation);
      let why = 'The evidence is not confirmed yet, so the message does not use it.';
      if (s.verification === 'failed') why = 'You could not confirm the finding, so the message leaves it out.';
      else if (url && !obs) why = 'A link alone is not verification. Record what you found and confirm that you checked it. Until then, the message does not use it.';
      else if (s.verification === 'confirmed' && !s.dateChecked) why = 'Add the date you checked the source. Until then, the message does not use it.';
      else if (s.dateChecked && s.dateChecked > today) why = 'The date checked is in the future. Correct it to use the observation.';
      note(why, 'observation');
    }
    if (evidenceReasonIsObservation(used.reason) && daysBetween(s.dateChecked, today) > CONFIG.evidenceStaleDays) {
      note('You checked this source ' + daysBetween(s.dateChecked, today) + ' days ago. Check that it is still accurate before sending.', 'dateChecked');
    }
    if (evidenceReasonIsObservation(s.reason) && scopeApplies(s) && norm(s.sourceUrl) && !/^https?:\/\/\S+$/i.test(norm(s.sourceUrl))) note('The source link does not start with http:// or https://, so please check it.', 'sourceUrl');

    if (!norm(s.recipientName)) note('There is no recipient name, so the message uses a general greeting.', 'recipientName');
    if (firstLike && !norm(s.designation) && s.channel !== 'invite' && used.reason === 'role') note('There is no designation, so the message does not mention the recipient\'s role.', 'designation');
    if (!followup || cat === 'noResponse') {
      const suggested = suggestResponsibility(s.designation);
      if (suggested && s.responsibility === suggested && !s.responsibilityConfirmed) note('The recipient\'s responsibility is a suggestion from their title. It is not confirmed, and the message does not state it as fact.', 'responsibility');
    }
    if (scopeApplies(s) && s.channel !== 'invite' && parseRoles(s.roles).length > 3) note('The message names the first three roles only.', 'roles');
    if (CONFIG.scope.itIndustry.some(re => re.test(norm(s.industry)))) note('This looks like an IT company. This recruitment edition can still help with its non-IT roles, so please check that the roles fit.', 'industry');
    if (s.includeTerms && firstLike && s.channel !== 'invite') note('Commercial terms in a first message can seem premature. Consider saving them until the recipient asks.', 'includeTerms');

    return { blockers, notes, scopeHits: hits };
  }

  /* One answer reads as a sentence. Several answers read as a list. */
  function answerBlock(topics, company) {
    const items = (topics || []).map(t => (t === 'clients' && !clientNames(company).length ? '' : CONFIG.answers[t] || '').replace('{clients}', joinList(clientNames(company)))).filter(Boolean);
    if (!items.length) return '';
    if (items.length === 1) return 'Here are the details you asked for. ' + items[0];
    return 'Here are the details you asked for:\n' + items.map(i => CONFIG.bullet + i).join('\n');
  }

  function clientNames(company) {
    /* Compare whole words so that a shared prefix does not suppress an unrelated reference. */
    const words = String(shortCompany(company)).toLowerCase().replace(/\.(com|in|co)\b/g, '').replace(/&/g, ' and ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const starts = words.map((w, i) => words.slice(0, i + 1).join(''));
    return CONFIG.clients.filter(c => !starts.includes(CONFIG.clientCores[c]));
  }

  /* What a client's source is called in a message. */
  function sourceLabel(s, name, company) {
    const url = norm(s.sourceUrl), linkedin = /linkedin\.com/i.test(url);
    if (s.reason === 'post') {
      if (s.postAuthor !== 'company') return 'Your ' + (linkedin ? 'LinkedIn post' : 'post');
      return possessive(company) + ' ' + (linkedin ? 'LinkedIn post' : 'post');
    }
    if (s.reason === 'vacancy') return company + (linkedin ? ' job post on LinkedIn' : ' job advertisement');
    if (s.reason === 'expansion') return company + ' announcement';
    return '';
  }

  function missingMeeting(s) {
    if (s.meetingAction === 'cancel') return [];
    return [[s.meetingDate, 'date'], [s.meetingTime, 'time'], [s.meetingZone, 'time zone']].filter(x => !x[0]).map(x => x[1]);
  }

  function buildContext(s, today) {
    today = today || localToday();
    const used = resolveReason(s, today);
    const name = parseName(s.recipientName, s.recipientTitle);
    const company = shortCompany(s.company);
    const roles = parseRoles(s.roles);
    const reason = used.reason;
    /* Someone a colleague named is the owner, so they are not asked who is. */
    const responsibility = (s.responsibility === 'unknown' || !s.responsibility) && (reason === 'referral' || s.referredBy) ? 'decision' : (s.responsibility || 'unknown');
    const contact = [norm(s.senderPhone), norm(s.senderEmail)].filter(Boolean);
    const obsRaw = reason === 'role' ? '' : s.observation;
    const quoteOk = !!norm(s.sourceQuote) && s.channel === 'email' && evidenceReasonIsObservation(reason) && countWords(s.sourceQuote) <= CONFIG.quoteWordLimit;
    const leadStrip = [company, norm(s.company)];
    const category = s.stage === 'followup' ? s.responseCategory : '';
    const kind = followKind(s);

    const vars = {
      firm: CONFIG.firm.name,
      firmDescriptor: CONFIG.firm.descriptor,
      senderName: norm(s.senderName),
      senderRole: norm(s.senderRole),
      company,
      companyPoss: company ? possessive(company) : '',
      designation: norm(s.designation),
      sector: CONFIG.answers.sectors.toLowerCase().includes(norm(s.industry).toLowerCase()) ? CONFIG.sectors[norm(s.industry)] || '' : '',
      rolesPhrase: rolePhrase(roles),
      roleOne: roles[0] || '',
      inLoc: locationPhrase(s.hiringLocations),
      obs: reason === 'vacancy' || reason === 'expansion' ? companyClause(clause(obsRaw, leadStrip)) : clause(obsRaw, leadStrip).replace(reason === 'post' ? /^(we are|is|are)\s+/i : /$^/, ''),
      when: lowerFirst(clause(reason === 'previous' ? s.conversationWhen : '')),
      referrer: reason === 'referral' ? norm(s.referrer) : '',
      priorDate: formatDate(s.priorDate, today),
      priorTopic: deriveTopic(s),
      referredName: norm(s.referredName),
      agreedSentence: agreedSentence(stepText(s.agreedStep), formatDate(s.agreedDate, today)),
      promise: promiseKind(s) === 'mine' ? stepText(s.promise) : '',
      promiseOther: promiseKind(s) === 'theirs' ? stepText(s.promise) : '',
      answers: answerBlock(s.askTopics, company),
      clients: joinList(clientNames(company)),
      clientsShort: joinList(clientNames(company).slice(0, 3)),
      postWhere: /linkedin\.com/i.test(norm(s.sourceUrl)) ? 'LinkedIn post' : 'post',
      sourceQuote: quoteOk ? norm(s.sourceQuote).replace(/^["\u201c]|["\u201d]$/g, '') : '',
      sourceLine: (quoteOk || s.includeSource) && s.channel === 'email' && evidenceReasonIsObservation(reason) ? [sourceLabel(s, name, company), norm(s.sourceUrl) ? '(' + norm(s.sourceUrl) + ')' : ''].filter(Boolean).join(' ') : '',
      noted: (s.notedFacts || []).map(f => CONFIG.bullet + f).join('\n'),
      meetMode: { call: 'call', video: 'video call', visit: 'meeting' }[s.meetingMode] || 'call',
      meetDate: formatDate(s.meetingDate, today),
      meetTime: formatTime(s.meetingTime),
      meetZone: ((CONFIG.zones.find(z => z.id === s.meetingZone) || {}).label || '').split(',')[0],
      meetMissing: joinList(missingMeeting(s)),
      movedTo: shortCompany(s.movedTo),
      optOutChannels: joinList((s.optOutChannels || []).map(c => ({ email: 'email', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', phone: 'phone calls' }[c] || c))),
      vacancyRef: roles.length > 1 ? 'these roles' : 'this role',
      optOutAck: CONFIG.optOutAck,
      termsSentence: CONFIG.commercial.sentence,
      termsLines: CONFIG.commercial.lines.map(l => CONFIG.bullet + l).join('\n'),
      rolesRef: roles.length ? rolePhrase(roles) : (reason === 'vacancy' ? 'roles like this one' : 'permanent, non-IT roles'),
      rolesExplicit: roles.length ? rolePhrase(roles) : 'permanent, non-IT roles'
    };

    /* If the vacancy finding already names every role, do not repeat them. */
    const vacancyCoversRoles = reason === 'vacancy' && roles.length > 0 && roles.every(r => vars.obs.toLowerCase().includes(r.toLowerCase()));
    if (vacancyCoversRoles) vars.rolesRef = roles.length > 1 ? 'roles like these' : 'roles like this one';

    const hasObservation = evidenceReasonIsObservation(reason);
    const hasRelation = reason === 'referral' || reason === 'previous';
    const termsAllowed = s.channel !== 'invite' && (s.stage !== 'followup' || ['interested', 'moreInfo', 'meeting'].includes(category));
    const showTerms = termsAllowed && !!s.includeTerms;

    return {
      state: s, today, vars, name, reason, usedReason: used, responsibility, category, kind,
      channel: s.channel, stage: s.stage, priorChannel: s.priorChannel || 'email',
      /* The firm's own email asks for a convenient time, so a known opening does too. */
      desired: !s.desiredConfirmed && responsibility === 'decision' && ['post', 'vacancy'].includes(reason) ? 'call' : s.desired, hasObservation, hasRelation, hasEvidence: hasObservation || hasRelation,
      hasAgreed: !!vars.agreedSentence,
      showTerms, contact, roles, vacancyCoversRoles,
      permission: s.referralPermission || 'unclear',
      postKey: s.postAuthor === 'company' ? 'postCompany' : 'postRecipient'
    };
  }

  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (all, key) => (vars[key] == null ? '' : vars[key]));
  }
  function pick(list, vars) {
    for (const t of list || []) {
      const needed = (t.match(/\{(\w+)\}/g) || []).map(k => k.slice(1, -1));
      if (needed.every(k => vars[k])) return fill(t, vars);
    }
    return '';
  }

  function desiredOptions(ctx) {
    if (['interested', 'moreInfo', 'commercial'].includes(ctx.category)) return CONFIG.desired.afterReply;
    return CONFIG.desired[ctx.responsibility] || CONFIG.desired.unknown;
  }
  function desiredFor(ctx) {
    const list = desiredOptions(ctx);
    return (list.find(o => o.id === ctx.desired) || list[0]).id;
  }

  function reasonKey(ctx) { return ctx.reason === 'post' ? ctx.postKey : ctx.reason; }

  function bridgeKey(ctx) {
    if (ctx.responsibility === 'influencer' || ctx.responsibility === 'unknown') return ctx.responsibility;
    if (ctx.reason === 'vacancy') return ctx.responsibility === 'vendor' ? 'vacancyVendor' : 'vacancy';
    if (ctx.reason === 'expansion') return 'expansion';
    if (ctx.reason === 'post' && ctx.responsibility !== 'vendor') return 'post';
    return '';
  }

  function slotText(name, ctx, greeting) {
    const v = ctx.vars, ch = ctx.channel, S = SLOTS;
    const key = desiredFor(ctx);
    switch (name) {
      case 'greetInline': return greeting;
      case 'hook': case 'hookAfter':
        if (ctx.state.formerCompany && ctx.reason === 'previous') return pick(S.hookFormer, v);
        return pick((S[name] || {})[reasonKey(ctx)], v);
      case 'hookNoteShort': case 'followNew':
        return pick((S[name] || {})[reasonKey(ctx)], v);
      case 'intro': case 'introName':
        return pick(S[name][ch === 'email' ? 'email' : 'message'], v);
      case 'followOpen': case 'followOpenShort': return pick(S[name][ctx.priorChannel], v);
      case 'roleReason': return pick(S.roleReason[ctx.responsibility], v);
      case 'roleOnly': return ctx.hasEvidence ? '' : pick(S.roleReason[ctx.responsibility], v);
      case 'scopeNew': return ctx.priorChannel === 'invite' ? pick(S.scopeBase, v) : '';
      case 'meetingLine': return pick({ cancel: S.meetingCancel, change: S.meetingChange }[ctx.state.meetingAction] || S.meetingConfirm, v);
      case 'meetingTopicLine': return ctx.state.meetingAction === 'cancel' ? '' : pick(S.meetingTopic, v);
      case 'promiseCloseLine': return pick(v.promise ? S.promiseClose.mine : S.promiseClose.theirs, v);
      case 'bridgeShort': return pick(S.bridgeShort[bridgeKey(ctx)] || S.bridge[bridgeKey(ctx)], v);
      case 'optOutAckLine': return ctx.state.optOutScope === 'channel' && v.optOutChannels ? pick(S.optOutChannelAck, v) : pick(S.optOutAck, v);
      case 'askMoved':
        /* What they already said is not asked again. */
        if (v.movedTo && /\bas (?:an? |the )?(?:[A-Z][\p{L}&-]*\s?){1,5}/u.test(String(ctx.state.responseText || ''))) return pick(S.askMovedDone, v);
        return pick(v.movedTo ? S.askMoved.known : S.askMoved.unknown, v);
      case 'openAnswer': return ctx.state.owedAnswer ? pick(S.owedLine, v) : pick(S.thanksReply, v);
      case 'heldNext': return ctx.hasAgreed ? pick(S.agreedLine, v) : pick(S.furtherDetail, v);
      case 'bridge': return pick(S.bridge[bridgeKey(ctx)], v);
      case 'cta': return pick(S.cta[ctx.responsibility][key], ctx.stage === 'followup' ? Object.assign({}, v, { rolesRef: v.rolesExplicit }) : v);
      case 'ctaFirst': return pick(S.cta[ctx.responsibility][key], Object.assign({}, v, { rolesRef: v.rolesExplicit }));
      case 'closeEasy': return pick(S.closeEasy[key] || S.closeEasy.any, v);
      case 'commCta': return pick(S.commCta[key], v);
      case 'commAgreed': return ctx.hasAgreed ? pick(S.agreedLine, v) : pick(S.commCta[key], v);
      case 'askA': case 'askB': return pick(S[name][ctx.responsibility], v);
      case 'scope': return pick(ctx.vacancyCoversRoles ? S.scopeBase : S.scope, v);
      case 'referralPlan': return pick(S.referralPlan[ctx.permission], v);
      case 'laterWelcome': return pick(S.laterWelcome[ctx.category], v);
      case 'optOutLine': return ctx.stage === 'first' && !ctx.hasRelation && (ch === 'email' || ch === 'whatsapp') ? pick(S.optOutLine, v) : '';
      case 'sectorsLine': return v.sector ? '' : CONFIG.answers.sectors;
      case 'screening': case 'processIntro': return CONFIG.answers.services;
      case 'terms': return ctx.showTerms ? pick(S.terms, v) : '';
      default: return pick(S[name], v);
    }
  }

  function structuresFor(ctx) {
    if (ctx.stage !== 'followup') {
      const family = FAMILIES[ctx.channel];
      return family[ctx.stage] || family.first;
    }
    if (ctx.channel === 'invite') return FAMILIES.invite.followup;
    if (ctx.category === 'noResponse') return FOLLOW_UPS[['final', 'checkIn', 'nudge', 'promise', 'askDate', 'meetingChase'].includes(ctx.kind) ? ctx.kind : 'reminder'];
    return FOLLOW_UPS[ctx.category] || [];
  }

  function isAvailable(angle, ctx) {
    if (angle.channels && !angle.channels.includes(ctx.channel)) return false;
    switch (angle.needs) {
      case 'evidence': return ctx.hasEvidence;
      case 'observation': return ctx.hasObservation;
      case 'relation': return ctx.hasRelation;
      case 'none': return !ctx.hasEvidence;
      case 'agreed': return ctx.hasAgreed;
      case 'noAgreed': return !ctx.hasAgreed;
      case 'firstHolding': return !ctx.vars.answers && !ctx.state.owedAnswer;
      case 'owedOpen': return !ctx.vars.answers && !!ctx.state.owedAnswer;
      case 'answersAgreed': return !!ctx.vars.answers && ctx.hasAgreed;
      case 'answersOnly': return !!ctx.vars.answers && !ctx.hasAgreed;
      case 'notDirection': return ctx.responsibility !== 'influencer' && ctx.responsibility !== 'unknown' && desiredFor(ctx) !== 'direction';
      case 'requirementOpen': return !ctx.hasAgreed && !ctx.vars.noted;
      case 'meetingClear': return !missingMeeting(ctx.state).length;
      case 'meetingUnclear': return !!missingMeeting(ctx.state).length;
      default: return true;
    }
  }

  function tidy(text) {
    return text.split('\n').map(line => line.replace(/[ \t]+/g, ' ').replace(/\s+([,.?!;:])/g, '$1').replace(/\.{2,}/g, '.').replace(/\?\./g, '?').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function signature(ctx) {
    if (ctx.channel !== 'email') return '';
    const v = ctx.vars;
    return ['Regards,', v.senderName, v.senderRole, v.firm].concat(ctx.contact).filter(Boolean).join('\n');
  }

  function assemble(angle, tier, ctx, extend) {
    const drop = tier.drop || [], swap = tier.swap || {};
    const name = ctx.name;
    const greeting = greetingFor(ctx.channel, name);
    const text = slot => slotText(swap[slot] || slot, ctx, greeting);
    const kept = slots => slots.filter(slot => !drop.includes(slot)).map(text).filter(Boolean);
    const paras = angle.paras.map(para => {
      if (Array.isArray(para)) return kept(para).join(' ');
      const items = kept(para.items);
      return items.length > 1 ? text(para.head) + '\n' + items.map(i => CONFIG.bullet + i).join('\n') : items.join('');
    }).filter(Boolean);
    if (extend && paras.length > 1) {
      const at = paras[paras.length - 1] === pick(SLOTS.optOutLine, ctx.vars) ? paras.length - 2 : paras.length - 1;
      paras[at] = pick(SLOTS.moreLine, ctx.vars) + ' ' + paras[at];
    }
    /* In a one-paragraph note the greeting runs into the next sentence. */
    if (ctx.channel === 'invite' && paras[0].startsWith(greeting + ' ')) {
      const rest = paras[0].slice(greeting.length + 1);
      paras[0] = greeting + ' ' + rest.replace(/^(At|May|It)\b/, w => w.toLowerCase());
    }
    if (ctx.channel !== 'invite') paras.unshift(greeting);
    const sig = signature(ctx);
    if (sig) paras.push(sig);
    return tidy(paras.join('\n\n'));
  }

  /* Word and character minimums apply to first messages. Follow-ups should be shorter. */
  function targetApplies(ctx) {
    return ctx.channel !== 'invite' && ctx.stage !== 'followup';
  }

  function fits(body, ctx, limits) {
    if (ctx.channel === 'invite') return countChars(body) <= limits.inviteHard;
    if (ctx.channel === 'message' || ctx.channel === 'whatsapp') return countChars(body) <= limits.messageMax;
    return countWords(body) <= limits.emailMax;
  }

  function subjectFor(ctx) {
    if (ctx.channel !== 'email') return '';
    const v = ctx.vars;
    let list;
    if (ctx.stage === 'followup') {
      if (norm(ctx.state.priorSubject)) return norm(ctx.state.priorSubject);
      list = ctx.category === 'commercial' ? SUBJECTS.commercial : SUBJECTS.followup;
    } else if (ctx.reason === 'referral') list = SUBJECTS.referral;
    else if (ctx.reason === 'previous') list = SUBJECTS.previous;
    else if (ctx.responsibility === 'vendor') list = SUBJECTS.vendor;
    else if (ctx.responsibility === 'influencer' || ctx.responsibility === 'unknown') list = SUBJECTS.direction;
    else if (ctx.reason === 'post' && ctx.postKey === 'postCompany') list = SUBJECTS.postCompany;
    else list = SUBJECTS[ctx.reason];
    for (const t of list) {
      const text = pick([t], v);
      if (text && countChars(text) <= CONFIG.subjectTarget) return tidy(text);
    }
    return tidy(pick([list[list.length - 1]], v));
  }

  function renderAngle(angle, ctx, limits) {
    const tiers = angle.tiers || [{}];
    let last = null;
    for (let i = 0; i < tiers.length; i++) {
      const body = assemble(angle, tiers[i], ctx);
      last = { id: angle.id, label: angle.label, difference: angle.difference, body, tier: i, droppedEvidence: !!tiers[i].dropsEvidence, shortened: i > 0, fits: fits(body, ctx, limits) };
      if (last.fits) break;
    }
    /* A short email gets one approved extra sentence if that reaches the target. */
    if (ctx.channel === 'email' && targetApplies(ctx) && countWords(last.body) < limits.emailMin && desiredFor(ctx) !== 'details') {
      last.body = assemble(angle, tiers[last.tier], ctx, true);
    }
    last.subject = subjectFor(ctx);
    last.chars = countChars(last.body);
    last.words = countWords(last.body);
    return last;
  }

  /* Recommendation order. Early entries are recommended first. */
  function rank(angles, ctx) {
    const order = a => {
      if (ctx.channel !== 'invite' && a.id === 'question' && !ctx.hasEvidence && (ctx.responsibility === 'influencer' || ctx.responsibility === 'unknown')) return -1;
      if (ctx.category === 'interested' && a.id === 'requirement' && desiredFor(ctx) === 'requirement') return -1;
      return angles.indexOf(a);
    };
    return angles.slice().sort((x, y) => order(x) - order(y));
  }

  const RESP_REQUEST = {
    decision: 'The request asks about relevant recruitment support.',
    recruiter: 'The request checks whether external partners are used and who manages them.',
    vendor: 'The request asks about empanelment or assessment.',
    influencer: 'The request asks for direction to the right colleague, because this person may not make the decision.',
    unknown: 'The request politely establishes who handles partnerships, because the recipient\'s responsibility is unknown.'
  };

  function explain(ctx, cand) {
    const lines = [];
    const channel = CONFIG.channels.find(c => c.id === ctx.channel).label;
    const who = CONFIG.responsibilities.find(r => r.id === ctx.responsibility).label.toLowerCase();
    const usesEvidence = (ctx.vars.obs && cand.body.includes(ctx.vars.obs)) || (ctx.vars.referrer && cand.body.includes(ctx.vars.referrer));
    const reasonLabel = { vacancy: 'your confirmed vacancy finding', expansion: 'your confirmed expansion finding', post: 'the public post you checked', referral: 'the referral you confirmed', previous: 'your earlier conversation' }[ctx.reason];
    if (ctx.stage === 'followup') {
      lines.push('Channel: ' + channel + '.');
      if (ctx.channel === 'email' && norm(ctx.state.priorSubject)) lines.push('The subject reuses your earlier subject.');
      if (ctx.category === 'noResponse') lines.push('The message refers only to the earlier message you recorded.' + (usesEvidence ? ' It also uses ' + reasonLabel + '.' : ''));
    } else {
      lines.push('Channel: ' + channel + '. Recipient responsibility: ' + who + '.');
      lines.push(usesEvidence ? 'The message uses ' + reasonLabel + '.' : 'The opening is a role-based introduction.');
      if (usesEvidence && ctx.reason === 'vacancy') lines.push('A vacancy does not prove that the company wants an external agency, so the message does not assume it.');
      if (usesEvidence && ctx.reason === 'expansion') lines.push('An expansion does not prove hiring, so the message keeps that conditional.');
      lines.push(RESP_REQUEST[ctx.responsibility]);
    }
    if (ctx.category === 'commercial') lines.push('Commercial terms appear because they asked. The replacement condition stays in the text.');
    else if (ctx.channel === 'invite') lines.push('Connection notes never carry commercial terms.');
    else if (ctx.showTerms) lines.push('Commercial terms appear because you chose to include them.');
    if (cand.shortened) lines.push(cand.droppedEvidence
      ? 'An approved shorter version is in use, and it leaves out the observation so the note fits. Shorten the observation to include it.'
      : 'An approved shorter version is in use so the text fits the limit or target.');
    return lines.join(' ');
  }

  /* The next step shown beside a follow-up draft. */
  function nextStepFor(ctx) {
    const s = ctx.state, cat = ctx.category;
    if (!cat) return '';
    const base = CONFIG.responses.find(r => r.id === cat).next;
    if (cat === 'noResponse') {
      if (ctx.kind === 'stop') return 'Stop here. Choose a response category only if they reply.';
      if (ctx.kind === 'checkIn') return 'Make the contact you agreed and ask one simple question.';
      return ctx.kind === 'final' ? 'Send a final reminder that asks for nothing, then stop.' : base;
    }
    if (cat === 'optOut' && s.optOutScope === 'review') return 'Send nothing yet. Outreach is paused until you review this restriction.';
    if (cat === 'optOut') return s.noReplyRequested ? 'Send nothing. They asked for no reply, and the prospect stays marked Do not contact.' : base;
    if (cat === 'referred') {
      const who = ctx.vars.referredName || 'the person they named';
      if (ctx.permission === 'yes') return 'Thank them, then contact ' + who + ' and mention their name.';
      if (ctx.permission === 'no') return 'Thank them, then contact ' + who + ' without mentioning their name.';
      return 'Thank them and ask whether you may mention their name to ' + who + '.';
    }
    if ((cat === 'noRequirement' || cat === 'otherAgency' || cat === 'interested') && ctx.hasAgreed) return 'Confirm the next step you agreed.';
    if (cat === 'postponed' && !ctx.hasAgreed) return 'Ask for a suitable date. Email Kit pauses reminders while you wait.';
    if (cat === 'meeting' && missingMeeting(s).length) return 'Ask for the ' + joinList(missingMeeting(s)) + '. The meeting stays proposed until then.';
    return base;
  }

  function overflowAdvice(ctx, top, limits) {
    const s = ctx.state, over = top.chars - limits.inviteHard;
    const values = [
      ['the recipient name', norm(s.recipientName)], ['the company name', ctx.vars.company],
      ['the observation', ctx.vars.obs], ['the referrer name', ctx.vars.referrer],
      ['the earlier message summary', ctx.vars.priorTopic], ['the designation', ctx.vars.designation]
    ].filter(v => v[1] && top.body.includes(v[1])).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
    const longest = values.map(v => v[0] + ' (' + countChars(v[1]) + ' characters)');
    return 'Even the shortest approved version is ' + top.chars + ' characters, which is ' + over + ' over the ' + limits.inviteHard + '-character limit.' +
      (longest.length ? ' Shorten ' + joinList(longest) + ', or edit the note directly.' : ' Edit the note directly, or raise the limit.');
  }

  function summaryFor(state, today) {
    const ctx = buildContext(state, today);
    return ctx.category ? { category: CONFIG.responses.find(r => r.id === ctx.category).label, nextStep: nextStepFor(ctx), doNotContact: ctx.category === 'optOut' } : null;
  }

  function compose(state, limits, today) {
    const ctx = buildContext(state, today);
    const summary = summaryFor(state, today);
    /* Nothing is acknowledged until a possible opt-out has been reviewed. */
    if ((ctx.category === 'optOut' && (state.noReplyRequested || state.optOutScope === 'review')) || ctx.category === 'deliveryFailure') {
      return { ctx, candidates: [], noMessage: true, summary, targetActive: false, overflow: '' };
    }
    const angles = rank(structuresFor(ctx).filter(a => isAvailable(a, ctx)), ctx);
    const seen = new Set();
    const list = angles.map(a => renderAngle(a, ctx, limits)).filter(c => {
      // Reordering the same sentences is not a useful alternative.
      const contentKey = c.body.split(/\n+|(?<=[.!?])\s+/u).map(s => s.trim()).filter(Boolean).sort().join('\n');
      if (seen.has(contentKey)) return false;
      seen.add(contentKey);
      return true;
    });
    /* A version that fits always beats one that does not. */
    list.sort((a, b) => Number(b.fits) - Number(a.fits));
    list.forEach(c => { c.why = explain(ctx, c); });
    const top = list[0];
    const overHard = ctx.channel === 'invite' && !top.fits;
    return {
      ctx, candidates: list, summary,
      targetActive: targetApplies(ctx),
      overflow: overHard ? overflowAdvice(ctx, top, limits) : ''
    };
  }

  /* Checks any text, generated or edited by hand. */
  function lint(body, channel, termsAllowed, subject, firstContact) {
    const block = [], warn = [];
    const L = CONFIG.lint;
    if (L.placeholder.test(body)) block.push('The message contains an unresolved placeholder. Replace it before copying.');
    if (channel === 'invite' && L.commercial.test(body)) block.push('Connection notes must not carry commercial terms. Remove them before copying.');
    if (L.dash.test(body)) warn.push('The message contains a long dash. Replace it with a comma or a new sentence.');
    const claim = body.match(L.claims);
    if (claim) warn.push('"' + claim[0] + '" may be an unsupported claim or artificial urgency. Keep it only if you can support it.');
    if (channel !== 'invite' && !termsAllowed && CONFIG.commercial.lines.some(line => body.includes(line))) warn.push('The message mentions the fee, but commercial terms are not selected.');
    if (channel === 'email') {
      const links = (body.match(/https?:\/\/|www\./gi) || []).length;
      if (links > 1) warn.push('This email has ' + links + ' links. One link at most is safer in a first email, because several links can look like spam.');
      const spam = body.match(L.spamPhrases);
      if (spam) warn.push('"' + spam[0] + '" can look like spam. Please reword it.');
      if (/!{2,}/.test(body) || (body.match(/!/g) || []).length > 1) warn.push('Several exclamation marks can look like spam. Please use one at most.');
      const shouting = (body.match(/\b[A-Z]{5,}\b/g) || []).length;
      if (shouting > 1 || (subject && subject.length > 8 && subject === subject.toUpperCase())) warn.push('Words in capitals can look like spam. Please use normal capitals.');
      if (firstContact && L.fakeReply.test(subject || '')) warn.push('The subject starts with "Re:" or "Fwd:", but this is a first message. Please remove it, because it suggests a conversation that did not happen.');
    }
    return { block, warn };
  }

  /* ---------- Follow-up timing and the tracker ---------- */
  function addWorkdays(iso, days) {
    const d = new Date(iso + 'T00:00:00Z');
    let left = days;
    /* A week with no working day must never trap this loop. */
    if (CONFIG.weekendDays.length > 6) left = 0;
    while (left > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (!CONFIG.weekendDays.includes(d.getUTCDay())) left--;
    }
    return d.toISOString().slice(0, 10);
  }

  /* Uses an agreed date first. Otherwise follows the cadence and stops at the end. */
  function nextFollowUp(s, today) {
    if (s.stage === 'followup' && s.agreedDate && AGREED_CATS.includes(s.responseCategory)) return s.agreedDate;
    if (s.stage !== 'followup') return addWorkdays(today, CONFIG.cadence.firstReminder);
    if (s.responseCategory === 'noResponse') return ['reminder', 'checkIn', 'nudge'].includes(followKind(s)) ? addWorkdays(today, CONFIG.cadence.finalReminder) : '';
    if (['interested', 'moreInfo', 'commercial'].includes(s.responseCategory)) return addWorkdays(today, CONFIG.cadence.afterReply);
    return '';
  }

  function sentType(s) {
    if (s.stage !== 'followup') return 'first';
    if (s.resend) return s.resend;
    if (s.responseCategory === 'noResponse') return followKind(s) === 'final' ? 'final' : 'reminder';
    return 'reply';
  }


  /* A plain topic for later reminders. Subjects do not always read well in a sentence. */
  function topicFor(s) {
    if (s.stage === 'followup' && deriveTopic(s)) return deriveTopic(s);
    if (s.responsibility === 'vendor') return 'recruitment partner empanelment';
    const company = shortCompany(s.company);
    return company ? 'recruitment support for ' + company : 'recruitment support';
  }

  function dueLabel(entry, today) {
    if (!entry.nextDate) return 'No follow-up is planned.';
    const days = daysBetween(entry.nextDate, today);
    if (days > 0) return 'The follow-up is overdue by ' + days + (days === 1 ? ' day.' : ' days.');
    if (days === 0) return 'The follow-up is due today.';
    return 'The next follow-up is on ' + formatDate(entry.nextDate, today) + '.';
  }

  function isDue(entry, today) { return !!entry.nextDate && entry.nextDate <= today; }

  /* A leading quote stops spreadsheets treating a value as a formula. */
  function csvCell(value) {
    let t = String(value == null ? '' : value);
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replace(/"/g, '""') + '"';
  }
  function trackerCsv(entries) {
    const head = ['Name', 'Company', 'Designation', 'Contact', 'Status', 'Last contact', 'Last channel', 'Next follow-up', 'Conversation ID', 'Hiring need', 'Next action', 'Owner', 'Outcome', 'Mandate status', 'Mandate reference'];
    const rows = entries.map(e => [e.recipientName, e.company, e.designation, e.recipientContact, e.status, e.lastDate, (CONFIG.channels.find(c => c.id === e.channel) || {}).label || '', e.nextDate, e.id, e.roles || e.topic, e.nextAction, e.owner, e.outcome, e.mandateStatus, e.mandateRef]);
    return [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  function icsText(t) { return String(t).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n'); }
  /* Folds by whole characters, so an emoji is never split in two. */
  function icsFold(line) {
    const chars = Array.from(line), out = [];
    while (chars.length > 72) out.push((out.length ? ' ' : '') + chars.splice(0, 72).join(''));
    out.push((out.length ? ' ' : '') + chars.join(''));
    return out.join('\r\n');
  }
  function calendarFile(entry) {
    const date = entry.nextDate.replace(/-/g, '');
    const next = new Date(entry.nextDate + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    const end = next.toISOString().slice(0, 10).replace(/-/g, '');
    const who = [entry.recipientName, entry.company].filter(Boolean).join(' at ');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Job Point Consultancy//Email Kit//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:usha-followup-' + encodeURIComponent(entry.id || [entry.company, entry.recipientName].join('-')) + '-' + date + '@usha.local', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + date, 'DTEND;VALUE=DATE:' + end,
      'SUMMARY:' + icsText('Follow up with ' + who), 'DESCRIPTION:' + icsText('Open Email Kit and choose Continue in the tracker.'), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', 'DESCRIPTION:Review the follow-up in Email Kit', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function parseContact(raw) {
    const t = norm(raw);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { email: t, phone: '' };
    const digits = t.replace(/[^\d]/g, '');
    const international = /^\+[1-9][0-9 ().-]+$/.test(t) && digits.length >= 8 && digits.length <= 15;
    return { email: '', phone: international ? digits : '' };
  }
  function mailLink(contact, subject, body) {
    const q = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.replace(/\r?\n/g, '\r\n'));
    return 'mailto:' + encodeURIComponent(parseContact(contact).email).replace(/%40/g, '@') + '?' + q;
  }
  function whatsappLink(contact, body) {
    return 'https://wa.me/' + parseContact(contact).phone + '?text=' + encodeURIComponent(body);
  }

  /* ---------- Reading a pasted reply ----------
     These rules find only what is written plainly. They do not understand a
     reply, so every result is a suggestion for the user to confirm, and
     anything uncertain is marked rather than guessed. */
  const MONTH_NAMES = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const monthIndex = t => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(t.slice(0, 3).toLowerCase());
  function isoDate(y, m, d) {
    const x = new Date(Date.UTC(y, m, d));
    if (x.getUTCMonth() !== m || x.getUTCDate() !== d) return '';
    return x.toISOString().slice(0, 10);
  }
  const shift = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  function nextYearIfPast(m, d, today) {
    const y = Number(today.slice(0, 4));
    const iso = isoDate(y, m, d);
    return iso && iso < today ? isoDate(y + 1, m, d) : iso;
  }

  function extractDates(text, today) {
    const src = String(text || ''), found = [];
    const add = (index, iso, raw, sure, note) => { if (iso) found.push({ index, iso, text: raw, sure, note: note || '' }); };
    let m;
    const scan = (re, fn) => { const r = new RegExp(re.source, re.flags); while ((m = r.exec(src))) fn(m); };
    scan(/\b(\d{4})-(\d{2})-(\d{2})\b/g, x => add(x.index, isoDate(+x[1], +x[2] - 1, +x[3]), x[0], true));
    scan(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/g, x => {
      const y = +x[3] < 100 ? 2000 + +x[3] : +x[3];
      const both = +x[1] <= 12 && +x[2] <= 12 && x[1] !== x[2];
      add(x.index, isoDate(y, +x[2] - 1, +x[1]), x[0], !both, both ? 'This could be day first or month first. Email Kit read it as day first.' : '');
    });
    scan(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(' + MONTH_NAMES + ')\\b\\.?,?(?:\\s+(\\d{4}))?', 'gi'), x => {
      const mi = monthIndex(x[2]);
      add(x.index, x[3] ? isoDate(+x[3], mi, +x[1]) : nextYearIfPast(mi, +x[1], today), x[0], true);
    });
    scan(new RegExp('\\b(' + MONTH_NAMES + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!:)(?:,?\\s+(\\d{4}))?', 'gi'), x => {
      const mi = monthIndex(x[1]);
      add(x.index, x[3] ? isoDate(+x[3], mi, +x[2]) : nextYearIfPast(mi, +x[2], today), x[0], true);
    });
    scan(/\b(day after tomorrow|tomorrow|today)\b/gi, x => add(x.index, shift(today, { today: 0, tomorrow: 1, 'day after tomorrow': 2 }[x[1].toLowerCase()]), x[0], true));
    const dow = new Date(today + 'T00:00:00Z').getUTCDay();
    scan(new RegExp('\\b(next|this|coming)?\\s*(' + WEEKDAYS.join('|') + ')\\b', 'gi'), x => {
      const target = WEEKDAYS.indexOf(x[2].toLowerCase());
      let gap = (target - dow + 7) % 7 || 7;
      const next = /next/i.test(x[1] || '');
      if (next && gap < 7 - dow) gap += 7;
      add(x.index, shift(today, gap), norm(x[0]), !next, next ? '"Next" can mean this coming week or the one after. Please check it.' : '');
      found[found.length - 1].weekday = target;
    });
    scan(/\bin (\d+|a|one|two|three|four|six) (day|week|month)s?\b/gi, x => {
      const n = { a: 1, one: 1, two: 2, three: 3, four: 4, six: 6 }[x[1].toLowerCase()] || +x[1];
      add(x.index, shift(today, n * { day: 1, week: 7, month: 30 }[x[2].toLowerCase()]), x[0], false, 'This is an approximate date.');
    });
    scan(/\bnext (week|month|quarter|year)\b/gi, x => {
      const unit = x[1].toLowerCase(), y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1;
      const iso = unit === 'week' ? shift(today, (8 - dow) % 7 || 7) : unit === 'month' ? isoDate(y, mo + 1 > 11 ? 0 : mo + 1, 1).replace(/^\d{4}/, String(mo === 11 ? y + 1 : y))
        : unit === 'year' ? y + 1 + '-01-01' : (() => { const q = Math.floor(mo / 3) + 1; return q === 4 ? (y + 1) + '-01-01' : isoDate(y, q * 3, 1); })();
      add(x.index, iso, x[0], false, 'This is an approximate date.');
    });
    scan(new RegExp('\\b(?:in|early|mid|late|end of|by)\\s+(' + MONTH_NAMES + ')\\b(?!\\s+\\d)', 'gi'), x => add(x.index, nextYearIfPast(monthIndex(x[1]), 1, today), x[0], false, 'Only the month is clear.'));
    /* "Tuesday 10 November" is one date. The written date wins over the weekday,
       and a weekday that does not fit it is flagged. */
    const written = found.filter(d => d.weekday === undefined);
    const kept = found.filter(d => {
      if (d.weekday === undefined) return true;
      const near = written.find(e => (e.index >= d.index && e.index <= d.index + d.text.length + 4) || (d.index >= e.index && d.index <= e.index + e.text.length + 4));
      if (!near) return true;
      if (new Date(near.iso + 'T00:00:00Z').getUTCDay() !== d.weekday) { near.sure = false; near.note = 'The weekday and the date do not match. Please check them.'; }
      return false;
    });
    const out = [];
    kept.sort((a, b) => a.index - b.index).forEach(d => { if (!out.some(o => o.iso === d.iso)) out.push(d); });
    return out;
  }

  function extractTimes(text) {
    const src = String(text || ''), out = [];
    const add = (h, min, raw, sure, note) => { if (h <= 23 && min <= 59) out.push({ time: String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0'), text: raw, sure, note: note || '' }); };
    const hour12 = (h, mer) => (/p/i.test(mer) ? (h % 12) + 12 : h % 12);
    let m;
    const a = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?m\b\.?/gi;
    while ((m = a.exec(src))) add(hour12(+m[1], m[3]), +(m[2] || 0), m[0], true);
    const b = /\b(\d{1,2}):(\d{2})\b(?!\s*[ap]\.?m)/gi;
    while ((m = b.exec(src))) add(+m[1], +m[2], m[0], +m[1] >= 13 || +m[1] === 0, +m[1] >= 13 ? '' : 'This could be morning or afternoon.');
    const c = /\bat (\d{1,2})\b(?![:.\d]|\s*[ap]\.?m|\s*(?:st|nd|rd|th)\b)/gi;
    while ((m = c.exec(src))) add(+m[1], 0, m[0], false, 'This could be morning or afternoon.');
    if (/\bnoon\b|\bmidday\b/i.test(src)) add(12, 0, 'noon', true);
    return out;
  }

  function extractZone(text) {
    const src = String(text || '');
    const m = src.match(/\b(IST|GST|SGT|GMT|UTC|BST)\b/);
    if (m) return CONFIG.zoneWords[m[1]];
    return /\bindia(n)? (standard )?time\b/i.test(src) ? 'Asia/Kolkata' : '';
  }

  function optOutScope(text) {
    const W = CONFIG.optOutWords, t = String(text || '');
    /* A channel counts only where the wording stops it, so "email is fine" stays open. */
    const channels = Object.keys(W.channels).filter(k => new RegExp("\\b(stop|no|not|don'?t|do not|never|cease|avoid)\\b[^.,;]{0,24}\\b(" + W.channels[k] + ')\\b', 'i').test(t));
    if (W.temporary.test(t)) return { scope: 'review', channels: [] };
    if (W.broad.test(t)) return { scope: W.organisation.test(t) ? 'organisation' : 'all', channels: [] };
    if (W.organisation.test(t)) return { scope: 'organisation', channels: [] };
    if (channels.length) return { scope: 'channel', channels };
    return { scope: 'review', channels: [] };
  }

  /* Splits headers such as From: and Subject: from a pasted email. */
  function parseHeaders(text) {
    const src = String(text || '');
    const get = name => { const m = new RegExp('^\\s*' + name + '\\s*:\\s*(.+)$', 'im').exec(src); return m ? norm(m[1]) : ''; };
    const from = get('From');
    const email = (from.match(/[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/) || [''])[0];
    return { from, email, name: norm(from.replace(/<[^>]*>/, '').replace(email, '').replace(/"/g, '')), subject: get('Subject'), date: get('Date') };
  }

  /* Removes earlier quoted text and headers, so old wording is not read as new. */
  function replyBody(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const end = lines.findIndex(l => /^\s*(on .{5,80} wrote:|-{2,}\s*original message|from:\s.+@.+\.\S+\s*$)/i.test(l) && lines.indexOf(l) > 0 && lines.slice(0, lines.indexOf(l)).some(x => x.trim() && !/^\s*(from|to|subject|date|sent|cc)\s*:/i.test(x)));
    return (end > 0 ? lines.slice(0, end) : lines).filter(l => !/^\s*>/.test(l) && !/^\s*(from|to|subject|date|sent|cc)\s*:/i.test(l)).join('\n').trim();
  }

  function interpret(text, today) {
    today = today || localToday();
    const body = replyBody(text);
    const flat = norm(body);
    const matches = flat ? CONFIG.responseRules.filter(r => r.test.test(flat)).map(r => r.id) : [];
    const dates = extractDates(body, today), times = extractTimes(body);
    /* A day or time beside "talk" or "call" is a meeting request, even as a question. */
    if ((dates.length || times.length) && /\b(talk|speak|call|meet|connect|discuss)\b/i.test(flat) && !matches.includes('meeting') && CONFIG.compatibleResponses.includes(matches[0] || 'interested')) matches.unshift('meeting');
    /* "Not interested" must not also count as interested. */
    if (matches.includes('notInterested')) matches.splice(0, matches.length, ...matches.filter(id => id !== 'interested'));
    if (matches[0] === 'optOut' && CONFIG.optOutWords.temporary.test(flat) && !matches.includes('postponed')) matches.push('postponed');
    const mixed = matches.slice(1).filter(id => !(CONFIG.compatibleResponses.concat('meeting').includes(matches[0]) && CONFIG.compatibleResponses.includes(id)));
    const zone = extractZone(body);
    const emails = flat.match(/[^\s<>"(),;:]+@[^\s<>"(),;:]+\.[a-z]{2,}/gi) || [];
    const phones = (flat.match(/(?:\+?\d[\d\s-]{8,}\d)/g) || []).map(norm).filter(p => parseContact(p).phone);
    const named = /\b(?:contact|speak (?:to|with)|talk to|write to|connect with|get in touch with|reach out to)\s+(?:Mr\.?\s|Ms\.?\s|Mrs\.?\s|Dr\.?\s)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/.exec(flat);
    const declinedMeeting = /\b(?:cannot|can't|can’t|couldn't|unable to|do not want to|don't want to)\s+(?:meet|attend|make it|join)\b/i.test(flat);
    if (declinedMeeting && matches[0] === 'meeting') matches.unshift('unclear');
    const category = matches[0] || '';
    const questions = flat.split(/(?<=[.?!])\s+/).filter(q => /\?$/.test(q) && q.length > 6).slice(0, 5);
    const clarify = [];
    if (!flat) clarify.push('The reply is empty.');
    else if (!category) clarify.push('Email Kit could not match this reply to a category. Choose one, or choose Generate message to keep it as Unclear.');
    if (mixed.length) clarify.push('The reply could mean more than one thing. Please confirm the category.');
    dates.filter(d => !d.sure).forEach(d => clarify.push('"' + d.text + '": ' + d.note));
    times.filter(x => !x.sure).forEach(x => clarify.push('"' + x.text + '": ' + x.note));
    const vague = flat.match(/\b(?:after (?:diwali|holi|eid|christmas|the (?:holidays?|festival|quarter|budget))|(?:this|next) (?:morning|afternoon|evening)|sometime|soon|shortly)\b/gi) || [];
    vague.forEach(v => clarify.push('"' + v + '" does not give a date Email Kit can use.'));
    return {
      body, category, alternatives: mixed, certain: !!category && !mixed.length && !dates.some(d => !d.sure), matches,
      optOut: category === 'optOut' || matches.includes('optOut') ? optOutScope(flat) : null,
      dates, times, zone, questions, clarify,
      people: { name: named ? named[1] : '', emails, phones },
      topics: detectTopics(body), noReply: detectNoReply(body), unverified: detectUnverified(body),
      headers: parseHeaders(text),
      requirements: flat.split(/(?<=[.?!])\s+/).filter(x => /^(we|i)\s+(need|require|are looking for|am looking for|want)\b/i.test(x)).slice(0, 3).map(x => x.replace(/^(we|i)\s+(need|require|are looking for|am looking for|want)\b/i, 'You need'))
    };
  }

  /* ---------- Email in rich text and plain text ----------
     The plain text is the single source. The rich version is derived from it
     line by line, so an edit in the box changes both. */
  function emailBlocks(text) {
    const blocks = [];
    String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).forEach(para => {
      const lines = para.split('\n');
      if (lines.every(l => l.startsWith(CONFIG.bullet))) { blocks.push({ type: 'list', items: lines.map(l => l.slice(CONFIG.bullet.length)) }); return; }
      if (lines.length > 1 && lines.slice(1).every(l => l.startsWith(CONFIG.bullet))) {
        blocks.push({ type: 'p', lines: [lines[0]] }, { type: 'list', items: lines.slice(1).map(l => l.slice(CONFIG.bullet.length)) });
        return;
      }
      let rest = lines;
      if (rest[0].startsWith('> ')) {
        const quote = [];
        while (rest.length && rest[0].startsWith('> ')) { quote.push(rest[0].slice(2)); rest = rest.slice(1); }
        blocks.push({ type: 'quote', text: quote.join(' ') });
      }
      rest.forEach(line => {
        const src = /^Source: (.*?)(?: \((https?:\/\/\S+)\))?$/.exec(line);
        if (src) { blocks.push({ type: 'source', label: src[1], url: src[2] || '' }); rest = rest.filter(l => l !== line); }
      });
      if (rest.length) blocks.push({ type: 'p', lines: rest });
    });
    return blocks;
  }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /* Inline styles only, because email clients drop style sheets. */
  function emailHtml(text) {
    const font = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2433;';
    const parts = emailBlocks(text).map(b => {
      if (b.type === 'list') return '<ul style="margin:0 0 12px 22px;padding:0;">' + b.items.map(i => '<li style="margin:0 0 4px 0;">' + esc(i) + '</li>').join('') + '</ul>';
      if (b.type === 'quote') return '<blockquote style="margin:0 0 6px 0;padding:6px 12px;border-left:3px solid #27306f;color:#3a4058;">' + esc(b.text) + '</blockquote>';
      if (b.type === 'source') return '<p style="margin:0 0 12px 0;font-size:12px;color:#5a6075;">Source: ' + (b.url ? '<a href="' + esc(b.url) + '" style="color:#27306f;">' + esc(b.label) + '</a>' : esc(b.label)) + '</p>';
      return '<p style="margin:0 0 12px 0;">' + b.lines.map(esc).join('<br>') + '</p>';
    });
    return '<div style="' + font + '">' + parts.join('') + '</div>';
  }
  function base64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/(.{76})/g, '$1\r\n');
  }
  const headerWord = t => (/^[\x20-\x7e]*$/.test(t) ? t : '=?UTF-8?B?' + base64(t).replace(/\r\n/g, '') + '?=');
  /* An unsent email file. Mail apps open it as a draft with formatting intact. */
  function emailFile(to, subject, text) {
    const boundary = 'email-kit-' + Date.now().toString(36);
    return ['To: ' + (parseContact(to).email || ''), 'Subject: ' + headerWord(norm(subject)), 'X-Unsent: 1', 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' + boundary + '"', '',
      '--' + boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64(text.replace(/\r?\n/g, '\r\n')), '',
      '--' + boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', base64('<!doctype html><html><body>' + emailHtml(text) + '</body></html>'), '',
      '--' + boundary + '--', ''].join('\r\n');
  }

  /* ---------- Meetings in calendar files ---------- */
  function zoneOffset(zone, utcMs) {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - utcMs;
  }
  function zonedUtc(date, time, zone) {
    const guess = Date.parse(date + 'T' + time + ':00Z');
    const first = guess - zoneOffset(zone, guess);
    return first - (zoneOffset(zone, first) - (guess - first));
  }
  const icsStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  function meetingFile(m, who, topic, cancelled, minutes) {
    const start = zonedUtc(m.date, m.time, m.zone);
    const end = start + (minutes || 30) * 60000;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Job Point Consultancy//Email Kit//EN', 'CALSCALE:GREGORIAN', 'METHOD:' + (cancelled ? 'CANCEL' : 'PUBLISH'), 'BEGIN:VEVENT',
      'UID:usha-' + m.id + '@usha.local', 'SEQUENCE:' + (m.sequence || 0), 'DTSTAMP:' + icsStamp(Date.now()), 'DTSTART:' + icsStamp(start), 'DTEND:' + icsStamp(end),
      'STATUS:' + (cancelled ? 'CANCELLED' : 'CONFIRMED'), 'SUMMARY:' + icsText('Meeting with ' + who), 'DESCRIPTION:' + icsText(topic ? 'Topic: ' + topic : 'Open Email Kit for the conversation history.')];
    if (!cancelled) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M', 'DESCRIPTION:' + icsText('Meeting with ' + who), 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const src = String(text || '').replace(/^\ufeff/, '').replace(/\r\n?/g, '\n');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim()));
  }
  /* Finds the columns by their headings, so column order does not matter. */
  function contactsFromCsv(text) {
    const table = parseCsv(text);
    if (table.length < 2) return { rows: [], error: 'The file needs a heading row and at least one contact.' };
    const head = table[0].map(h => h.trim().toLowerCase());
    const col = (...names) => head.findIndex(h => names.includes(h));
    const c = { name: col('name', 'full name', 'contact', 'contact name', 'recipient'), company: col('company', 'organisation', 'organization', 'employer'), designation: col('designation', 'title', 'job title', 'role'), email: col('email', 'e-mail', 'email address'), phone: col('phone', 'mobile', 'mobile number', 'whatsapp'), industry: col('industry', 'sector'), location: col('location', 'city') };
    if (c.company < 0) return { rows: [], error: 'The file needs a Company column.' };
    const at = (r, i) => (i >= 0 && r[i] ? r[i].trim() : '');
    return { rows: table.slice(1).map(r => ({ name: at(r, c.name), company: at(r, c.company), designation: at(r, c.designation), contact: at(r, c.email) || at(r, c.phone), industry: at(r, c.industry), location: at(r, c.location) })), error: '' };
  }

  /* Live sentence previews beside the evidence fields. */
  function preview(field, s) {
    const company = shortCompany(s.company) || 'the company';
    const leads = [shortCompany(s.company), norm(s.company)];
    const o = clause(s.observation, leads);
    const blank = '...';
    if (field === 'priorTopic') return 'I emailed you about ' + (deriveTopic(s) || blank);
    if (field === 'agreed') return agreedSentence(stepText(s.agreedStep), formatDate(s.agreedDate, localToday()));
    if (field === 'referrerNote') return (norm(s.referrer) || 'Your referrer') + ' suggested that I contact you' + (o ? ' about ' + o : '');
    switch (s.reason) {
      case 'vacancy': return 'I saw that ' + company + ' ' + (companyClause(o) || blank);
      case 'expansion': return 'I read that ' + company + ' ' + (companyClause(o) || blank);
      case 'post': return 'I read ' + (s.postAuthor === 'company' ? possessive(company) : 'your') + (/linkedin\.com/i.test(norm(s.sourceUrl)) ? ' LinkedIn post' : ' post') + ' about ' + (o || blank);
      case 'previous': return 'It was good to speak with you ' + (clause(s.conversationWhen) ? clause(s.conversationWhen) + ' ' : '') + 'about ' + (o || blank);
      default: return '';
    }
  }

  function researchLinks(s) {
    const c = norm(s.company);
    if (!c) return [];
    const q = t => 'https://www.google.com/search?q=' + encodeURIComponent(t);
    const role = parseRoles(s.roles)[0] || '';
    const place = splitList(s.hiringLocations)[0] || norm(s.location);
    return [
      { label: 'Company careers page', href: q('"' + c + '" careers') },
      { label: 'Relevant vacancies', href: q(['"' + c + '"', role, place, 'jobs'].filter(Boolean).join(' ')) },
      { label: 'Expansion announcements', href: q('"' + c + '" expansion new stores OR plant OR branches announcement') }
    ];
  }

  return { companyKey, compose, summaryFor, validate, buildContext, desiredOptions, suggestResponsibility, lint, preview, researchLinks, countChars, countWords, checkScope, localToday, parseName, shortCompany, resolveReason, formatDate, formatTime, followKind, deriveTopic, addWorkdays, nextFollowUp, sentType, dueLabel, isDue, trackerCsv, calendarFile, parseContact, mailLink, whatsappLink, subjectFromPaste, suggestResponse, detectTopics, detectNoReply, draftObservation, prospectKey, findDoNotContact, otherRestrictions, findTracked, findEndedNear, isSameProspect, normaliseEntry, companyMatch, namesOverlap, missingMeeting, topicFor, AGREED_CATS, clientNames, interpret, extractDates, extractTimes, extractZone, optOutScope, parseHeaders, replyBody, emailBlocks, emailHtml, emailFile, meetingFile, zonedUtc, contactsFromCsv, parseCsv };
})();
