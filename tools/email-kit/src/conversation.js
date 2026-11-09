/* Conservative intake: only labelled headers and literal questions are extracted.
   The consultant verifies the resulting summary before it becomes a record. */
const Conversation = (() => {
  const clean = value => String(value || '').trim();
  function review(history, today) {
    const text = clean(history).slice(0, 30000);
    const subjects = [...text.matchAll(/^Subject:\s*(.+)$/gim)].map(x => clean(x[1]));
    const dates = [...text.matchAll(/^Date:\s*(.+)$/gim)].map(x => {
      const d = new Date(x[1]); return Number.isNaN(d.valueOf()) ? '' : d.toISOString().slice(0,10);
    }).filter(Boolean);
    const questions = (text.match(/[^\n.!?]{8,180}\?/g) || []).map(clean).slice(-3);
    const optedOut = /\b(unsubscribe|do not (email|contact|message)|stop (emailing|contacting|messaging))\b/i.test(text);
    const lastDate = dates.at(-1) || '';
    const elapsed = lastDate && today ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(lastDate)) / 86400000)) : null;
    return { subject: subjects.at(-1) || '', lastDate, questions, optedOut, elapsed,
      summary: questions.length ? 'Questions in supplied history: ' + questions.join(' ') : '',
      caveat: 'Check sender, dates, decisions, and obligations against the original messages. Unlabelled text cannot establish who said what.' };
  }
  function advise({ lastSpeaker, lastDate, outstanding, next, optedOut, scenario }, today) {
    if (optedOut) return { action: 'pause', reason: 'The history contains a possible stop request. Review and record its scope before any outreach.' };
    if (!lastSpeaker || !lastDate) return { action: 'clarify', reason: 'Confirm who sent the latest message and when it was sent.' };
    if (lastDate > today) return { action: 'clarify', reason: 'The latest message date is in the future. Correct it before continuing.' };
    if (lastSpeaker === 'client') return { action: 'reply', reason: clean(outstanding) ? 'Respond to the outstanding point before following up.' : 'Review the latest client message and decide whether a reply is needed.' };
    if (scenario === 'reconnect' && !clean(next)) return { action: 'clarify', reason: 'State why reconnecting is appropriate after the pause or closure.' };
    const days = Math.floor((Date.parse(today) - Date.parse(lastDate)) / 86400000);
    if (days < 3) return { action: 'pause', reason: 'Your latest reply was recent. Give the client time to review it.' };
    return { action: 'follow-up', reason: clean(outstanding) ? 'Check the documented outstanding point without repeating the prior discussion.' : 'Ask whether any clarification would help, and offer time to review.' };
  }
  function draft(context, form) {
    if (!context || !['reply','after-reply','no-response'].includes(form.scenario)) return null;
    const first = clean(form.recipientName).split(/\s+/)[0];
    const greeting = first ? `Hello ${first},` : 'Hello,';
    const subject = clean(context.subject || form.priorSubject);
    const topic = clean(context.objective);
    const sign = [clean(form.senderName),clean(form.senderRole),clean('Jobboard300')].filter(Boolean).join('\n');
    let lines;
    if (context.lastSpeaker === 'client' && form.scenario === 'reply') {
      if (!clean(form.contextAnswer)) return null;
      lines = [`Thank you for your message about ${topic}.`,clean(form.contextAnswer),"Please let me know if you would like to discuss this further."];
    } else if (context.lastSpeaker === 'consultant') {
      lines = [`I’m following up on our conversation about ${topic}.`,
        clean(context.outstanding) ? `I wanted to check on ${clean(context.outstanding).replace(/[.!?]+$/,'')}.` : "If any further detail would help, I’m happy to clarify.",
        "Please take the time you need to review it. If now is not suitable, I can reconnect at a better time."];
    } else return null;
    return {subject:subject ? (/^re:/i.test(subject) ? subject : `Re: ${subject}`) : topic,
      body:[greeting,'',...lines,'',"Kind regards,",sign].join('\n')};
  }
  return { review, advise, draft };
})();
