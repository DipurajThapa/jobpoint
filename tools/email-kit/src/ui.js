/* ==========================================================================
   INTERFACE. Reads the form, calls Rules, and renders results as text.
   User input only ever reaches the page through textContent or form values.
   ========================================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const TEXT_FIELDS = ['contextAnswer','waEvidence','waNumber','senderName', 'senderRole', 'senderPhone', 'senderEmail', 'recipientTitle', 'recipientName', 'recipientContact', 'company', 'designation', 'industry', 'location', 'responsibility', 'desired', 'roles', 'hiringLocations', 'hiringType', 'priorChannel', 'priorType', 'priorDate', 'priorSubject', 'priorText', 'priorTopic', 'responseText', 'responseCategory', 'referredName', 'referredRole', 'referralPermission', 'agreedStep', 'agreedDate', 'reason', 'observation', 'sourceUrl', 'dateChecked', 'verification', 'postAuthor', 'referrer', 'conversationWhen', 'sourceQuote', 'optOutScope', 'meetingAction', 'meetingDate', 'meetingTime', 'meetingZone', 'meetingMode', 'movedTo'];
  const CHECK_FIELDS = ['scopeConfirmed', 'includeTerms', 'referrerConsent', 'accepted', 'noReplyRequested', 'whatsappConsent', 'dncDifferent', 'includeSource'];
  const SENDER_FIELDS = ['senderName', 'senderRole', 'senderPhone', 'senderEmail'];
  const STORE_SENDER = 'email-kit-sender';
  const STORE_DNC = 'email-kit-do-not-contact';
  const STORE_TRACKER = 'email-kit-tracker';
  const STORE_SCHEMA = 'email-kit-schema';

  /* Saved data keeps working across updates. Version 2 moved the tracker and
     the Do not contact list from browser storage into the local database.
     Those keys are removed only after the database has confirmed the move. */
  const SCHEMA = 4;

  const limits = Object.assign({}, CONFIG.limits);
  let draft = null;           // the draft on screen
  let replaced = null;        // an edited draft kept so a regenerate can be undone
  let attempted = false;      // show gaps only after the first Generate
  let resetUndo = null;
  let lastReason = 'role';
  let db = Engine.emptyState(); // the records, kept in step with the local database
  let doNotContact = [];      // restrictions, in the shape the rules read
  let tracker = [];           // conversations with a recorded message, in the same way
  let activeEntry = '';       // the conversation loaded into the form
  let referralFrom = '';      // the conversation whose referral this form is following
  let ready = false;          // true once the records have loaded
  let carry = {};             // what the record says the next message must be
  let sending = false;        // one Mark as sent at a time
  let generating = false;     // one Generate at a time
  let rev = 0;                // the database revision this tab has read
  let legacyProblem = '';     // earlier records that could not be moved
  let pendingToast = null;
  let importReviewed = false;
  const touched = new Set();  // fields the user has set, which auto-fill must not overwrite

  /* ---------- Reading and writing the form ---------- */
  function readForm() {
    const s = {};
    TEXT_FIELDS.forEach(f => { s[f] = $(f).value; });
    CHECK_FIELDS.forEach(f => { s[f] = $(f).checked; });
    const ch = document.querySelector('input[name=channel]:checked');
    s.channel = ch ? ch.value : 'email';
    const mode = document.querySelector('input[name=mode]:checked').value;
    s.scenario = $('scenario').value;
    s.stage = mode === 'followup' ? 'followup' : (s.accepted ? 'accepted' : 'first');
    /* The first LinkedIn message after an accepted request is not a reminder. */
    if (mode === 'followup' && s.accepted && s.priorChannel === 'invite' && s.channel === 'message' && s.responseCategory === 'noResponse') s.stage = 'accepted';
    s.askTopics = CONFIG.askTopics.filter(t => $('ask-' + t.id).checked).map(t => t.id);
    s.optOutChannels = CONFIG.restrictChannels.filter(c => $('cut-' + c.id).checked).map(c => c.id);
    s.responsibilityConfirmed = touched.has('responsibility');
    s.desiredConfirmed = touched.has('desired');
    if (mode !== 'followup') activeEntry = '';
    s.activeRecordId = activeEntry;
    Object.assign(s, carry);
    s.agencyVersion = CONFIG.profileVersion;
    s.stopReviewed = !!activeEntry && !!s.responseText && Engine.rows(db,'msgs').some(m => m.convId === activeEntry && m.direction === 'in' && m.stopReviewed && m.body === s.responseText);
    const conv = activeEntry ? db.convs[activeEntry] : null;
    s.remindersSent = conv ? conv.attempts : 0;
    s.notedFacts = conv ? Engine.confirmedFacts(db, conv.id) : [];
    s.referredBy = referralFrom;
    s.draftConvId = draft && draft.convId ? draft.convId : '';
    return s;
  }
  function writeForm(s) {
    const set = (name, value) => { const r = document.querySelector('input[name=' + name + '][value="' + value + '"]'); if (r) r.checked = true; };
    set('channel', s.channel);
    set('mode', s.stage === 'followup' ? 'followup' : 'first');
    $('scenario').value = s.scenario || (s.stage === 'followup' ? (s.responseText ? 'reply' : 'no-response') : 'new');
    syncScenario();
    TEXT_FIELDS.forEach(f => { if (s[f] !== undefined) $(f).value = s[f]; });
    CHECK_FIELDS.forEach(f => { $(f).checked = !!s[f]; });
    CONFIG.askTopics.forEach(t => { $('ask-' + t.id).checked = (s.askTopics || []).includes(t.id); });
    CONFIG.restrictChannels.forEach(c => { $('cut-' + c.id).checked = (s.optOutChannels || []).includes(c.id); });
    syncOptions();
    TEXT_FIELDS.forEach(f => { if (s[f] !== undefined && $(f).value !== s[f]) { $(f).value = s[f]; } });
    syncOptions();
    lastReason = $('reason').value;
  }
  /* Contact details and the different-person check do not change the message. */
  function snapshot(s) {
    const c = Object.assign({}, s);
    ['responsibilityConfirmed', 'dncDifferent', 'activeRecordId', 'remindersSent', 'notedFacts', 'referredBy', 'draftConvId', 'followTask', 'promise', 'owedAnswer', 'desiredConfirmed', 'formerCompany', 'resend', 'addressAnswer'].forEach(f => delete c[f]);
    return JSON.stringify(c);
  }

  function setOptions(select, options, keep) {
    const current = keep ? select.value : '';
    select.textContent = '';
    options.forEach(o => {
      const el = document.createElement('option');
      el.value = o.id; el.textContent = o.label;
      select.appendChild(el);
    });
    if (current && options.some(o => o.id === current)) select.value = current;
  }

  function fillDatalist(id, items) {
    const list = $(id);
    items.forEach(v => { const o = document.createElement('option'); o.value = v; list.appendChild(o); });
  }

  function buildStaticOptions() {
    setOptions($('responsibility'), CONFIG.responsibilities);
    setOptions($('priorChannel'), CONFIG.channels);
    setOptions($('priorType'), CONFIG.priorTypes);
    setOptions($('responseCategory'), CONFIG.responses);
    fillDatalist('designationList', CONFIG.lists.designations.map(d => d[0]));
    fillDatalist('industryList', CONFIG.lists.industries);
    fillDatalist('locationList', CONFIG.lists.locations);
    const group = $('channelGroup');
    CONFIG.channels.forEach((c, i) => {
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'channel'; input.id = 'ch-' + c.id; input.value = c.id;
      if (i === 0) input.checked = true;
      const label = document.createElement('label');
      label.htmlFor = input.id; label.textContent = c.short || c.label;
      group.append(input, label);
    });
    const asks = $('askGroup');
    CONFIG.askTopics.forEach(t => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = 'ask-' + t.id;
      const span = document.createElement('span');
      span.textContent = t.label;
      label.append(input, span);
      asks.appendChild(label);
    });
    setOptions($('optOutScope'), CONFIG.optOutScopes);
    setOptions($('meetingZone'), [{ id: '', label: 'Not clear yet' }].concat(CONFIG.zones));
    setOptions($('setZone'), CONFIG.zones);
    const cuts = $('wrapOptOutChannels');
    CONFIG.restrictChannels.forEach(c => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.id = 'cut-' + c.id;
      const span = document.createElement('span');
      span.textContent = c.label;
      label.append(input, span);
      cuts.appendChild(label);
    });
  }

  /* ---------- Conditional fields ---------- */
  function syncScenario() {
    const scenario = $('scenario').value;
    $('mode-' + (scenario === 'new' ? 'first' : 'followup')).checked = true;
    $('importBox').hidden = !['import','reconnect'].includes(scenario) || !!activeEntry;
    $('contextAnswerBox').hidden = !(scenario === 'reply' && activeEntry && db.convs[activeEntry]?.importedContext?.lastSpeaker === 'client');
    $('scenarioHint').textContent = ({
      new:'Introduce yourself and the reason for writing.',
      reply:'Respond to the client’s latest message. Paste it below if it is not on record.',
      'no-response':'Check whether your earlier message was received after the follow-up interval.',
      'after-reply':'Continue the existing exchange after your latest answer; allow time for review.',
      import:'Bring in an external exchange and verify its current state before drafting.',
      reconnect:'Confirm why the discussion is ready to resume and respect any earlier pause.'
    })[scenario];
    if (scenario === 'reply' && !activeEntry && $('responseCategory').value === 'noResponse') $('responseCategory').value = 'unclear';
    if (['no-response','after-reply'].includes(scenario) && !activeEntry) $('responseCategory').value = 'noResponse';
    if (scenario === 'after-reply' && !activeEntry) $('priorType').value = 'reply';
  }
  function intake() {
    return { history:$('importHistory').value.trim(), objective:$('importObjective').value.trim(), subject:$('importSubject').value.trim(),
      lastSpeaker:$('importLastSpeaker').value, lastDate:$('importLastDate').value, lastText:$('importLastText').value.trim(),
      summary:$('importSummary').value.trim(), outstanding:$('importOutstanding').value.trim(), next:$('importNext').value.trim() };
  }
  function reviewIntake() {
    const read = Conversation.review($('importHistory').value, Rules.localToday());
    if (!$('importSubject').value) $('importSubject').value = read.subject;
    if (!$('importLastDate').value) $('importLastDate').value = read.lastDate;
    if (!$('importSummary').value) $('importSummary').value = read.summary;
    const data = intake();
    const advice = Conversation.advise(Object.assign({ scenario:$('scenario').value, optedOut:read.optedOut }, data), Rules.localToday());
    $('importAssessment').textContent = 'Suggested action: ' + advice.action + '. ' + advice.reason + ' ' + read.caveat;
    importReviewed = true;
    $('confirmImport').disabled = !data.objective || !data.summary || !data.lastSpeaker || !data.lastDate ||
      (data.lastSpeaker === 'client' && !data.lastText) || advice.action === 'clarify' || advice.action === 'pause';
    return advice;
  }
  async function confirmIntake() {
    const advice = reviewIntake();
    if ($('confirmImport').disabled) return showToast(advice.reason || 'Complete the required context first.');
    const data = intake();
    const result = await attempt('importConversation', { s:readForm(), intake:data });
    if (!result) return;
    const conv = db.convs[result.result.convId];
    continueEntry({ id:conv.id });
    $('scenario').value = data.lastSpeaker === 'client' ? 'reply' : 'after-reply';
    syncScenario();
    if (data.lastSpeaker === 'client') $('responseText').value = data.lastText;
    $('priorSubject').value = data.subject;
    $('priorTopic').value = data.objective;
    $('priorDate').value = data.lastDate;
    renderAll();
    showToast('Verified context saved. Review the next action before generating a draft.');
  }
  /* The tracker's record of what was sent cannot be changed by hand. */
  function trackedEntry(s) {
    /* A loaded conversation holds until the consultant says who this is. */
    const active = tracker.find(e => e.id === activeEntry);
    if (active && s.stage === 'followup') return active;
    return Rules.findTracked(tracker, s);
  }
  function lockPriorType() {
    const s = readForm();
    const entry = s.stage === 'followup' ? trackedEntry(s) : null;
    $('priorType').disabled = !!entry;
    if (entry) $('priorType').value = entry.lastType;
  }

  /* The form's own rules, plus what the client record knows. */
  function validateNow(s) {
    const today = Rules.localToday();
    const v = Rules.validate(s, today, doNotContact, tracker);
    const g = Engine.guards(db, s, today);
    v.blockers = v.blockers.concat(g.blockers);
    v.notes = v.notes.concat(g.notes);
    return v;
  }

  function syncOptions() {
    const followup = $('mode-followup').checked;
    lockPriorType();
    const cat = followup ? $('responseCategory').value : '';
    const priorChannel = $('priorChannel').value;

    /* A connection note suits first contact and a reminder after an email or message. */
    const finalReminder = followup && cat === 'noResponse' && ['reminder', 'agreed', 'reply'].includes($('priorType').value);
    const conv = activeEntry ? db.convs[activeEntry] : null;
    const inviteOff = (!followup && $('accepted').checked && $('ch-message').checked) || (followup && (cat !== 'noResponse' || priorChannel === 'invite' || finalReminder));
    const invite = $('ch-invite');
    let moved = false;
    invite.disabled = inviteOff;
    if (inviteOff && invite.checked) {
      (priorChannel === 'email' ? $('ch-email') : $('ch-message')).checked = true;
      moved = true;
    }
    const channel = document.querySelector('input[name=channel]:checked').value;
    const note = $('channelNote');
    note.hidden = !(followup && inviteOff);
    note.textContent = 'A connection note cannot carry this follow-up, so email or a LinkedIn message is available.';

    const kind = Rules.followKind({ stage: followup ? 'followup' : 'first', responseCategory: cat, priorType: $('priorType').value, remindersSent: conv ? conv.attempts : 0 });
    const reminder = followup && cat === 'noResponse';
    const replyAsk = ['interested', 'moreInfo', 'commercial'].includes(cat);

    $('secEarlier').hidden = !followup;
    $('secResponse').hidden = !followup;
    $('wrapIndustry').hidden = followup;
    $('wrapLocation').hidden = followup;
    $('wrapPriorSubject').hidden = priorChannel !== 'email' && channel !== 'email';
    $('wrapPriorTopic').hidden = !reminder;

    $('wrapWhatsapp').hidden = channel !== 'whatsapp';
    if ($('wrapWhatsapp').hidden) $('whatsappConsent').checked = false;
    $('wrapAccepted').hidden = channel !== 'message' || (followup && (priorChannel !== 'invite' || cat !== 'noResponse'));
    if ($('wrapAccepted').hidden) $('accepted').checked = false;

    const resp = $('responsibility').value;
    const hasAgreed = !!($('agreedStep').value.trim() || $('agreedDate').value);
    setOptions($('desired'), replyAsk ? CONFIG.desired.afterReply : (CONFIG.desired[resp] || CONFIG.desired.unknown), true);
    const showDesired = channel !== 'invite' && (!followup || (replyAsk && !hasAgreed && cat !== 'moreInfo') || (reminder && kind === 'reminder'));
    /* The recommended request follows the reason, until you choose your own. */
    if (!touched.has('desired') && !followup && resp === 'decision') $('desired').value = ['post', 'vacancy'].includes($('reason').value) ? 'call' : 'fit';
    $('wrapDesired').hidden = !showDesired;
    $('wrapDesired').classList.toggle('span2', $('wrapReason').hidden);

    const showRoles = !followup || (reminder && kind === 'reminder' && channel !== 'invite');
    $('wrapRoleRow').hidden = !showRoles;

    const showReason = !followup || (reminder && kind === 'reminder' && channel !== 'invite');
    $('wrapReason').hidden = !showReason;
    const prev = $('reason').value;
    const reasons = followup ? CONFIG.reasons.filter(r => !['referral', 'previous'].includes(r.id)).map(r => (r.id === 'role' ? { id: 'role', label: 'No new reason' } : r)) : CONFIG.reasons;
    setOptions($('reason'), reasons, true);
    if (prev && $('reason').value !== prev) $('reason').value = 'role';
    $('reasonLabel').textContent = followup ? 'New reason to write again' : 'Reason for contact';
    const reason = showReason ? $('reason').value : 'role';
    $('wrapReason').classList.toggle('span2', !showDesired);
    $('wrapDesired').classList.toggle('span2', !showReason);

    $('wrapTerms').hidden = channel === 'invite' || (followup && !['interested', 'moreInfo', 'meeting'].includes(cat));
    if ($('wrapTerms').hidden) $('includeTerms').checked = false;
    $('wrapResearch').hidden = followup;

    $('wrapAskTopics').hidden = !['moreInfo', 'commercial', 'interested', 'meeting'].includes(cat);
    $('wrapReferred').hidden = cat !== 'referred';
    $('wrapNoReply').hidden = cat !== 'optOut';
    $('wrapAgreed').hidden = !Rules.AGREED_CATS.includes(cat);
    $('wrapOptOutChannels').hidden = $('optOutScope').value !== 'channel';
    $('wrapMeeting').hidden = cat !== 'meeting';
    $('wrapMoved').hidden = cat !== 'changedEmployer';
    $('wrapQuote').hidden = channel !== 'email';

    const isObs = ['vacancy', 'expansion', 'post'].includes(reason);
    $('secEvidence').hidden = reason === 'role';
    $('wrapReferrer').hidden = reason !== 'referral';
    $('wrapPostAuthor').hidden = reason !== 'post';
    $('wrapWhen').hidden = reason !== 'previous';
    $('wrapObservation').hidden = reason === 'role';
    $('wrapVerification').hidden = !isObs;
    const label = { vacancy: 'What did you find?', expansion: 'What did you find?', post: 'What was the post about?', previous: 'What did you discuss?', referral: 'What is the referral about? (optional)' }[reason] || 'Observation';
    $('observationLabel').textContent = label;
    return moved;
  }

  /* Fills dependent fields. A field the user has set is never overwritten. */
  function autoFill(id) {
    const s = readForm();
    if (id === 'designation' && !touched.has('responsibility')) {
      $('responsibility').value = Rules.suggestResponsibility(s.designation) || 'unknown';
    }
    if (id === 'location' && !touched.has('hiringLocations')) $('hiringLocations').value = s.location;
    if (id === 'referrer') $('referrerConsent').checked = false;
    if (['recipientName', 'company', 'recipientContact'].includes(id)) {
      $('dncDifferent').checked = false;
      /* Someone we knew at their last company is not a cold contact. */
      const found = s.stage === 'first' && !touched.has('reason') ? Engine.resolve(db, s) : null;
      /* Only an address on record proves who this is. A matching name does not. */
      const known = found && found.contact && !!found.keys.contact && found.contact.keys.includes(found.keys.contact);
      if (known) useFormerLink(found.contact);
      delete carry.addressAnswer;
    }
    if (id === 'verification' && s.verification === 'confirmed' && !s.dateChecked) $('dateChecked').value = Rules.localToday();
    if (id === 'priorText' && !s.priorSubject) {
      const found = Rules.subjectFromPaste(s.priorText);
      if (found) $('priorSubject').value = found;
    }
    if (['priorText', 'priorSubject', 'company'].includes(id) && !touched.has('priorTopic')) {
      const now = readForm();
      $('priorTopic').value = Rules.deriveTopic(Object.assign({}, now, { priorTopic: '' }));
    }
    if (id === 'priorChannel' && !touched.has('channel')) {
      const v = $('priorChannel').value === 'invite' ? 'message' : $('priorChannel').value;
      $('ch-' + v).checked = true;
    }
    if (id === 'responseText') {
      const read = Rules.interpret(s.responseText, Rules.localToday());
      if (!CONFIG.askTopics.some(t => touched.has('ask-' + t.id))) {
        CONFIG.askTopics.forEach(t => { $('ask-' + t.id).checked = read.topics.includes(t.id); });
      }
      if (!touched.has('noReplyRequested')) $('noReplyRequested').checked = read.noReply;
      if (read.optOut && !touched.has('optOutScope')) {
        $('optOutScope').value = read.optOut.scope;
        CONFIG.restrictChannels.forEach(c => { $('cut-' + c.id).checked = read.optOut.channels.includes(c.id); });
      }
      /* Only unambiguous details fill a field. Others wait for a click. */
      const date = read.dates.length === 1 && read.dates[0].sure ? read.dates[0] : null;
      const time = read.times.length === 1 && read.times[0].sure ? read.times[0] : null;
      if (date && !touched.has('meetingDate')) $('meetingDate').value = date.iso;
      if (time && !touched.has('meetingTime')) $('meetingTime').value = time.time;
      if (read.zone && !touched.has('meetingZone')) $('meetingZone').value = read.zone;
      if (date && !touched.has('agreedDate') && read.matches.includes('postponed')) $('agreedDate').value = date.iso;
      if (read.people.name && !touched.has('referredName')) $('referredName').value = read.people.name;
      const subject = read.headers.subject.replace(/^(re|fw|fwd):\s*/i, '');
      if (subject && !s.priorSubject) $('priorSubject').value = subject;
    }
    /* A question about fees is answered with the terms, unless you say otherwise. */
    if (['responseText', 'responseCategory'].includes(id) && !touched.has('includeTerms')) {
      const conv = activeEntry ? db.convs[activeEntry] : null;
      $('includeTerms').checked = !(conv && conv.termsSentAt) && ['interested', 'moreInfo', 'meeting'].includes($('responseCategory').value) && Rules.interpret($('responseText').value, Rules.localToday()).matches.includes('commercial');
    }
    const after = readForm();
    if (['roles', 'hiringLocations', 'location', 'reason'].includes(id) && after.reason === 'vacancy' && !touched.has('observation')) {
      $('observation').value = Rules.draftObservation(after);
    }
    syncOptions();
  }

  /* Opens a first message from a real earlier exchange at another company. */
  function useFormerLink(contact) {
    const link = Engine.formerLink(db, contact);
    if (!link) return;
    $('reason').value = 'previous';
    $('conversationWhen').value = 'when you were at ' + link.org.name;
    if (!$('observation').value) $('observation').value = link.topic || 'recruitment support';
    carry = Object.assign({}, carry, { formerCompany: link.org.name });
  }

  /* A known name with a new address gets one question, and the record waits for it. */
  function renderAddressChoice(s) {
    const person = s.stage === 'first' ? Engine.addressQuestion(db, s) : null;
    $('addressChoice').hidden = !person;
    if (!person) return;
    $('addressChoiceText').textContent = person.name + ' is on record with a different address. Is this the same person?';
    $('addressSame').onclick = () => {
      carry = Object.assign({}, carry, { addressAnswer: 'same' });
      if (!touched.has('reason')) useFormerLink(person);
      syncOptions();
      renderAll();
    };
    $('addressOther').onclick = () => {
      carry = Object.assign({}, carry, { addressAnswer: 'different' });
      renderAll();
    };
  }

  function syncPreviews() {
    const s = readForm();
    const line = (id, f) => { const t = Rules.preview(f, s); $(id).textContent = t ? 'Reads as: ' + t : ''; };
    line('readsPrior', 'priorTopic');
    line('readsAgreed', 'agreed');
    if (s.reason === 'referral') line('readsObservation', 'referrerNote');
    else line('readsObservation', 'observation');
  }

  function syncHints() {
    const s = readForm();
    const r = Rules.suggestResponsibility(s.designation);
    const hint = $('responsibilityHint');
    hint.hidden = !(r && r === s.responsibility && !touched.has('responsibility'));
    hint.textContent = 'Suggested from the title. Please change it if it is wrong.';

    const box = $('categorySuggest');
    const read = s.stage === 'followup' && s.responseText.trim() ? Rules.interpret(s.responseText, Rules.localToday()) : null;
    const suggested = read ? read.category : '';
    if (suggested && suggested !== s.responseCategory) {
      const label = CONFIG.responses.find(x => x.id === suggested).label;
      const others = read.alternatives.map(id => CONFIG.responses.find(x => x.id === id).label).join(' or ');
      $('categoryText').textContent = 'This reads like: ' + label + '.' + (others ? ' It could also be: ' + others + '.' : '') + ' Please confirm it.';
      $('categoryUse').dataset.value = suggested;
      box.hidden = false;
    } else {
      box.hidden = true;
    }
    renderReading(s, read);

    const name = s.senderName.trim();
    $('senderSummary').textContent = name ? 'Sending as ' + name + (s.senderRole.trim() ? ', ' + s.senderRole.trim() : '') : 'Your details';
  }

  /* Shows what was found in a reply, and offers uncertain dates as a choice. */
  function renderReading(s, read) {
    const list = $('readList');
    list.textContent = '';
    const line = (text, action) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = text;
      li.appendChild(span);
      if (action) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn quiet small'; b.textContent = action.label;
        b.addEventListener('click', action.run);
        li.appendChild(b);
      }
      list.appendChild(li);
    };
    if (read) {
      const useDate = iso => () => {
        const field = s.responseCategory === 'meeting' ? 'meetingDate' : 'agreedDate';
        $(field).value = iso; touched.add(field);
        syncOptions(); renderAll();
      };
      read.dates.forEach(d => {
        if (d.note || read.dates.length > 1 || !['postponed', 'meeting'].includes(s.responseCategory)) line('Date: ' + Rules.formatDate(d.iso, Rules.localToday()) + ', from "' + d.text + '".' + (d.note ? ' ' + d.note : ''), Rules.AGREED_CATS.concat('meeting').includes(s.responseCategory) ? { label: 'Use this date', run: useDate(d.iso) } : null);
      });
      read.clarify.filter(c => !read.dates.some(d => c.includes(d.text))).forEach(c => line(c));
      read.questions.forEach(q => line('Question to answer: ' + q));
      if (activeEntry) read.requirements.forEach(text => {
        const saved = Engine.rows(db, 'facts').some(f => f.convId === activeEntry && f.text === norm(text));
        if (!saved) line('Requirement: ' + text, { label: 'Save as confirmed', run: async () => { if (await attempt('addFact', { convId: activeEntry, kind: 'requirement', text, status: 'confirmed' })) renderAll(); } });
      });
    }
    $('readBox').hidden = list.children.length === 0;

    /* A pasted email can identify its own conversation. */
    const known = read && !activeEntry ? matchReply(read) : null;
    $('replyMatch').hidden = !known;
    if (known) {
      const c = db.contacts[known.contactId], o = db.orgs[known.orgId];
      $('replyMatchText').textContent = 'This reply looks like it belongs to ' + [c && c.name, o && o.name].filter(Boolean).join(' at ') + '.';
      $('replyMatchUse').onclick = () => {
        const text = $('responseText').value, category = $('responseCategory').value;
        continueEntry({ id: known.id });
        $('responseText').value = text;
        $('responseCategory').value = category;
        autoFill('responseText');
        renderAll();
      };
    }
  }
  function matchReply(read) {
    const convs = Engine.rows(db, 'convs').filter(c => c.lastType);
    const byMail = read.headers.email ? Engine.rows(db, 'contacts').find(c => (c.keys || []).includes(read.headers.email.toLowerCase())) : null;
    if (byMail) return convs.filter(c => c.contactId === byMail.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
    const subject = read.headers.subject.replace(/^(re|fw|fwd):\s*/i, '').toLowerCase();
    return subject ? convs.find(c => (c.subject || '').toLowerCase() === subject) || null : null;
  }

  const norm = t => String(t || '').replace(/\s+/g, ' ').trim();

  function syncResearch() {
    const list = $('researchList');
    list.textContent = '';
    Rules.researchLinks(readForm()).forEach(link => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = link.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = link.label;
      li.appendChild(a); list.appendChild(li);
    });
  }

  function syncScope(v) {
    const hits = v.scopeHits.filter(h => h.canConfirm);
    $('wrapScope').hidden = hits.length === 0;
    if (hits.length === 0) $('scopeConfirmed').checked = false;
  }

  /* ---------- Do not contact ---------- */
  async function clearMark(entry) {
    const dialog = $('permissionDialog');
    if (dialog.open) return;
    $('permissionEvidence').value = '';
    const scope = entry.scope === 'channel' ? entry.channels.join(', ') : entry.scope === 'organisation' ? 'everyone at this organisation' : 'all channels for this contact';
    $('permissionScope').textContent = [entry.name,entry.company].filter(Boolean).join(', ') + ' · Restriction covers ' + scope + '.';
    dialog.returnValue = '';
    const closed = new Promise(resolve => dialog.addEventListener('close', resolve, {once:true}));
    dialog.showModal(); await closed;
    if (dialog.returnValue !== 'confirm' || !$('permissionEvidence').value.trim()) return;
    const out = await attempt('liftRestriction', {id:entry.id, why:$('permissionEvidence').value.trim()});
    if (!out) return;
    renderAll();
    showToast('The Do not contact mark is cleared.', { label: 'Undo', run: () => undo(out.changes, 'The mark is back.') });
    say('The Do not contact mark is cleared.');
  }
  function renderDnc(s) {
    const list = $('dncList');
    list.textContent = '';
    const marks = Engine.rows(db, 'suppressions').filter(e => e.status === 'active');
    marks.forEach(e => {
      const li = document.createElement('li');
      const p = document.createElement('span');
      const scope = e.scope === 'channel' ? ' Channels: ' + e.channels.join(', ') + '.' : e.scope === 'organisation' ? ' Everyone at this company.' : e.scope === 'review' ? ' Scope under review, so all outreach is paused.' : '';
      p.textContent = (e.name ? e.name + ', ' : '') + e.company + ', marked on ' + Rules.formatDate(e.date, Rules.localToday()) + '.' + scope;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn quiet small'; b.textContent = 'Record new permission';
      b.addEventListener('click', () => clearMark(e));
      const wrap = document.createElement('div');
      wrap.className = 'dnc-actions';
      wrap.appendChild(b);
      li.append(p, wrap);
      list.appendChild(li);
    });
    $('dncSection').hidden = marks.length === 0;
    $('dncEmpty').hidden = marks.length > 0;
    $('dncSummary').textContent = 'Do not contact list (' + marks.length + ')';

    const match = Rules.findDoNotContact(doNotContact, s);
    const sameRequest = s.stage === 'followup' && s.responseCategory === 'optOut';
    const banner = $('dncBanner');
    if (match && match.exact) {
      const e = match.entry;
      $('dncText').textContent = e.scope === 'review' ? (e.name || 'This contact') + ' may have opted out, and the scope needs your review. Outreach is paused until you decide.'
        : e.scope === 'channel' ? (e.name || 'This contact') + ' asked not to be contacted on this channel.'
          : e.scope === 'organisation' ? e.company + ' asked for no further contact, so this covers everyone there.'
            : (e.name || 'This company') + ' asked for no further contact. Email Kit will not draft outreach until they explicitly opt back in.';
      $('dncClear').onclick = () => clearMark(e);
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
    const near = !!match && !match.exact && !sameRequest;
    const endedNear = !near && !sameRequest ? Rules.findEndedNear(tracker, s, activeEntry) : null;
    const ended = endedNear && !(endedNear === Rules.findTracked(tracker, s) && !activeEntry) ? endedNear : null;
    $('wrapDncDifferent').hidden = !near && !ended;
    if (near) $('dncDifferentText').textContent = 'This is a different person from ' + (match.entry.name || 'the person marked') + ' at ' + match.entry.company + ', who asked for no further contact.';
    else if (ended) $('dncDifferentText').textContent = 'This is a different person from ' + (ended.recipientName || 'the earlier contact') + ' at ' + ended.company + ', whose conversation has ended.';
    else $('dncDifferent').checked = false;
    $('generate').disabled = !!(match && match.exact && !sameRequest) || Store.mode === 'failed';
    renderNameChoice(s);
    renderAddressChoice(s);
  }

  /* A changed name or company on a loaded conversation needs one clear answer. */
  function renderNameChoice(s) {
    const conv = activeEntry ? db.convs[activeEntry] : null;
    const show = !!conv && Engine.differs(db, conv, s);
    $('nameChoice').hidden = !show;
    if (!show) return;
    const c = db.contacts[conv.contactId], o = db.orgs[conv.orgId];
    const newCompany = !o.keys.includes(Rules.prospectKey(s).company);
    $('nameChoiceText').textContent = 'You opened the conversation with ' + [c.name, o.name].filter(Boolean).join(' at ') + '. ' + (newCompany ? 'What has changed?' : 'Is this a correction, or a different person?');
    $('nameCorrect').textContent = newCompany ? 'Rename the company for everyone there' : 'Correct the record';
    $('nameMoved').hidden = !newCompany;
    $('nameMoved').onclick = async () => {
      const now = readForm();
      if (!await attempt('changeEmployer', { contactId: c.id, company: now.company, designation: now.designation })) return;
      blankForm(true);
      renderAll();
      showToast((c.name || 'This contact') + ' is recorded as moved. Verify the new company in the client record before writing.');
    };
    $('nameCorrect').onclick = async () => {
      const now = readForm();
      if (newCompany && !await attempt('renameOrg', { id: o.id, name: now.company })) return;
      if (now.recipientName.trim() && Rules.prospectKey(now).name !== c.nameKey && !await attempt('renameContact', { id: c.id, name: now.recipientName })) return;
      renderAll();
      say('The record is corrected.');
    };
    $('nameDifferent').onclick = () => {
      activeEntry = ''; carry = {};
      $('mode-first').checked = true;
      $('recipientContact').value = '';
      ['priorSubject', 'priorText', 'priorTopic', 'priorDate', 'responseText'].forEach(f => { $(f).value = ''; });
      syncOptions();
      renderAll();
      say('This is now a new first message, with no earlier history.');
    };
  }

  /* ---------- Rendering the draft ---------- */
  function say(msg) { $('live').textContent = ''; setTimeout(() => { $('live').textContent = msg; }, 30); }

  function growBody() {
    const b = $('body');
    b.style.height = 'auto';
    b.style.height = (b.scrollHeight + 2) + 'px';
  }

  function isStale() { return !!draft && draft.snapshot !== snapshot(readForm()); }

  function currentLint() {
    if (!draft || draft.noMessage) return { block: [], warn: [] };
    return Rules.lint($('body').value, draft.channel, draft.terms, $('subject').value, draft.followType === 'first');
  }

  function copyBlocks() {
    const out = [];
    if (!draft || draft.noMessage) return out;
    const body = $('body').value;
    if (!body.trim()) out.push('The message is empty.');
    const now = readForm();
    if (now.stage === 'followup' && now.responseCategory === 'optOut' && now.noReplyRequested) out.push('They asked for no reply, so there is nothing to send.');
    else if (now.stage === 'followup' && now.responseCategory === 'optOut' && draft.category !== 'optOut') out.push('Choose Generate message to record the opt-out.');
    validateNow(now).blockers.forEach(b => out.push(b.msg));
    /* Text written for one person must not go to another. */
    const then = JSON.parse(draft.snapshot);
    if (['stage','channel','responseCategory','responseText','contextAnswer','recipientContact','waNumber','waEvidence','agencyVersion','priorType','optOutScope','noReplyRequested'].some(f => now[f] !== then[f]))
      out.push('The recipient, reply, agency or channel details changed. Generate a fresh draft.');
    if (['recipientName', 'company'].some(f => norm(now[f]) !== norm(then[f]))) out.push('The recipient has changed since this draft was made. Choose Generate message.');
    /* Dates and agreed steps are promises, so a draft cannot carry old ones. */
    else if (['agreedDate', 'agreedStep', 'meetingDate', 'meetingTime', 'meetingZone', 'meetingAction'].some(f => norm(now[f]) !== norm(then[f]))) out.push('The agreed details have changed since this draft was made. Choose Generate message.');
    if (draft.channel === 'invite') {
      const over = Rules.countChars(body) - limits.inviteHard;
      if (over > 0) out.push(draft.overflow && !draft.edited ? draft.overflow : 'Remove ' + over + ' more character' + (over === 1 ? '' : 's') + ' to meet the ' + limits.inviteHard + '-character hard limit.');
    }
    return out.concat(currentLint().block);
  }

  /* An edited draft may be recorded only for the prospect and reply it was written for. */
  function sameSubject() {
    const now = readForm(), then = JSON.parse(draft.snapshot);
    return ['recipientName', 'company', 'stage', 'responseCategory', 'channel'].every(f => now[f] === then[f]);
  }

  function pct(value, scale) { return Math.min(100, (value / scale) * 100) + '%'; }

  function renderCounts() {
    if (!draft || draft.noMessage) return;
    const body = $('body').value;
    const chars = Rules.countChars(body), words = Rules.countWords(body);
    const c = $('bodyCount'), band = $('meterBand'), mark = $('meterMark'), stop = $('meterStop');
    let over = false, text = '';
    band.hidden = true; stop.hidden = true;

    const place = (value, lo, hi) => {
      const scale = Math.max(hi * 1.25, value);
      band.hidden = false;
      band.style.left = pct(lo, scale);
      band.style.width = 'calc(' + pct(hi, scale) + ' - ' + pct(lo, scale) + ')';
      mark.style.left = pct(value, scale);
    };
    const status = (value, lo, hi) => {
      if (value > hi) return ' This is above the target.';
      if (value < lo) return draft.targetActive ? ' This is below the target.' : ' Follow-ups can be shorter than this target.';
      return ' This is within the target.';
    };

    if (draft.channel === 'invite') {
      const scale = Math.max(limits.inviteHard * 1.25, chars);
      stop.hidden = false; stop.style.left = pct(limits.inviteHard, scale);
      mark.style.left = pct(chars, scale);
      over = chars > limits.inviteHard;
      text = chars + ' of ' + limits.inviteHard + ' characters. This is a hard limit.' + (over ? ' You are ' + (chars - limits.inviteHard) + ' over.' : ' You have ' + (limits.inviteHard - chars) + ' left.');
    } else if (draft.channel !== 'email') {
      place(chars, limits.messageMin, limits.messageMax);
      text = chars + ' characters. The target is ' + limits.messageMin + ' to ' + limits.messageMax + '.' + status(chars, limits.messageMin, limits.messageMax);
    } else {
      place(words, limits.emailMin, limits.emailMax);
      text = words + ' words in the body. The target is ' + limits.emailMin + ' to ' + limits.emailMax + '.' + status(words, limits.emailMin, limits.emailMax);
    }
    c.textContent = text;
    c.classList.toggle('over', over);
    $('countRule').textContent = draft.channel === 'email'
      ? 'The word count includes the greeting and sign-off, and leaves out the subject.'
      : 'The character count includes spaces, punctuation and line breaks.';

    if (draft.channel === 'email') {
      const n = Rules.countChars($('subject').value);
      $('subjectCount').textContent = draft.reusedSubject ? 'This is the subject of your earlier email.' : n + ' characters. The suggested maximum is ' + CONFIG.subjectTarget + '.';
    }
  }

  function renderGate() {
    const has = !!draft && !draft.noMessage;
    const blocks = copyBlocks();
    $('copyBody').disabled = !has || blocks.length > 0;
    const subjectOk = has && draft.channel === 'email' && !!$('subject').value.trim() && !CONFIG.lint.placeholder.test($('subject').value);
    $('copySubject').disabled = !subjectOk || blocks.length > 0;
    $('copySubject').hidden = has && draft.channel !== 'email';
    $('copyReason').textContent = blocks.length ? 'Copying is blocked. ' + blocks[0] : '';

    $('copyRow').hidden = !has;
    $('nextRow').hidden = !has;
    $('markSent').hidden = !has;
    $('saveEml').hidden = !has || draft.channel !== 'email';
    $('saveEml').disabled = !!blocks.length;
    $('queueLater').hidden = !has;
    $('queueLater').disabled = !!blocks.length;
    renderRich();
    /* Your own edit is your final text, so it can be recorded after a form change. */
    $('markSent').disabled = !has || blocks.length > 0 || (isStale() && (!draft.edited || !sameSubject()));
    const contact = readForm().recipientContact;
    const open = $('openApp');
    const canOpen = has && !blocks.length && (draft.channel === 'email' || draft.channel === 'whatsapp');
    open.hidden = !canOpen;
    if (!canOpen) open.removeAttribute('href');
    if (canOpen) {
      open.href = draft.channel === 'email' ? Rules.mailLink(contact, $('subject').value, $('body').value) : Rules.whatsappLink(readForm().waNumber, $('body').value);
      open.textContent = draft.channel === 'email' ? 'Open in email app' : 'Open in WhatsApp';
      /* An email link must not leave an empty tab behind. */
      if (draft.channel === 'email') open.removeAttribute('target');
      else open.target = '_blank';
    }

    const st = $('draftState');
    let label = 'No draft yet', cls = '';
    if (draft) {
      if (isStale()) { label = 'Needs regeneration'; cls = 'flag'; }
      else if (draft.noMessage) { label = 'No message needed'; cls = 'ready'; }
      else if (blocks.length) { label = 'Copying blocked'; cls = 'flag'; }
      else if (draft.edited) { label = 'Edited by you'; cls = 'ready'; }
      else { label = 'Draft ready'; cls = 'ready'; }
    }
    st.textContent = label;
    st.className = 'draft-state ' + cls;
  }

  /* The formatted view is built from the plain text, so it always matches. */
  function renderRich() {
    const box = $('richBox'), view = $('richView');
    const show = !!draft && !draft.noMessage && draft.channel === 'email';
    box.hidden = !show;
    if (!show) return;
    view.textContent = '';
    Rules.emailBlocks($('body').value).forEach(b => {
      let node;
      if (b.type === 'list') { node = document.createElement('ul'); b.items.forEach(i => { const li = document.createElement('li'); li.textContent = i; node.appendChild(li); }); }
      else if (b.type === 'quote') { node = document.createElement('blockquote'); node.textContent = b.text; }
      else if (b.type === 'source') {
        node = document.createElement('p'); node.className = 'src'; node.textContent = 'Source: ';
        if (b.url) { const a = document.createElement('a'); a.href = b.url; a.textContent = b.label; a.target = '_blank'; a.rel = 'noopener noreferrer'; node.appendChild(a); } else node.append(b.label);
      } else { node = document.createElement('p'); b.lines.forEach((l, i) => { if (i) node.appendChild(document.createElement('br')); node.append(l); }); }
      view.appendChild(node);
    });
  }

  function renderNotes() {
    const items = [];
    if (draft) {
      if (isStale()) items.push('The form has changed since this draft was made. Your draft stays as it is until you choose Generate message.');
      validateNow(readForm()).notes.forEach(n => items.push(n.msg));
      currentLint().warn.forEach(w => items.push(w));
      if (draft.droppedEvidence && !draft.edited) items.push('The observation was too long to fit, so this note leaves it out. Shorten the observation and generate again to include it.');
    }
    const list = $('noteList');
    list.textContent = '';
    items.forEach(msg => {
      const li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    });
    $('notesBox').hidden = items.length === 0;
  }

  function renderSummary(s) {
    const box = $('followSummary');
    const sum = s.stage === 'followup' ? Rules.summaryFor(s) : null;
    box.hidden = !sum;
    if (sum) {
      $('summaryCategory').textContent = sum.category;
      $('summaryNext').textContent = sum.nextStep;
    }
  }

  function renderGaps(s) {
    const v = validateNow(s);
    const list = $('gapList');
    list.textContent = '';
    v.blockers.filter(b => b.field !== 'doNotContact').forEach(b => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'linklike'; btn.textContent = b.msg;
      btn.addEventListener('click', () => {
        const f = $(b.field === 'channel' ? 'ch-email' : b.field === 'askTopics' ? 'ask-services' : b.field === 'trackerMatch' ? 'trackerMatchUse' : b.field === 'employerVerify' ? 'recordBox' : b.field);
        if (!f) return;
        const holder = f.closest('details');
        if (holder) holder.open = true;
        f.scrollIntoView({ block: 'center' });
        f.focus();
      });
      li.appendChild(btn); list.appendChild(li);
    });
    $('gaps').hidden = !(attempted && list.children.length > 0);
    return v;
  }

  function renderEvidence() {
    const box = $('evidenceBox'), list = $('evidenceList');
    list.textContent = '';
    if (!draft || !draft.evidence || !draft.evidence.length) { box.hidden = true; return; }
    draft.evidence.forEach(([k, val]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = k; dd.textContent = val;
      list.append(dt, dd);
    });
    box.hidden = false;
  }

  function renderAll() {
    const s = readForm();
    renderDnc(s);
    RecordViews.render();
    renderTrackerMatch(s);
    syncPreviews();
    syncHints();
    syncResearch();
    const v = renderGaps(s);
    syncScope(v);
    renderSummary(readForm());
    renderCounts();
    renderGate();
    renderNotes();
  }

  function evidenceRecord(ctx, cand) {
    const s = ctx.state, rows = [];
    const used = (ctx.vars.obs && cand.body.includes(ctx.vars.obs)) || (ctx.vars.referrer && cand.body.includes(ctx.vars.referrer));
    if (!used) return rows;
    if (ctx.reason === 'referral') {
      rows.push(['Referrer', s.referrer.trim()], ['Consent', 'You confirmed the referral and that they agreed to be named.']);
    } else if (ctx.reason === 'previous') {
      rows.push(['Conversation', s.observation.trim()]);
    } else if (ctx.hasObservation) {
      rows.push(['Finding', s.observation.trim()]);
      if (s.sourceUrl.trim()) rows.push(['Source', s.sourceUrl.trim()]);
      rows.push(['Checked', Rules.formatDate(s.dateChecked, ctx.today)], ['Status', 'You checked and confirmed this.']);
    }
    return rows;
  }

  function followType(ctx) {
    if (ctx.stage !== 'followup') return 'first';
    if (ctx.category === 'noResponse') return ctx.kind === 'final' ? 'final' : 'reminder';
    return 'reply';
  }

  function showNoMessage(result) {
    draft = { noMessage: true, channel: result.ctx.channel, snapshot: snapshot(result.ctx.state), candidates: [], category: result.ctx.category };
    $('noMessage').textContent = result.ctx.category === 'deliveryFailure' ? 'No message is needed. Email Kit has recorded that the last message did not reach them. Correct the address in the client record.'
      : result.ctx.state.optOutScope === 'review' ? 'Send nothing yet. Email Kit has paused outreach until you review this possible opt-out in Next actions.'
        : 'No message is needed. They asked for no reply, and Email Kit has recorded the restriction.';
    $('emptyState').hidden = true;
    $('draftArea').hidden = true;
    $('noMessage').hidden = false;
    $('alternative').disabled = true;
    $('altPanel').hidden = true;
    $('whyBox').hidden = true;
    $('body').value = ''; $('subject').value = '';
  }

  function showCandidate(result, cand) {
    const ctx = result.ctx;
    draft = {
      channel: ctx.channel, terms: ctx.showTerms || ctx.category === 'commercial', candidates: result.candidates,
      activeId: cand.id, snapshot: snapshot(ctx.state), edited: false, targetActive: result.targetActive,
      overflow: cand.fits ? '' : result.overflow, droppedEvidence: cand.droppedEvidence,
      evidence: evidenceRecord(ctx, cand), result, category: ctx.category, followType: followType(ctx),
      reusedSubject: ctx.stage === 'followup' && ctx.channel === 'email' && !!ctx.state.priorSubject.trim()
    };
    $('emptyState').hidden = true;
    $('noMessage').hidden = true;
    $('draftArea').hidden = false;
    $('subjectRow').hidden = ctx.channel !== 'email';
    $('subject').value = cand.subject || '';
    $('body').value = cand.body;
    $('bodyLabel').textContent = CONFIG.channels.find(c => c.id === ctx.channel).label;
    $('alternative').disabled = result.candidates.length < 2;
    $('alternative').textContent = result.candidates.length < 2 ? 'No other version suits' : 'Choose an alternative';
    $('altPanel').hidden = true;
    $('alternative').setAttribute('aria-expanded', 'false');
    $('whyText').textContent = cand.label + '. ' + cand.difference + ' ' + cand.why;
    $('whyBox').hidden = false;
    renderEvidence();
    growBody();
  }

  function keepEdited() {
    if (draft && draft.edited) replaced = { body: $('body').value, subject: $('subject').value, draft };
    $('restoreBox').hidden = !replaced;
  }

  function clearDraft() {
    draft = null; replaced = null;
    $('restoreBox').hidden = true;
    $('altPanel').hidden = true;
    $('alternative').disabled = true;
    $('alternative').textContent = 'Choose an alternative';
    $('emptyState').hidden = false;
    $('noMessage').hidden = true;
    $('draftArea').hidden = true;
    $('whyBox').hidden = true;
    $('evidenceBox').hidden = true;
    $('body').value = ''; $('subject').value = '';
    $('copySubject').hidden = false;
  }

  function buildAlternatives() {
    const list = $('altList');
    list.textContent = '';
    draft.candidates.filter(c => c.id !== draft.activeId).forEach(c => {
      const li = document.createElement('li');
      const t = document.createElement('strong'); t.textContent = c.label;
      const d = document.createElement('p');
      d.textContent = c.difference;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn quiet small'; b.textContent = 'Use this version';
      b.setAttribute('aria-label', 'Use the version: ' + c.label);
      b.addEventListener('click', () => {
        keepEdited();
        showCandidate(draft.result, c);
        saveCurrentDraft();
        renderAll();
        say('The version "' + c.label + '" is in use.');
        $('body').focus();
      });
      li.append(t, d, b);
      list.appendChild(li);
    });
  }

  /* A reply is recorded as soon as it is confirmed, even if no draft follows. */
  async function recordResponse(s) {
    const cat = s.responseCategory, pasted = s.responseText.trim();
    if (activeEntry && db.convs[activeEntry] && Engine.differs(db, db.convs[activeEntry], s)) return true;
    /* A pasted reply is always recorded. The suggestion stands in for an unset
       category, and Unclear stands in when Email Kit cannot read it. */
    if (s.stage === 'followup' && cat === 'optOut' && Rules.detectNoReply(pasted)) { $('noReplyRequested').checked = true; s.noReplyRequested = true; }
    if (s.stage === 'followup' && pasted && !s.stopReviewed && cat !== 'optOut' && s.company.trim() && Rules.interpret(pasted).optOut) {
      $('responseCategory').value = 'optOut'; $('optOutScope').value = 'review';
      touched.add('optOutScope'); touched.add('responseCategory'); syncOptions();
      return recordResponse(readForm());
    }
    if (s.stage === 'followup' && cat === 'noResponse' && pasted && s.company.trim()) {
      const read = Rules.interpret(s.responseText, Rules.localToday());
      const again = activeEntry ? Engine.rows(db, 'msgs').find(m => m.convId === activeEntry && m.direction === 'in' && m.hash === Engine.hash(s.responseText)) : null;
      /* A category you already confirmed stands. A mixed reading waits for you. */
      $('responseCategory').value = again ? again.category : (read.alternatives.length ? 'unclear' : read.category || 'unclear');
      /* Wording that only looks like an opt-out pauses outreach until you decide. */
      if (!again && $('responseCategory').value === 'optOut') { $('optOutScope').value = 'review'; touched.add('optOutScope'); }
      touched.add('responseCategory');
      autoFill('responseCategory');
      return recordResponse(readForm());
    }
    if (s.stage !== 'followup' || !cat || cat === 'noResponse' || !s.company.trim()) return true;
    /* A referral with no name has nothing to act on yet, and the form keeps the reply. */
    if (cat === 'referred' && !s.referredName.trim()) return true;
    if (['closed', 'final'].includes(s.priorType) && !pasted && !['optOut', 'deliveryFailure'].includes(cat)) return true;
    /* A correction away from an opt-out must not hide the mark. */
    const out = await attempt('processResponse', { s, text: s.responseText, source: Rules.parseHeaders(s.responseText).from ? 'pasted email' : 'pasted' });
    if (!out) return false;
    activeEntry = out.result.convId;
    /* Questions from an earlier unanswered reply stay in this one. */
    const pendingNow = (db.convs[activeEntry] || {}).pending;
    if (pendingNow) {
      (pendingNow.fields.askTopics || []).forEach(t => { if ($('ask-' + t)) $('ask-' + t).checked = true; });
      if (pendingNow.fields.includeTerms && !touched.has('includeTerms')) $('includeTerms').checked = true;
    }
    syncOptions();
    if (!out.result.duplicate && cat === 'optOut') {
      replaced = null;
      $('restoreBox').hidden = true;
      const name = s.recipientName.trim() || Rules.shortCompany(s.company);
      const text = s.optOutScope === 'review' ? 'Email Kit has paused outreach to ' + name + ' until you review the restriction.' : 'Email Kit has marked ' + name + ' as Do not contact.';
      pendingToast = [text, [{ label: 'Undo', run: async () => {
        /* Only the acknowledgement goes. A draft from before the opt-out comes back. */
        const msgId = draft && draft.category === 'optOut' ? draft.msgId : '';
        if (!await undo(out.changes, 'The mark is removed.')) return;
        if (msgId) await attempt('dropDraft', { msgId });
        clearDraft();
        renderAll();
      } }]];
    }
    return true;
  }

  async function generate() {
    if (generating || !ready || Store.mode === 'failed') return;
    generating = true;
    try { await generateNow(); } finally { generating = false; }
  }
  async function generateNow() {
    attempted = true;
    if (['import','reconnect'].includes($('scenario').value) && !activeEntry) {
      reviewIntake(); showToast('Save and verify the conversation context before drafting.'); return;
    }
    /* A pasted reply means the client spoke last, so the wait-after-sending pause
       does not apply; the reply (an opt-out above all) must still be recorded. */
    if (activeEntry && ['after-reply','no-response'].includes($('scenario').value) && !$('responseText').value.trim()) {
      const conv = db.convs[activeEntry];
      const lastDate = conv && (conv.importedContext?.lastDate || conv.lastSentAt);
      const advice = Conversation.advise({lastSpeaker:'consultant',lastDate,outstanding:conv?.importedContext?.outstanding || '',scenario:$('scenario').value}, Rules.localToday());
      if (advice.action === 'pause' || advice.action === 'clarify') { showToast(advice.reason); return; }
    }
    if (activeEntry && $('scenario').value === 'reply' && db.convs[activeEntry]?.importedContext?.lastSpeaker === 'client' && !$('contextAnswer').value.trim()) {
      showToast('Add a verified answer or next step before drafting a reply to this imported message.'); $('contextAnswer').focus(); return;
    }
    resetUndo = null; $('toast').hidden = true;
    let s = readForm();
    pendingToast = null;
    if (!await recordResponse(s)) return;
    s = readForm();
    const v = renderGaps(s);
    if (v.blockers.length) {
      if (v.blockers.some(b => b.field.startsWith('sender'))) $('senderBox').open = true;
      renderAll();
      if (pendingToast) showToast(pendingToast[0], pendingToast[1]);
      $('gaps').focus();
      say(v.blockers.length + ' item' + (v.blockers.length === 1 ? '' : 's') + ' to resolve before Email Kit can make a draft.');
      return;
    }
    /* Text written for a prospect who has now opted out must not come back. */
    if (s.stage === 'followup' && s.responseCategory === 'optOut') {
      replaced = null;
      $('restoreBox').hidden = true;
    } else {
      keepEdited();
    }
    $('senderBox').open = false;
    const result = Rules.compose(s, limits);
    const imported = activeEntry && db.convs[activeEntry]?.importedContext;
    if (imported && ['reply','after-reply','no-response'].includes(s.scenario) && !result.noMessage) {
      const message = Conversation.draft(imported, s);
      if (message) result.candidates = [Object.assign({id:'verified-context',label:'Based on verified context',difference:'Uses the recorded objective and latest state.',why:'Review and edit before using it.',fits:true,droppedEvidence:[]},message)];
    }
    if (result.noMessage) showNoMessage(result);
    else {
      showCandidate(result, result.candidates[0]);
      await saveCurrentDraft();
    }
    renderAll();
    if (pendingToast) showToast(pendingToast[0], pendingToast[1]);
    say(result.noMessage ? 'No message is needed. The prospect is marked Do not contact.' : 'Draft generated. ' + $('bodyCount').textContent);
    if (window.matchMedia('(max-width: 1080px)').matches) $('messageHeading').scrollIntoView({ block: 'start' });
    $('messageHeading').focus();
  }

  /* The draft on screen is saved automatically. Saving never means sent. */
  async function saveCurrentDraft() {
    if (!draft || draft.noMessage) return null;
    /* A draft that an event has withdrawn is not brought back by saving it. */
    if (draft.msgId && db.msgs[draft.msgId] && db.msgs[draft.msgId].status === 'cancelled') {
      showToast('This draft was withdrawn: ' + (db.msgs[draft.msgId].cancelReason || 'the conversation has changed') + ' Generate it again if you still need it.');
      return null;
    }
    const s = readForm();
    if (!sameSubject() || JSON.parse(draft.snapshot).agencyVersion !== CONFIG.profileVersion || copyBlocks().some(x => x.includes('Generate a fresh draft'))) return null;
    const body = $('body').value, subject = $('subject').value;
    const blocks = copyBlocks().length > 0;
    const out = await attempt('saveDraft', { s, body, subject, ready: !blocks && !isStale() });
    if (!out || !draft) return null;
    draft.convId = out.result.convId; draft.msgId = out.result.msgId;
    return out;
  }

  /* ---------- Carrying work forward ---------- */
  function showToast(text, actions) {
    const toast = $('toast');
    toast.textContent = '';
    const p = document.createElement('span');
    p.textContent = text;
    toast.appendChild(p);
    const list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);
    if (list.length) {
      const wrap = document.createElement('div');
      wrap.className = 'toast-actions';
      list.forEach(action => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn quiet small'; b.textContent = action.label;
        b.addEventListener('click', action.run);
        wrap.appendChild(b);
      });
      toast.appendChild(wrap);
    }
    toast.hidden = false;
  }

  /* Holds everything needed to undo a step that clears the form. */
  function snapshotWork() {
    return { form: readForm(), draft, body: $('body').value, subject: $('subject').value, attempted, touched: Array.from(touched), replaced, activeEntry };
  }
  function restoreWork(u) {
    touched.clear();
    u.touched.forEach(f => touched.add(f));
    activeEntry = u.activeEntry;
    writeForm(u.form);
    attempted = u.attempted;
    clearDraft();
    if (u.draft) {
      draft = u.draft;
      $('emptyState').hidden = true;
      if (draft.noMessage) {
        $('noMessage').hidden = false;
      } else {
        $('draftArea').hidden = false;
        $('subjectRow').hidden = draft.channel !== 'email';
        $('subject').value = u.subject; $('body').value = u.body;
        $('alternative').disabled = draft.candidates.length < 2;
        $('alternative').textContent = draft.candidates.length < 2 ? 'No other version suits' : 'Choose an alternative';
        $('whyBox').hidden = false;
        renderEvidence();
        growBody();
      }
    }
    replaced = u.replaced;
    $('restoreBox').hidden = !replaced;
    $('toast').hidden = true;
    renderAll();
  }

  /* Clears the prospect and draft. Sender details always stay. */
  function blankForm(keepChannel) {
    const sender = {};
    SENDER_FIELDS.forEach(f => { sender[f] = $(f).value; });
    const remember = $('rememberSender').checked;
    const channel = readForm().channel;
    activeEntry = '';
    referralFrom = '';
    carry = {};
    $('form').reset();
    SENDER_FIELDS.forEach(f => { $(f).value = sender[f]; });
    $('rememberSender').checked = remember;
    $('ch-' + (keepChannel ? channel : 'email')).checked = true;
    $('mode-first').checked = true;
    $('scenario').value = 'new';
    ['importHistory','importObjective','importSubject','importLastSpeaker','importLastDate','importLastText','importSummary','importOutstanding','importNext'].forEach(id => { $(id).value = ''; });
    $('confirmImport').disabled = true; $('importAssessment').textContent = ''; importReviewed = false;
    touched.clear();
    attempted = false;
    clearDraft();
    syncScenario();
    syncOptions();
    lastReason = $('reason').value;
  }

  /* Records the message on screen and clears the form for the next prospect. */
  async function markSent() {
    if (!draft || draft.noMessage || sending) return;
    sending = true;
    try { await markSentNow(); } finally { sending = false; }
  }
  async function markSentNow() {
    const s = readForm();
    const before = snapshotWork();
    const today = Rules.localToday();
    const who = [s.recipientName.trim(), Rules.shortCompany(s.company)].filter(Boolean).join(' at ');
    /* Saves the final text first, so the record and the screen are the same message. */
    if (!await saveCurrentDraft()) return;
    const sent = { channel: draft.channel, subject: $('subject').value, body: $('body').value };
    const out = await attempt('markSent', Object.assign({ s, convId: draft.convId, msgId: draft.msgId }, sent));
    if (!out) return;
    let changes = out.changes;
    if (s.referredBy) {
      const task = Engine.rows(db, 'tasks').find(x => x.convId === s.referredBy && x.kind === 'referral' && x.status === 'open');
      const done = task ? await attempt('resolveTask', { id: task.id, status: 'done', why: 'The first message went out.' }) : null;
      if (done) changes = out.changes.concat(done.changes);
    }
    const conv = db.convs[out.result.convId];
    blankForm(true);
    renderAll();
    const next = conv && conv.next && conv.next.owner !== 'Usha' ? conv.next : null;
    const when = next && next.due ? ' Next: ' + next.action + ' on ' + Rules.formatDate(next.due, today) + '.' : (conv && conv.outcome ? ' Outcome: ' + conv.outcome + '.' : ' No follow-up is planned.');
    const actions = [];
    const meeting = out.result.meetingId ? db.meetings[out.result.meetingId] : null;
    if (meeting) actions.push({ label: 'Add the meeting to calendar', run: () => RecordViews.meetingCalendar(meeting) });
    else if (s.stage === 'followup' && s.responseCategory === 'referred') actions.push({ label: 'Prepare outreach to ' + s.referredName.trim(), run: () => prepareReferred({ id: conv.id }) });
    else if (next && next.due) actions.push({ label: 'Add to calendar', run: () => addToCalendar({ id: conv.id, nextDate: next.due, recipientName: s.recipientName.trim(), company: Rules.shortCompany(s.company) }) });
    actions.push({ label: 'Undo', run: async () => { if (await undo(changes, 'The message is no longer marked as sent.')) { restoreWork(before); say('The last step is undone.'); $('markSent').focus(); } } });
    showToast('Email Kit has recorded your message to ' + who + '.' + when, actions);
    say('Email Kit has recorded your message to ' + who + '.' + when);
    $('messageHeading').focus();
  }

  /* Saves the draft for later. It stays a draft until you mark it as sent. */
  async function queueLater() {
    const saved = draft && (draft.msgId ? true : await saveCurrentDraft());
    if (!saved) return;
    await saveCurrentDraft();
    const channel = draft.channel, convId = draft.convId, msgId = draft.msgId;
    const out = await attempt('enqueue', { convId, msgId, channel });
    if (!out) return;
    blankForm(true);
    renderAll();
    showToast(navigator.onLine ? 'The draft is queued. Email Kit checks it again before you use it.' : 'The draft is queued. Email Kit will check it again when you are back online.');
    say('The draft is queued.');
  }

  /* Loads a conversation for its next message. Opening one records nothing. */
  function continueEntry(entry, stored) {
    const conv = db.convs[entry.id];
    if (!conv) return;
    const before = snapshotWork();
    const hadWork = window.EmailKitApp.hasFormWork();
    blankForm(false);
    const sender = {};
    SENDER_FIELDS.forEach(f => { sender[f] = $(f).value; });
    /* A saved draft reopens as the message it was written for. */
    const open = stored || Engine.rows(db, 'msgs').find(m => m.convId === conv.id && m.direction === 'out' && ['draft', 'ready'].includes(m.status));
    const s = Object.assign(readForm(), Engine.formFor(db, conv, sender), open && open.context ? open.context : {});
    s.scenario = s.stage === 'followup' ? (s.responseText ? 'reply' : 'no-response') : 'new';
    activeEntry = s.stage === 'first' ? '' : conv.id;
    carry = { followTask: s.followTask || '', promise: s.promise || '', owedAnswer: !!s.owedAnswer, resend: s.resend || '' };
    touched.add('desired');
    writeForm(Object.assign({},s,{whatsappConsent:false,waNumber:'',waEvidence:''}));
    if (conv.importedContext) {
      $('scenario').value = conv.importedContext.lastSpeaker === 'client' ? 'reply' : 'after-reply';
      if (conv.importedContext.lastSpeaker === 'client') $('responseText').value = conv.importedContext.lastText;
      $('priorDate').value = conv.importedContext.lastDate;
      $('priorTopic').value = conv.importedContext.objective;
      syncScenario();
    }
    renderAll();
    $('trackerBox').open = false;
    $('toast').hidden = true;
    const name = (db.contacts[conv.contactId] || {}).name || (db.orgs[conv.orgId] || {}).name;
    /* A saved draft, edited or not, comes back. It is never replaced unseen. */
    if (open && open.agencyVersion === CONFIG.profileVersion && open.channel === s.channel && (!open.context || !open.context.responseCategory || open.context.responseCategory === s.responseCategory)) showStored(open);
    else if (open) showToast('A previous draft is in History. Generate a new one for the current agency and conversation.');
    if (hadWork) showToast('Email Kit replaced the form with ' + name + '.', { label: 'Undo', run: () => { restoreWork(before); say('The last step is undone.'); } });
    say('Email Kit has loaded ' + name + '.');
    if (!open) {
      $('responseText').scrollIntoView({ block: 'center' });
      $('responseText').focus();
    }
  }

  /* Brings back a saved draft, unchanged, after checking that it still applies. */
  function showStored(msg) {
    const s = readForm();
    const result = Rules.compose(s, limits);
    const cand = Object.assign({}, result.candidates[0] || { id: 'stored', label: 'Saved draft', difference: '', why: '' }, { body: msg.body, subject: msg.subject });
    if (!result.candidates.length) result.candidates = [cand];
    showCandidate(result, cand);
    draft.edited = true;
    draft.convId = msg.convId; draft.msgId = msg.id;
    renderAll();
    $('messageHeading').focus();
  }

  async function saveFile(name, text, type) {
    const blob = new Blob([text], { type });
    const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
    /* Phones save through the share sheet. Other browsers download the file. */
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return true;
      } catch (e) {
        if (e.name === 'AbortError') return false;
      }
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    return true;
  }

  function addToCalendar(entry) { saveFile('email-kit-follow-up-' + entry.nextDate + '.ics', Rules.calendarFile(entry), 'text/calendar'); }

  /* Stops a second first message to someone already on record. */
  function renderTrackerMatch(s) {
    const box = $('trackerMatch');
    const match = s.stage === 'followup' ? null : Rules.findTracked(tracker, s);
    box.hidden = !match;
    if (!match) return;
    const closed = match.lastType === 'closed';
    const date = Rules.formatDate(match.lastDate, Rules.localToday());
    $('trackerMatchText').textContent = closed
      ? 'You last contacted ' + (match.recipientName || match.company) + ' on ' + date + ', and this conversation has ended. Please write again only if they contact you.'
      : 'You last contacted ' + (match.recipientName || match.company) + ' on ' + date + '. Continue that conversation instead of sending a new first message.';
    $('trackerMatchUse').textContent = closed ? 'They replied' : 'Continue';
    $('trackerMatchUse').onclick = () => continueEntry(match);
    const remove = $('trackerMatchRemove');
    if (remove.dataset.record !== match.id) { remove.dataset.record = match.id; delete remove.dataset.armed; remove.textContent = 'Remove the record'; }
    remove.onclick = () => {
      if (remove.dataset.armed !== 'yes') { remove.dataset.armed = 'yes'; remove.textContent = 'Confirm removal'; return; }
      delete remove.dataset.armed; removeEntry(match);
    };
  }

  async function removeEntry(entry) {
    const out = await attempt('deleteConversation', { id: entry.id });
    if (!out) return;
    if (entry.id === activeEntry) activeEntry = '';
    renderAll();
    showToast('The record is removed. Any Do not contact mark stays.', { label: 'Undo', run: () => undo(out.changes, 'The record is back.') });
    say('The record is removed.');
  }

  /* Starts outreach to the person named in a referral. */
  function prepareReferred(from) {
    const conv = db.convs[from.id];
    if (!conv) return;
    const contact = db.contacts[conv.contactId] || {}, org = db.orgs[conv.orgId] || {};
    const who = String(conv.referredName || '').trim();
    const referrer = String(contact.name || '').trim();
    const allowed = conv.referralPermission === 'yes' && !!referrer;
    const role = (conv.referredRole || '').trim();
    blankForm(true);
    referralFrom = conv.id;
    const s = readForm();
    Object.assign(s, {
      stage: 'first', company: org.legalName || org.name, industry: org.industry || '', location: org.location || '', recipientName: who, designation: role,
      responsibility: Rules.suggestResponsibility(role) || 'decision', reason: allowed ? 'referral' : 'role',
      referrer: allowed ? referrer : '', referrerConsent: allowed, channel: 'email'
    });
    writeForm(s);
    renderAll();
    showToast(allowed ? 'The message will mention the referrer, because you recorded clear permission.' : 'The message will not mention the referrer, because you have no clear permission.');
    say('Email Kit has set up outreach to ' + who + '.');
    $('messageHeading').focus();
  }

  /* A first message at a new company opens from the earlier contact, not cold. */
  function startAtNewCompany(contact) {
    const aff = contact.affiliations.find(a => a.current);
    const org = aff && db.orgs[aff.orgId], link = Engine.formerLink(db, contact);
    if (!org) return;
    blankForm(true);
    const s = readForm();
    Object.assign(s, { stage: 'first', company: org.legalName || org.name, recipientName: contact.name, recipientTitle: contact.title || '', recipientContact: '', designation: aff.designation || contact.designation || '', responsibility: contact.responsibility || 'unknown', channel: 'email' });
    if (link) {
      Object.assign(s, { reason: 'previous', conversationWhen: 'when you were at ' + link.org.name, observation: link.topic || 'recruitment support' });
      carry = { formerCompany: link.org.name };
    }
    writeForm(s);
    renderAll();
    say('Email Kit has set up a first message to ' + contact.name + ' at ' + org.name + '.');
    $('messageHeading').focus();
  }

  /* ---------- Copying ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* use the fallback below */ }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  /* Email carries both versions, so it pastes well anywhere. */
  async function copyRich(text) {
    try {
      if (navigator.clipboard && window.isSecureContext && typeof ClipboardItem === 'function') {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([Rules.emailHtml(text)], { type: 'text/html' }) })]);
        return true;
      }
    } catch (e) { /* use plain text below */ }
    return copyText(text);
  }

  async function copyInto(button, text, done, source, rich) {
    const ok = await (rich ? copyRich(text) : copyText(text));
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    if (ok) {
      button.textContent = done;
      say(done);
      setTimeout(() => { button.textContent = original; }, 1800);
    } else {
      source.focus(); source.select();
      const msg = 'Your browser blocked copying. The text is selected, so please press Ctrl and C, or Command and C.';
      say(msg);
      $('copyReason').textContent = msg;
    }
  }

  /* ---------- Device storage ---------- */
  const failText = e => (e instanceof Engine.EngineError ? e.message : 'Email Kit could not save this on your device, so nothing was recorded. Please try again, and save a backup if this continues.');
  let chain = Promise.resolve();
  let busy = 0;
  const channelOut = typeof BroadcastChannel === 'function' ? new BroadcastChannel('email-kit-records') : null;

  let agencyLoaded;
  function refreshViews() {
    const profile = db.meta.agency && db.meta.agency.value;
    const serialized = JSON.stringify(profile || null);
    if (serialized !== agencyLoaded) {
      agencyLoaded = serialized; applyAgency(profile);
    }
    tracker = Engine.trackerView(db);
    doNotContact = Engine.suppressionView(db);
  }

  /* Only one tab writes at a time, and it first reads what the others wrote. */
  async function exclusive(fn) {
    if (!navigator.locks) return fn();
    /* A stuck tab must not freeze this one. The check inside the write still protects the data. */
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 5000);
    try {
      return await navigator.locks.request('email-kit-records', { signal: stop.signal }, () => { clearTimeout(timer); return fn(); });
    } catch (e) {
      if (e && e.name === 'AbortError') return fn();
      throw e;
    }
  }
  const revOf = state => (state.meta.rev || {}).n || 0;
  async function catchUp() {
    if (await Store.revision() === rev) return;
    db = await Store.load();
    rev = revOf(db);
    Engine.applySettings(db);
    refreshViews();
  }
  /* The command name lets the server apply the right access level. */
  async function write(changes, command) {
    const row = { id: 'rev', n: rev + 1 };
    await Store.commit(changes.concat({ table: 'meta', id: 'rev', value: row, prev: db.meta.rev || null }), rev, command);
    Engine.applyChanges(db, changes);
    db.meta.rev = row;
    rev = row.n;
    Engine.applySettings(db);
    refreshViews();
    if (channelOut) channelOut.postMessage('changed');
  }

  /* Runs one command. Memory changes only after storage confirms the save. */
  function exec(name, args, source) {
    busy++;
    document.body.dataset.busy = 'true';
    const settle = () => { if (!--busy) delete document.body.dataset.busy; };
    const job = chain.then(() => exclusive(async () => {
      /* If another tab wrote first, the command runs again on the newer records. */
      for (let attemptNo = 0; ; attemptNo++) {
        await catchUp();
        const out = Engine.run(db, name, args, { actor: actorName(), source });
        if (!out.changes.length) return out;
        try { await write(out.changes, name); return out; } catch (e) {
          if (!(e instanceof Store.Stale) || attemptNo > 2) throw e;
        }
      }
    }));
    chain = job.catch(() => {});
    job.then(settle, settle);
    return job;
  }
  /* The same, for steps the user started. A failure is shown and never hidden. */
  async function attempt(name, args, source) {
    try {
      return await exec(name, args, source);
    } catch (e) {
      failure(e);
      return null;
    }
  }
  function failure(e) {
    const msg = failText(e);
    showToast(msg);
    say(msg);
    $('toast').classList.add('bad');
  }
  async function undo(changes, text) {
    busy++;
    document.body.dataset.busy = 'true';
    try {
      await chain;
      const blocked = await exclusive(async () => {
        await catchUp();
        /* A record that has moved on since must not be pulled back. */
        const moved = changes.some(c => c.value && c.table !== 'events' && !sameState(c.table, db[c.table][c.id], c.value));
        if (moved) return true;
        await write(Engine.invert(changes), 'undo');
        return false;
      });
      if (blocked) { showToast('This step can no longer be undone, because the record has changed since.'); return false; }
      await attempt('undone', { what: text });
    } catch (e) { failure(e); return false; } finally { if (!--busy) delete document.body.dataset.busy; }
    $('toast').hidden = true;
    renderAll();
    say(text);
    return true;
  }
  /* Later saves may touch a record without changing where it stands. */
  function sameState(table, now, then) {
    if (!now || !then) return now === then;
    if (table === 'convs') return now.status === then.status && now.lastType === then.lastType && now.attempts === then.attempts;
    if (table === 'contacts') return now.status === then.status && now.name === then.name && String(now.keys) === String(then.keys);
    if (table === 'orgs') return now.name === then.name;
    if (['msgs', 'tasks', 'suppressions', 'meetings'].includes(table)) return now.status === then.status;
    return true;
  }
  /* History records the signed-in team member, not a typed name. */
  const actorName = () => (Store.user && Store.user.name) || $('senderName').value.trim() || 'Consultant';

  function readSender() {
    try {
      const raw = localStorage.getItem(STORE_SENDER);
      if (raw) {
        const data = JSON.parse(raw);
        SENDER_FIELDS.forEach(f => { if (typeof data[f] === 'string') $(f).value = data[f]; });
        $('rememberSender').checked = true;
        if (data.senderName) $('senderBox').open = false;
      }
    } catch (e) { /* storage may be unavailable */ }
    /* A new browser starts with the signed-in person's name. */
    if (!$('senderName').value && Store.user && Store.user.name && !Store.user.name.includes('@')) $('senderName').value = Store.user.name;
  }

  /* Prepares a follow-up that has fallen due. A person still reviews it. */
  function autoCompose(s) {
    const today = Rules.localToday();
    const state = Object.assign({ stage: 'followup', responseCategory: 'noResponse' }, s, {agencyVersion: CONFIG.profileVersion, whatsappConsent:false});
    if (Rules.validate(state, today, doNotContact, tracker).blockers.length) return null;
    const c = Rules.compose(state, limits, today).candidates[0];
    return c ? { s: state, body: c.body, subject: c.subject } : null;
  }

  /* Each conversation runs on its own, so one fault cannot hold up the rest. */
  let reconciling = false;
  async function reconcile() {
    if (reconciling || Store.mode === 'failed' || Store.readOnly) return null;
    reconciling = true;
    const report = { overdue: 0, drafted: 0, closed: 0, cancelled: 0, ready: 0, failed: 0 };
    try {
      await catchUp();
      const sender = {};
      SENDER_FIELDS.forEach(f => { sender[f] = $(f).value; });
      const today = Rules.localToday();
      const due = Array.from(new Set(Engine.rows(db, 'tasks').filter(t => t.status === 'open' && t.due && t.due <= today && t.convId).map(t => t.convId)));
      for (const convId of due) {
        try {
          /* Records are shared, so a follow-up is drafted by whoever continues it,
             with their own sender details, never in the background. */
          const out = await exec('reconcileConversation', { convId, sender, composer: () => null }, 'Usha');
          Object.keys(out.result).forEach(k => { report[k] += out.result[k]; });
        } catch (e) { report.failed++; }
      }
      const q = await exec('reconcileQueue', {}, 'Usha');
      report.cancelled += q.result.cancelled;
      report.ready += q.result.ready;
    } catch (e) { report.failed++; } finally { reconciling = false; }
    return report;
  }

  async function moveLegacyRecords() {
    /* Each list is read alone, so damage to one cannot lose the other. */
    const damaged = [];
    const list = key => {
      try {
        const v = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(v)) return v;
      } catch (e) { /* reported below */ }
      damaged.push(key);
      return [];
    };
    const tracked = list(STORE_TRACKER), marks = list(STORE_DNC);
    /* A damaged list stays where it is, and the user is told. Nothing is discarded quietly. */
    if (damaged.includes(STORE_DNC)) legacyProblem = 'Your earlier Do not contact list is damaged, so Email Kit could not read it. Restore a backup, and check any contact on that list before writing.';
    else if (damaged.includes(STORE_TRACKER)) legacyProblem = 'Your earlier tracker is damaged, so Email Kit could not read it. Restore a backup if you have one.';
    if (!tracked.length && !marks.length) return;
    const out = await attempt('migrateLegacy', { tracker: tracked, doNotContact: marks }, 'version 1');
    if (!out) return;
    if (out.result.skipped) legacyProblem = legacyProblem || out.result.skipped + ' earlier records were too damaged to move. Please check them against a backup.';
    try {
      if (!damaged.includes(STORE_TRACKER)) localStorage.removeItem(STORE_TRACKER);
      if (!damaged.includes(STORE_DNC)) localStorage.removeItem(STORE_DNC);
      localStorage.setItem(STORE_SCHEMA, String(SCHEMA));
    } catch (e) { /* the records are safe in the database */ }
  }

  function showStorage() {
    const bar = $('storeBar');
    bar.hidden = !['none', 'failed'].includes(Store.mode) && !legacyProblem;
    bar.textContent = !['none', 'failed'].includes(Store.mode) ? legacyProblem : Store.mode === 'failed' ? (Store.problem || 'Email Kit could not open your records') + ' Drafting has stopped to protect your Do not contact list. Your records have not been changed.'
      : 'This browser is not allowing Email Kit to save, so your records will be lost when you close it. Save a backup, or open Email Kit in a normal browser window.';
    $('generate').disabled = $('generate').disabled || Store.mode === 'failed';
    const count = Engine.rows(db, 'convs').length;
    $('storageText').textContent = Store.mode === 'database' ? 'Client records are saved in the Working Platform and shared with your team. It holds ' + count + (count === 1 ? ' conversation.' : ' conversations.')
      : Store.mode === 'document' ? 'Your records are saved in this browser as one document, because its database is not available. Attachments need the database.'
        : Store.mode === 'failed' ? 'Email Kit could not open your records.' : 'Nothing can be saved in this browser.';
    $('privacyLine').hidden = ['none', 'failed'].includes(Store.mode);
  }

  /* Files outlive a delete until the next start, so Undo can bring them back. */
  async function purgeFiles() {
    try {
      const used = new Set(Engine.rows(db, 'sources').map(r => r.fileId));
      await Store.deleteFiles((await Store.fileIds()).filter(id => !used.has(id)));
    } catch (e) { /* tidying can wait for the next start */ }
  }

  async function startRecords() {
    try {
      await Store.open();
      db = await Store.load();
      rev = revOf(db);
    } catch (e) { db = Engine.emptyState(); Store.fail(); }
    Store.onlost = () => { showStorage(); renderAll(); };
    Engine.applySettings(db);
    refreshViews();
    if (Store.mode === 'failed') {
      ready = true;
      document.body.dataset.ready = 'true';
      showStorage();
      renderAll();
      return;
    }
    if (!Store.readOnly) await moveLegacyRecords();
    const report = await reconcile();
    ready = true;
    document.body.dataset.ready = 'true';
    showStorage();
    RecordViews.showRules();
    renderAll();
    if (Engine.actions(db, Rules.localToday()).some(a => !a.future)) $('trackerBox').open = true;
    /* An update notice stays on screen. The panel already shows what is due. */
    if ($('toast').hidden && report && (report.overdue || report.closed || report.cancelled)) {
      const parts = [];
      if (report.failed) parts.push(report.failed + (report.failed === 1 ? ' conversation could not be checked' : ' conversations could not be checked'));
      if (report.overdue) parts.push(report.overdue + (report.overdue === 1 ? ' action is due' : ' actions are due'));
      if (report.drafted) parts.push(report.drafted + (report.drafted === 1 ? ' draft is ready for review' : ' drafts are ready for review'));
      if (report.closed) parts.push(report.closed + (report.closed === 1 ? ' conversation closed as no response' : ' conversations closed as no response'));
      if (report.cancelled) parts.push(report.cancelled + (report.cancelled === 1 ? ' queued draft was cancelled' : ' queued drafts were cancelled'));
      showToast(parts.join(', ') + '.');
    }
    Store.snapshot(db, Rules.localToday()).then(() => RecordViews.showRecovery()).catch(() => {});
    if (!Store.readOnly) purgeFiles();
    if (channelOut) channelOut.onmessage = async () => { await catchUp(); renderAll(); };
    window.addEventListener('online', async () => { await reconcile(); renderAll(); });
    document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible') { await reconcile(); renderAll(); } });
  }

  function saveSender() {
    try {
      if ($('rememberSender').checked) {
        const data = {};
        SENDER_FIELDS.forEach(f => { data[f] = $(f).value; });
        localStorage.setItem(STORE_SENDER, JSON.stringify(data));
      } else {
        localStorage.removeItem(STORE_SENDER);
      }
    } catch (e) { /* storage may be unavailable */ }
  }

  /* ---------- Backup ---------- */
  const backupNote = text => { $('backupStatus').textContent = text; };

  async function exportBackup() {
    if (Store.mode === 'failed') { backupNote('Email Kit could not open your records, so there is nothing safe to back up. Close Email Kit and open it again.'); return; }
    const sender = {};
    if ($('rememberSender').checked) SENDER_FIELDS.forEach(f => { sender[f] = $(f).value; });
    const data = { app: 'usha', schema: SCHEMA, exportedAt: new Date().toISOString(), sender };
    Engine.TABLES.forEach(t => { data[t] = Engine.rows(db, t); });
    const files = [];
    for (const r of Engine.rows(db, 'sources')) if (r.fileId) { const f = await Store.getFile(r.fileId); if (f) files.push(f); }
    data.files = files;
    const password = $('backupPassword').value;
    if (password.length < 12) { backupNote('Use a passphrase of at least 12 characters and keep it separately.'); return; }
    try {
      const name = 'email-kit-backup-' + Rules.localToday() + '.json';
      const sealed = await Backup.seal(data,password);
      if (await saveFile(name, JSON.stringify(sealed), 'application/json')) { $('backupPassword').value=''; backupNote('Protected backup saved.'); }
    } catch (error) { backupNote('Could not protect the backup. Use a browser with Web Crypto support.'); }
  }

  /* Accepts only records that pass a check. Restrictions always survive. */
  async function restoreData(data) {
    if (!data || data.app !== 'usha') { backupNote('That file is not an Email Kit backup, so nothing was restored.'); return; }
    if (Number(data.schema) > SCHEMA) { backupNote('That backup came from a newer version. Please update Email Kit first.'); return; }
    if (Number(data.schema) < 3) {
      const out = await attempt('migrateLegacy', { tracker: Array.isArray(data.tracker) ? data.tracker : [], doNotContact: Array.isArray(data.doNotContact) ? data.doNotContact : [] }, 'backup');
      if (out) backupNote('The backup is restored from the earlier version.');
    } else {
      const out = await attempt('restore', { data }, 'backup');
      if (!out) { backupNote('Nothing was restored.'); return; }
      let lost = 0;
      for (const f of Array.isArray(data.files) ? data.files : []) {
        if (!f || typeof f.id !== 'string') continue;
        try { await Store.putFile(f.id, String(f.name), String(f.type), String(f.data)); } catch (e) { lost++; }
      }
      const r = out.result;
      backupNote('The backup is restored. Email Kit added ' + r.added + ' and updated ' + r.updated + (r.added + r.updated === 1 ? ' record' : ' records') + (r.rejected ? ', and rejected ' + r.rejected + ' that failed a check.' : '.') + (lost ? ' ' + lost + ' attachments could not be stored.' : ''));
      showRestoreReport(data, lost);
    }
    const sender = data.sender && typeof data.sender === 'object' ? data.sender : {};
    if (SENDER_FIELDS.some(f => typeof sender[f] === 'string' && sender[f])) {
      SENDER_FIELDS.forEach(f => { if (!$(f).value && typeof sender[f] === 'string') $(f).value = sender[f].slice(0, 200); });
      saveSender();
    }
    await reconcile();
    $('toast').hidden = true;
    renderAll();
  }
  /* After a restore, every row in the backup is accounted for, so nothing can be
     lost silently: stored as in the backup, kept as a newer saved version (or an
     existing restriction), or not stored. Rows not stored can be downloaded. */
  function showRestoreReport(data, lostFiles) {
    const box = $('restoreReport');
    box.textContent = '';
    const missing = {};
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    ['Record type', 'In backup', 'Stored as in backup', 'Kept newer saved version', 'Not stored'].forEach(t => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = t; head.appendChild(th); });
    const body = table.createTBody();
    let notStored = 0;
    Engine.TABLES.filter(t => t !== 'meta').forEach(t => {
      const rows = Array.isArray(data[t]) ? data[t] : [];
      if (!rows.length) return;
      let same = 0, kept = 0;
      rows.forEach(row => {
        const id = row && typeof row.id === 'string' ? row.id : '';
        const now = id && db[t][id];
        if (!now) { (missing[t] = missing[t] || []).push(row); return; }
        if (JSON.stringify(now) === JSON.stringify(row)) same++; else kept++;
      });
      const gone = (missing[t] || []).length;
      notStored += gone;
      const tr = body.insertRow();
      [t, rows.length, same, kept, gone].forEach((v, i) => { const td = tr.insertCell(); td.textContent = String(v); if (i === 4 && gone) td.className = 'bad'; });
    });
    const files = Array.isArray(data.files) ? data.files.length : 0;
    const summary = document.createElement('p');
    summary.textContent = 'Restore check: ' + (notStored ? notStored + (notStored === 1 ? ' row was' : ' rows were') + ' not stored (invalid, or linked to a record that is missing).' : 'every row in the backup is now saved.') + ' Attachments: ' + (files - lostFiles) + ' of ' + files + ' stored.' + ' Keep the protected backup until you have checked the records here.';
    box.append(summary, table);
    if (notStored) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn quiet small'; btn.textContent = 'Download rows not stored';
      btn.addEventListener('click', () => saveFile('email-kit-not-restored-' + Rules.localToday() + '.json', JSON.stringify({ note: 'Rows from a backup that Email Kit did not store. Confidential client data: keep it protected and delete it when reviewed.', rows: missing }, null, 2), 'application/json'));
      box.appendChild(btn);
    }
    box.hidden = false;
  }

  async function restoreBackup(file) {
    if (!file) return;
    if (file.size > 104857600) { backupNote('That file is too large to be an Email Kit backup.'); return; }
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
    if (data && data.format === 'usha-backup-v1') {
      try { data = await Backup.open(data,$('backupPassword').value); }
      catch (error) { backupNote('Could not unlock this file. Check the passphrase and the backup.'); $('importFile').value=''; return; }
      $('backupPassword').value='';
    }
    $('importFile').value='';
    await restoreData(data);
  }

  /* ---------- Limits ---------- */
  const LIMIT_FIELDS = ['inviteHard', 'messageMin', 'messageMax', 'emailMin', 'emailMax'];
  function showLimits() { LIMIT_FIELDS.forEach(f => { $(f).value = limits[f]; }); }
  function readLimit(f) {
    const n = parseInt($(f).value, 10);
    if (Number.isFinite(n) && n > 0) limits[f] = n;
    renderCounts(); renderGate();
  }

  /* ---------- Reset ---------- */
  function resetForm() {
    const before = snapshotWork();
    blankForm(false);
    renderAll();
    resetUndo = before;
    showToast('The form is reset. Your details, client records, limits and the Do not contact list remain.', { label: 'Undo reset', run: () => {
      if (!resetUndo) return;
      const u = resetUndo; resetUndo = null;
      restoreWork(u);
      say('The reset is undone.');
      $('reset').focus();
    } });
    say('The form is reset.');
    $('messageHeading').focus();
  }

  /* ---------- Events ---------- */
  function wire() {
    $('reviewImport').addEventListener('click', reviewIntake);
    $('confirmImport').addEventListener('click', confirmIntake);
    const form = $('form');
    const OBS_GROUP = { vacancy: 'finding', expansion: 'finding', post: 'post', referral: 'referral', previous: 'previous', role: 'none' };
    const onChange = e => {
      const t = e && e.target;
      if (t && t.name === 'mode') $('scenario').value = t.value === 'first' ? 'new' : 'no-response';
      if (t && t.id && t.id.startsWith('import') && importReviewed) {
        importReviewed = false; $('confirmImport').disabled = true;
        $('importAssessment').textContent = 'Context changed. Review it again before saving.';
      }
      syncScenario();
      /* An Undo offer must not reach back over newly typed work. */
      if (t && ['recipientName','recipientContact','company','waNumber','waEvidence'].includes(t.id)) {
        $('whatsappConsent').checked = false;
        if (['recipientName','recipientContact','company'].includes(t.id)) { $('waEvidence').value = ''; $('waNumber').value = ''; }
      }
      if (t && t.id !== 'rememberSender') $('toast').hidden = true;
      if (t) {
        if (t.name === 'channel') touched.add('channel');
        else if (t.id) touched.add(t.id);
      }
      /* Each reason completes a different sentence, so old wording would not fit. */
      if (t && t.id === 'reason') {
        const reason = $('reason').value;
        if (OBS_GROUP[reason] !== OBS_GROUP[lastReason] && reason !== 'role') { $('observation').value = ''; touched.delete('observation'); }
        lastReason = reason;
      }
      syncOptions();
      if (t && t.id) autoFill(t.id);
      renderAll();
    };
    form.addEventListener('input', onChange);

    $('generate').addEventListener('click', generate);
    /* A pasted reply is kept straight away, even before it is confirmed. */
    $('responseText').addEventListener('change', () => { if (activeEntry) attempt('holdReply', { convId: activeEntry, text: $('responseText').value }); });
    $('body').addEventListener('input', () => { if (draft) draft.edited = true; growBody(); renderCounts(); renderGate(); renderNotes(); });
    /* An edited draft is saved when you leave the box, so it survives a restart. */
    $('body').addEventListener('change', saveCurrentDraft);
    $('subject').addEventListener('change', saveCurrentDraft);
    $('saveEml').addEventListener('click', () => saveFile('email-kit-draft-' + Rules.localToday() + '.eml', Rules.emailFile(readForm().recipientContact, $('subject').value, $('body').value), 'message/rfc822'));
    $('queueLater').addEventListener('click', queueLater);
    $('subject').addEventListener('input', () => { if (draft) { draft.edited = true; draft.reusedSubject = false; } renderCounts(); renderGate(); });
    $('categoryUse').addEventListener('click', () => {
      $('responseCategory').value = $('categoryUse').dataset.value;
      touched.add('responseCategory');
      syncOptions();
      renderAll();
      $('responseCategory').focus();
    });
    $('alternative').addEventListener('click', () => {
      const panel = $('altPanel');
      const open = panel.hidden;
      if (open) buildAlternatives();
      panel.hidden = !open;
      $('alternative').setAttribute('aria-expanded', String(open));
      if (open) { const b = panel.querySelector('button'); if (b) b.focus(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('altPanel').hidden) {
        $('altPanel').hidden = true;
        $('alternative').setAttribute('aria-expanded', 'false');
        $('alternative').focus();
      }
    });
    $('copyBody').addEventListener('click', () => copyInto($('copyBody'), $('body').value, 'Message copied', $('body'), draft && draft.channel === 'email'));
    $('copySubject').addEventListener('click', () => copyInto($('copySubject'), $('subject').value, 'Subject copied', $('subject')));
    $('markSent').addEventListener('click', markSent);
    $('restore').addEventListener('click', () => {
      if (!replaced) return;
      draft = replaced.draft;
      $('subjectRow').hidden = draft.channel !== 'email';
      $('body').value = replaced.body; $('subject').value = replaced.subject;
      replaced = null;
      $('restoreBox').hidden = true;
      /* The restored text is the draft now, so a restart must keep it. */
      saveCurrentDraft();
      growBody(); renderEvidence(); renderAll();
      say('Your edited draft is back.');
      $('body').focus();
    });
    $('reset').addEventListener('click', resetForm);
    $('rememberSender').addEventListener('change', saveSender);
    $('exportCsv').addEventListener('click', () => saveFile('email-kit-contacts-' + Rules.localToday() + '.csv', Rules.trackerCsv(tracker), 'text/csv'));
    $('exportBackup').addEventListener('click', exportBackup);
    $('importBackup').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', e => { restoreBackup(e.target.files[0]); e.target.value = ''; });
    SENDER_FIELDS.forEach(f => $(f).addEventListener('input', () => { if ($('rememberSender').checked) saveSender(); }));
    LIMIT_FIELDS.forEach(f => $(f).addEventListener('input', () => readLimit(f)));
    $('limitsDefault').addEventListener('click', () => { Object.assign(limits, CONFIG.limits); showLimits(); renderCounts(); renderGate(); say('The default limits are restored.'); });
    window.addEventListener('resize', () => { if (draft && !draft.noMessage) growBody(); });
  }

  /* Lets the app layer check for work in progress before an update. */
  window.EmailKitApp = {
    showToast,
    hasFormWork() {
      const s = readForm();
      const fields = ['recipientName', 'company', 'designation', 'roles', 'responseText', 'priorText', 'priorSubject', 'observation', 'referredName'];
      return !!draft || fields.some(f => s[f].trim());
    },
    hasWork() {
      const s = readForm();
      const typedSender = !$('rememberSender').checked && SENDER_FIELDS.some(f => s[f].trim());
      return this.hasFormWork() || typedSender || (ready && Store.mode === 'none' && Engine.rows(db, 'convs').length > 0);
    }
  };

  RecordViews.init({
    db: () => db, exec, attempt, undo, say, showToast, failure, saveFile, renderAll, continueEntry, prepareReferred, removeEntry, restoreData, backupNote, reconcile, startAtNewCompany,
    activeId: () => activeEntry, clearActive: () => { activeEntry = ''; }
  });

  buildStaticOptions();
  syncOptions();
  ['priorDate', 'dateChecked'].forEach(f => { $(f).max = Rules.localToday(); });
  showLimits();
  readSender();
  wire();
  renderAll();
  startRecords();
})();
