/* ==========================================================================
   MESSAGE LIBRARY. Update message wording here.

   SLOTS holds sentences. Each slot lists versions in order of preference.
   The first version whose {variables} all have values is used, so optional
   details drop out by choosing a cleaner sentence, never by leaving a gap.
   If no version qualifies, the sentence is left out.

   FAMILIES and FOLLOW_UPS hold complete message structures. Each structure is
   a list of paragraphs. A paragraph is a list of slots, or a { head, items }
   object that renders as a short list. "tiers" are the approved shorter
   versions, tried in order until the message fits.

   Writing rules for this file: active voice, complete sentences, no idioms,
   no pressure, no assumptions about how the recipient feels. Keep paragraphs
   short, and use bullets for lists of services, terms or answers.
   ========================================================================== */
const B = CONFIG.bullet;
const SCOPE = 'We support permanent, non-IT white-collar hiring across India';
const SECTOR = ' for {sector} employers';
/* The same sentence for every channel, with or without the date. */
const sentOn = (verb, tail) => [verb + ' on {priorDate}' + tail, verb + ' earlier' + tail];

const SLOTS = {
  greetInline: ['{greeting}'],
  thanksConnect: ['Thank you for accepting my connection request.'],

  hook: {
    vacancy: ['I saw that {company} {obs}.'],
    expansion: ['I read that {company} {obs}.'],
    postRecipient: ['I read your {postWhere} about {obs}.'],
    postCompany: ['I read {companyPoss} {postWhere} about {obs}.'],
    referral: ['{referrer} suggested that I contact you about {obs}.', '{referrer} suggested that I contact you.'],
    previous: ['It was good to speak with you {when} about {obs}.', 'It was good to speak with you about {obs}.']
  },
  hookAfter: {
    vacancy: ['I am asking because I saw that {company} {obs}.'],
    expansion: ['I am asking because I read that {company} {obs}.'],
    postRecipient: ['I am asking because I read your {postWhere} about {obs}.'],
    postCompany: ['I am asking because I read {companyPoss} {postWhere} about {obs}.'],
    referral: ['{referrer} suggested that I contact you about {obs}.', '{referrer} suggested that I contact you.'],
    previous: ['I am writing after our conversation {when} about {obs}.', 'I am writing after our conversation about {obs}.']
  },
  /* Connection notes share the hook above, without the place of the conversation. */
  hookFormer: ['I wrote to you about {obs} {when}.'],
  hookNoteShort: {
    referral: ['{referrer} suggested that I contact you.'],
    previous: ['It was good to speak with you.']
  },

  /* An exact quotation stays word for word, and a source link is labelled. */
  sourceBlock: ['> "{sourceQuote}"\nSource: {sourceLine}', 'Source: {sourceLine}'],

  intro: {
    email: ['I am {senderName}, {senderRole} at {firm}, {firmDescriptor}.'],
    message: ['I am {senderName} from {firm}, {firmDescriptor}.']
  },
  introShort: ['I am {senderName} from {firm}.'],
  introNameShort: ['My name is {senderName}, and I work at {firm}.'],
  introName: {
    email: ['My name is {senderName}, and I am {senderRole} at {firm}, {firmDescriptor}.'],
    message: ['My name is {senderName}, and I work at {firm}, {firmDescriptor}.']
  },

  roleReason: {
    decision: ['I am writing to you in your role as {designation} at {company}.', 'I am writing to introduce our firm to {company}.'],
    recruiter: ['I am writing to you in your role as {designation} at {company} about recruitment partnerships.', 'I am writing to you about recruitment partnerships at {company}.'],
    vendor: ['I am writing about recruitment partner empanelment at {company}.'],
    influencer: ['I am writing to you in your role as {designation} at {company}.', 'I am writing to introduce our firm to {company}.'],
    unknown: ['I am writing to introduce our firm to {company}.']
  },

  offerHead: ['About our firm:'],
  scope: [
    SCOPE + SECTOR + ', including {rolesPhrase} {inLoc}.',
    SCOPE + SECTOR + ', including {rolesPhrase}.',
    SCOPE + ', including {rolesPhrase} {inLoc}.',
    SCOPE + ', including {rolesPhrase}.',
    SCOPE + SECTOR + ', including {inLoc}.',
    SCOPE + SECTOR + '.',
    SCOPE + ', including {inLoc}.',
    SCOPE + '.'
  ],
  scopeBase: [SCOPE + SECTOR + '.', SCOPE + '.'],

  /* Used only when the recipient's sector is not one of the named sectors. */
  clients: ['Our clients include {clients}.'],
  clientsShort: ['Our clients include {clientsShort}.'],
  /* Added to an email only when it would otherwise fall below the word target. */
  moreLine: ['I can share more about how we work if that would help.'],


  terms: ['Our commercial terms are:\n{termsLines}'],
  termsBlock: ['These are our terms for permanent, non-IT white-collar roles:\n{termsLines}'],
  termsProse: ['{termsSentence}'],

  /* Hedged on purpose. A vacancy does not prove a company wants an agency,
     and an expansion does not prove it is hiring. */
  bridgeShort: {
    vacancy: ['We can shortlist candidates for {vacancyRef}.'],
    post: ['We can shortlist candidates for {rolesPhrase}.']
  },
  bridge: {
    influencer: ['I understand that this may not be your responsibility.'],
    unknown: ['I understand that you may not be the right person for this.'],
    vacancyVendor: ['I understand that new partners may need to complete your empanelment process first.'],
    vacancy: ['If it would help, we can shortlist candidates for {vacancyRef} and for upcoming requirements.'],
    post: ['If it would help, we can shortlist candidates for {rolesPhrase} and for upcoming requirements.'],
    expansion: ['If your expansion creates new permanent roles, we may be able to help.']
  },

  cta: {
    decision: {
      fit: ['Does {company} work with external recruitment partners for {rolesRef}?'],
      call: ['Could you suggest a convenient time for a short call about how we can help {company}?'],
      requirement: ['If {company} uses external partners for {rolesRef}, could you share the requirement with me?'],
      details: ['May I send you details of how we work?']
    },
    recruiter: {
      fit: ['Do you work with external recruitment partners on {rolesRef}, or does a colleague manage them?'],
      direction: ['Could you tell me who manages recruitment partners at {company}?'],
      requirement: ['If your team uses external partners for {rolesRef}, could you share the requirement with me?']
    },
    vendor: {
      empanel: ['Could you tell me how {company} assesses recruitment partners for empanelment?'],
      call: ['Could we speak briefly about your empanelment process?'],
      details: ['May I send you the details you need to assess us for empanelment?']
    },
    influencer: { direction: ['Could you direct me to the colleague at {company} who handles recruitment partners?'] },
    unknown: { direction: ['Could you tell me who handles recruitment partnerships at {company}?'] }
  },
  closeEasy: {
    any: ['A short reply will be enough.'],
    empanel: ['A link or a short note about the process will be enough.'],
    direction: ['A name or a department will be enough.']
  },

  /* Tells a cold contact how to stop further messages. */
  optOutLine: ['If you prefer not to hear from me, please tell me and I will not write again.'],

  /* Follow-ups with no response. These refer only to the earlier message on
     record, and they stop after the final reminder. */
  followOpen: {
    email: sentOn('I emailed you', ' about {priorTopic}.'),
    message: sentOn('I sent you a LinkedIn message', ' about {priorTopic}.'),
    invite: sentOn('I sent you a LinkedIn connection request', ' about {priorTopic}.'),
    whatsapp: sentOn('I sent you a WhatsApp message', ' about {priorTopic}.')
  },
  followOpenShort: {
    email: sentOn('I emailed you', '.'),
    message: sentOn('I sent you a LinkedIn message', '.'),
    invite: sentOn('I sent you a connection request', '.'),
    whatsapp: sentOn('I sent you a WhatsApp message', '.')
  },
  followWhy: ['I am writing again in case it did not reach you.'],
  followNew: {
    vacancy: ['I am writing again because I saw that {company} {obs}.'],
    expansion: ['I am writing again because I read that {company} {obs}.'],
    postRecipient: ['I am writing again because I read your {postWhere} about {obs}.'],
    postCompany: ['I am writing again because I read {companyPoss} {postWhere} about {obs}.']
  },
  askDirection: ['If someone else handles recruitment partners at {company}, could you tell me who that is?'],
  finalLine: ['This will be my last message on this subject, because I do not want to take up more of your time.'],

  /* The contact you agreed in an earlier reply. */
  checkInLine: ['As agreed, I am contacting you again about {priorTopic}.'],
  checkInAsk: ['Would this be a suitable time to discuss your hiring needs?'],
  promiseLine: ['As promised, I am following up. I said that I would {promise}.', 'I am following up on what we agreed: {promiseOther}.'],
  promiseClose: { mine: ['Please let me know if you would like any further detail.'], theirs: ['Please let me know how this is progressing.'] },
  owedLine: ['As promised, I am replying to your question.'],
  /* Blocks copying until replaced, because only you know the answer. */
  owedBlank: ['[Add your answer here.]'],
  nudgeLine: ['I am writing to ask whether you would like to continue.'],
  holdingLine: ['I want to give you an accurate answer to your question, so I will reply separately once I have the details.'],

  /* Replies to a response the user has confirmed. */
  thanksInterest: ['Thank you for getting back to me.'],
  thanksReply: ['Thank you for your reply.'],
  answers: ['{answers}'],
  nextCall: ['Would a short call suit you? If so, please suggest a day and time that work for you.'],
  nextRequirement: ['Could you share the role, the location and the experience you need?'],
  furtherDetail: ['Please let me know if you would like any further detail.'],
  agreedLine: ['{agreedSentence}'],

  /* Confirmed details the conversation already holds, so they are not asked again. */
  notedBlock: ['I have noted the following:\n{noted}'],

  commThanks: ['Thank you for asking about our commercial terms.'],
  commCta: {
    call: ['Would a short call to go through these terms be useful?'],
    requirement: ['If these terms suit you, could you share the role and location details?']
  },

  thanksReferral: ['Thank you for directing me to {referredName}.'],
  referralPlan: {
    yes: ['I will contact them directly and mention that you suggested it.'],
    no: ['I will contact them directly and will not mention your name.'],
    unclear: ['I plan to contact them directly. May I mention that you suggested it?']
  },

  thanksWrong: ['Thank you for clarifying that someone else handles recruitment partnerships.'],
  directionOptional: ['If you know who handles recruitment partners at {company}, I would be grateful for their name, but please do not feel obliged to reply.'],
  closeNoFurther: ['I will not contact you again about this.'],

  thanksNoRequirement: ['Thank you for letting me know that you have no current requirement.'],
  thanksAgency: ['Thank you for letting me know that you already work with another agency. I respect that arrangement.'],
  thanksDecline: ['Thank you for letting me know.'],
  askLater: ['Would it be all right if I contacted you again in a few months?'],
  laterWelcome: {
    noResponse: ['If recruitment support becomes useful in future, you are welcome to contact me.'],
    noRequirement: ['If your hiring needs change, you are welcome to contact me.'],
    otherAgency: ['If you need additional recruitment support in future, you are welcome to contact me.'],
    notInterested: ['If your plans change in future, you are welcome to contact me.']
  },
  optOutAck: ['{optOutAck}'],
  /* A channel request is narrower, so the promise must be narrower too. */
  optOutChannelAck: ['Thank you for letting me know. We will respect your preference and will not use {optOutChannels} to contact you again.'],

  /* Postponement, meetings and a change of employer. */
  thanksPostpone: ['Thank you for letting me know that you would prefer to speak later.'],
  askDate: ['Could you suggest a date that would suit you for me to contact you again?'],
  thanksMeeting: ['Thank you for your reply.'],
  meetingConfirm: ['I confirm our {meetMode} on {meetDate} at {meetTime} {meetZone}.'],
  meetingChange: ['I have changed our {meetMode} to {meetDate} at {meetTime} {meetZone}.'],
  meetingCancel: ['I have cancelled our {meetMode} on {meetDate}. Please let me know if you would like to arrange another time.', 'I have cancelled our {meetMode}. Please let me know if you would like to arrange another time.'],
  meetingTopic: ['We can use the time to discuss {priorTopic}.'],
  meetingAsk: ['Could you confirm the {meetMissing} for our {meetMode}?'],
  thanksHeld: ['Thank you for speaking with me on {meetDate}.', 'Thank you for speaking with me.'],
  thanksMoved: ['Thank you for letting me know about your move to {movedTo}.', 'Thank you for letting me know about your move.'],
  askMoved: { known: ['Could you confirm your new role, so that I can update my records?'], unknown: ['Could you confirm your new company and role, so that I can update my records?'] },
  askMovedDone: ['I will update my records.'],
  clarifyLine: ['I want to be sure that I understand you correctly. Could you tell me how you would like to proceed?'],

  /* Connection notes. Commercial terms are never available here. */
  whoA: ['{firm} recruits for permanent, non-IT roles across India.'],
  whoB: ['{firm} recruits for permanent, non-IT roles.'],
  askA: {
    decision: ['I would like to connect about recruitment support for {company}.'],
    recruiter: ['I would like to connect about recruitment partnerships.'],
    vendor: ['I would like to connect about empanelment.'],
    influencer: ['May I connect and ask who handles recruitment partners?'],
    unknown: ['May I connect and ask who handles recruitment partnerships at {company}?']
  },
  askB: {
    decision: ['May we connect?'],
    recruiter: ['May we connect?'],
    vendor: ['May we connect about empanelment?'],
    influencer: ['May I ask who handles recruitment partners?'],
    unknown: ['May I ask who handles recruitment partners?']
  },
  connectHere: ['I would like to connect here as well.']
};

/* Subject lines, in order of preference. The first that has all its values
   and fits the subject target is used. An email follow-up to an earlier email
   always reuses the earlier subject, so these lists apply only when there is
   no earlier email subject to reuse. */
const SUBJECTS = {
  followup: ['Recruitment support for {company}', 'Recruitment support'],
  commercial: ['{firm} commercial terms'],
  vendor: ['Empanelment enquiry from {firm}'],
  direction: ['Recruitment partnerships at {company}', 'Recruitment partnerships enquiry'],
  referral: ['{referrer} suggested that I contact you', 'Introduction from {firm}'],
  previous: ['Our conversation about {obs}', 'Our recent conversation'],
  vacancy: ['{roleOne} hiring at {company}', 'Recruitment support for {company}', 'Recruitment support enquiry'],
  expansion: ['Recruitment support for {companyPoss} expansion', 'Recruitment support for {company}', 'Recruitment support enquiry'],
  post: ['Your post about {obs}', 'Recruitment support for {company}', 'Recruitment support enquiry'],
  postCompany: ['{companyPoss} post about {obs}', 'Recruitment support for {company}', 'Recruitment support enquiry'],
  role: ['Permanent hiring support for {company}', 'Permanent non-IT hiring support']
};

/* Each tier removes the least useful detail first. The client names stay
   longest, because they are the strongest proof in a first email. */
const LEAN = { swap: { scope: 'scopeBase' } };
const BRIEF = { swap: { scope: 'scopeBase', bridge: 'bridgeShort' } };
const EMAIL_TIERS = [{}, LEAN, BRIEF, Object.assign({ drop: ['screening'] }, LEAN), Object.assign({ drop: ['screening', 'bridge'] }, LEAN), Object.assign({ drop: ['screening', 'bridge', 'sectorsLine'] }, LEAN)];
const SHORT_NAMES = { scope: 'scopeBase', intro: 'introShort', introName: 'introNameShort' };
const MESSAGE_TIERS = [{}, LEAN, { swap: SHORT_NAMES }, { drop: ['clientsShort'], swap: SHORT_NAMES }];
const OFFER = { head: 'offerHead', items: ['scope', 'sectorsLine', 'screening', 'clients'] };

/* Structures. "needs" limits when a structure may be offered. */
const FIRST_EMAIL = [
  { id: 'evidence', label: 'Introduction with your evidence', difference: 'This version opens with your confirmed reason for writing, then says how the firm can help.', needs: 'evidence',
    paras: [['hook', 'intro'], ['sourceBlock'], OFFER, ['terms'], ['bridge', 'cta'], ['optOutLine']], tiers: EMAIL_TIERS },
  { id: 'role', label: 'Role-based introduction', difference: 'This version introduces the firm and connects it to the recipient\'s role, with no hiring signal.', needs: 'none',
    paras: [['introName', 'roleReason'], OFFER, ['terms'], ['bridge', 'cta'], ['optOutLine']], tiers: EMAIL_TIERS },
  { id: 'short', label: 'Short introduction', difference: 'This version leaves out the list of services and clients, so it reads quickly.', needs: 'any',
    paras: [['hook', 'intro', 'roleOnly'], ['sourceBlock'], ['scopeBase'], ['terms'], ['bridge', 'cta'], ['optOutLine']], tiers: [{}, { drop: ['bridge'] }] },
  { id: 'question', label: 'Start with the question', difference: 'This version opens with the routing question and leaves client lists for a later exchange.', needs: 'any',
    paras: [['ctaFirst'], ['hookAfter', 'intro'], ['sourceBlock'], ['scopeBase'], ['terms'], ['optOutLine']], tiers: [{}] }
];

const FIRST_MESSAGE = [
  { id: 'evidence', label: 'Introduction with your evidence', difference: 'This version opens with your confirmed reason for writing, then introduces the firm.', needs: 'evidence',
    paras: [['hook', 'intro'], ['scope', 'clientsShort'], ['terms'], ['cta'], ['optOutLine']], tiers: MESSAGE_TIERS },
  { id: 'role', label: 'Role-based introduction', difference: 'This version introduces the firm and connects it to the recipient\'s role, with no hiring signal.', needs: 'none',
    paras: [['introName', 'roleReason'], ['scope', 'clientsShort'], ['terms'], ['cta'], ['optOutLine']], tiers: MESSAGE_TIERS },
  { id: 'question', label: 'Short question', difference: 'This version asks the question first and leaves out the services and clients, so it reads well on a phone.', needs: 'any',
    paras: [['ctaFirst'], ['hookAfter', 'introShort'], ['terms'], ['optOutLine']], tiers: [{}] }
];

const thanked = list => list.map(a => Object.assign({}, a, { paras: [['thanksConnect'].concat(a.paras[0])].concat(a.paras.slice(1)) }));

/* A polite ending shared by "no current requirement" and "another agency".
   Only the opening thanks differs. */
const closingSet = thanks => [
  { id: 'laterAgreed', label: 'Confirm the agreed date', difference: 'This version confirms the next contact you agreed.', needs: 'agreed',
    paras: [[thanks], ['agreedLine']], tiers: [{}] },
  { id: 'leaveOpen', label: 'Leave the next contact to them', difference: 'This version thanks them and invites them to contact you if things change.', needs: 'noAgreed',
    paras: [[thanks], ['laterWelcome']], tiers: [{}] },
  { id: 'askLater', label: 'Ask about later contact', difference: 'This version asks whether you may contact them again in a few months.', needs: 'noAgreed',
    paras: [[thanks], ['askLater']], tiers: [{}] }
];

/* Replies and reminders share one structure on email and LinkedIn messages. */
const FOLLOW_UPS = {
  reminder: [
    { id: 'reminderNew', label: 'Reminder with a new reason', difference: 'This version refers to the earlier message and adds your confirmed observation.', needs: 'observation',
      paras: [['followOpen', 'followNew'], ['scopeNew', 'bridge'], ['cta']], tiers: [{}, { drop: ['bridge'] }] },
    { id: 'reminder', label: 'Brief reminder', difference: 'This version restates the request in a few lines.', needs: 'any',
      paras: [['followOpen', 'followWhy'], ['scopeNew'], ['cta']], tiers: [{}] },
    { id: 'reminderDirection', label: 'Ask who handles this', difference: 'This version asks for the right person, in case the recipient is not responsible for this.', needs: 'notDirection',
      paras: [['followOpen', 'followWhy'], ['scopeNew'], ['askDirection']], tiers: [{}] }
  ],
  final: [
    { id: 'finalReminder', label: 'Final reminder', difference: 'This version says it is the last message and asks for nothing.', needs: 'any',
      paras: [['followOpen', 'finalLine'], ['laterWelcome']], tiers: [{}] }
  ],
  nudge: [
    { id: 'nudge', label: 'Short check after your reply', difference: 'This version refers to your last reply and asks whether they would like to continue.', needs: 'any',
      paras: [['followOpen', 'nudgeLine']], tiers: [{}] }
  ],
  checkIn: [
    { id: 'checkIn', label: 'Agreed check-in', difference: 'This version makes the contact you agreed and asks one question.', needs: 'any',
      paras: [['checkInLine'], ['checkInAsk']], tiers: [{}] }
  ],
  promise: [
    { id: 'promise', label: 'Keep what you promised', difference: 'This version delivers the commitment on record. Add the details before sending.', needs: 'any',
      paras: [['promiseLine'], ['promiseCloseLine']], tiers: [{}] }
  ],
  askDate: [
    { id: 'askDateAgain', label: 'Ask again for a date', difference: 'This version asks for a date, because none is agreed.', needs: 'any',
      paras: [['followOpen', 'askDate']], tiers: [{}] }
  ],
  meetingChase: [
    { id: 'meetingChase', label: 'Ask once more for the details', difference: 'This version asks once more for what is still unclear.', needs: 'any',
      paras: [['followOpen', 'meetingAsk']], tiers: [{}] }
  ],
  interested: [
    { id: 'agreed', label: 'Confirm what you agreed', difference: 'This version confirms the next step you recorded.', needs: 'agreed',
      paras: [['thanksInterest'], ['answers'], ['notedBlock'], ['terms'], ['agreedLine']], tiers: [{}] },
    { id: 'call', label: 'Suggest a short call', difference: 'This version suggests a short call as the next step.', needs: 'noAgreed',
      paras: [['thanksInterest'], ['answers'], ['notedBlock'], ['terms'], ['nextCall']], tiers: [{}] },
    { id: 'requirement', label: 'Ask for the requirement', difference: 'This version asks for the role details as the next step.', needs: 'requirementOpen',
      paras: [['thanksInterest'], ['answers'], ['notedBlock'], ['terms'], ['nextRequirement']], tiers: [{}] }
  ],
  moreInfo: [
    { id: 'holding', label: 'Holding reply', difference: 'This version thanks them and says you will answer separately, because Usha has no verified answer.', needs: 'firstHolding',
      paras: [['thanksReply', 'holdingLine'], ['terms'], ['agreedLine']], tiers: [{}] },
    { id: 'owedManual', label: 'Send the answer you promised', difference: 'This version keeps your promise. Add the answer, because Usha has no verified one.', needs: 'owedOpen',
      paras: [['owedLine'], ['owedBlank'], ['terms'], ['furtherDetail']], tiers: [{}] },
    { id: 'answerAgreed', label: 'Answer and confirm what you agreed', difference: 'This version answers the question and confirms the next step you recorded.', needs: 'answersAgreed',
      paras: [['openAnswer'], ['answers'], ['terms'], ['agreedLine']], tiers: [{}] },
    { id: 'answerCall', label: 'Answer and suggest a call', difference: 'This version answers the question and suggests a short call.', needs: 'answersOnly',
      paras: [['openAnswer'], ['answers'], ['terms'], ['nextCall']], tiers: [{}] },
    { id: 'answerOnly', label: 'Answer only', difference: 'This version answers the question and asks for nothing.', needs: 'answersOnly',
      paras: [['openAnswer'], ['answers'], ['terms'], ['furtherDetail']], tiers: [{}] }
  ],
  commercial: [
    { id: 'termsList', label: 'Terms as a list', difference: 'This version sets out the fee, payment and replacement terms in bullet points.', needs: 'any', channels: ['email'],
      paras: [['commThanks'], ['answers'], ['termsBlock'], ['commAgreed']], tiers: [{}] },
    { id: 'termsProse', label: 'Terms in a short paragraph', difference: 'This version gives the terms in one paragraph, which suits a chat message.', needs: 'any', channels: ['message', 'whatsapp'],
      paras: [['commThanks', 'termsProse'], ['answers'], ['commAgreed']], tiers: [{}] },

  ],
  postponed: [
    { id: 'postponeAgreed', label: 'Confirm the later date', difference: 'This version confirms the date you recorded.', needs: 'agreed',
      paras: [['thanksPostpone'], ['agreedLine']], tiers: [{}] },
    { id: 'postponeAsk', label: 'Ask for a suitable date', difference: 'This version asks them for a date, because none is on record.', needs: 'noAgreed',
      paras: [['thanksPostpone'], ['askDate']], tiers: [{}] }
  ],
  meeting: [
    { id: 'meetingReply', label: 'Meeting reply', difference: 'This version confirms, changes or cancels the meeting you recorded.', needs: 'meetingClear',
      paras: [['thanksMeeting'], ['meetingLine'], ['answers'], ['terms'], ['meetingTopicLine']], tiers: [{}] },
    { id: 'meetingClarify', label: 'Ask for the missing details', difference: 'This version asks for the details that are not clear, so Usha does not guess them.', needs: 'meetingUnclear',
      paras: [['thanksMeeting'], ['answers'], ['terms'], ['meetingAsk']], tiers: [{}] }
  ],
  meetingHeld: [
    { id: 'heldNotes', label: 'Follow up on the meeting', difference: 'This version thanks them and repeats only what you confirmed.', needs: 'any',
      paras: [['thanksHeld'], ['notedBlock'], ['heldNext']], tiers: [{}] }
  ],
  referred: [
    { id: 'referralThanks', label: 'Thank them', difference: 'This version thanks them and says how you will use their name.', needs: 'any',
      paras: [['thanksReferral'], ['referralPlan']], tiers: [{}] }
  ],
  wrongContact: [
    { id: 'wrongDirection', label: 'Thank them and leave direction optional', difference: 'This version invites a name but says they need not reply.', needs: 'any',
      paras: [['thanksWrong'], ['directionOptional']], tiers: [{}] },
    { id: 'wrongClose', label: 'Thank them and close', difference: 'This version thanks them and asks for nothing.', needs: 'any',
      paras: [['thanksWrong', 'closeNoFurther']], tiers: [{}] }
  ],
  changedEmployer: [
    { id: 'movedVerify', label: 'Ask them to confirm the move', difference: 'This version stops the old conversation and asks them to confirm the new company and role.', needs: 'any',
      paras: [['thanksMoved'], ['askMoved']], tiers: [{}] }
  ],
  noRequirement: closingSet('thanksNoRequirement'),
  otherAgency: closingSet('thanksAgency'),
  notInterested: [
    { id: 'closeOpen', label: 'Polite close', difference: 'This version closes politely and says they are welcome to contact you.', needs: 'any',
      paras: [['thanksDecline', 'closeNoFurther'], ['laterWelcome']], tiers: [{}] }
  ],
  unclear: [
    { id: 'clarify', label: 'Ask what they would like to do', difference: 'This version asks one question, because the reply could not be read safely.', needs: 'any',
      paras: [['thanksReply'], ['clarifyLine']], tiers: [{}] }
  ],
  optOut: [
    { id: 'optOutAck', label: 'Short acknowledgement', difference: 'This version acknowledges their request. Send it by hand only if it is appropriate.', needs: 'any',
      paras: [['optOutAckLine']], tiers: [{}] }
  ]
};

const NOTE_SHORT = { whoA: 'whoB', askA: 'askB' };

const FAMILIES = {
  email: { first: FIRST_EMAIL },
  message: { first: FIRST_MESSAGE, accepted: thanked(FIRST_MESSAGE) },
  whatsapp: { first: FIRST_MESSAGE },

  /* Connection notes run as one paragraph. Later tiers are the approved
     shorter versions. A tier marked dropsEvidence tells the user what went. */
  invite: {
    first: [
      { id: 'noteEvidence', label: 'Note with your evidence', difference: 'This version mentions your confirmed observation in one line.', needs: 'observation',
        paras: [['greetInline', 'hook', 'whoA', 'askA']],
        tiers: [{}, { swap: { askA: 'askB' } }, { swap: NOTE_SHORT },
          { swap: NOTE_SHORT, drop: ['greetInline'] },
          { drop: ['hook'], dropsEvidence: true },
          { swap: NOTE_SHORT, drop: ['hook'], dropsEvidence: true },
          { swap: NOTE_SHORT, drop: ['hook', 'greetInline'], dropsEvidence: true }] },
      { id: 'noteRelation', label: 'Note that starts with your connection', difference: 'This version leads with the referrer or your earlier conversation.', needs: 'relation',
        paras: [['greetInline', 'hook', 'whoA', 'askA']],
        tiers: [{}, { swap: { askA: 'askB' } }, { swap: NOTE_SHORT },
          { swap: Object.assign({}, NOTE_SHORT, { hook: 'hookNoteShort' }) },
          { swap: Object.assign({}, NOTE_SHORT, { hook: 'hookNoteShort' }), drop: ['greetInline'] }] },
      { id: 'noteRole', label: 'Role-based note', difference: 'This version says what the firm does and asks to connect.', needs: 'none',
        paras: [['greetInline', 'whoA', 'askA']],
        tiers: [{}, { swap: { askA: 'askB' } }, { swap: NOTE_SHORT }, { swap: NOTE_SHORT, drop: ['greetInline'] }] }
    ],
    followup: [
      { id: 'noteFollow', label: 'Connection request after an earlier message', difference: 'This version refers to the earlier message and asks to connect.', needs: 'any',
        paras: [['greetInline', 'followOpen', 'whoB', 'connectHere']],
        tiers: [{}, { swap: { followOpen: 'followOpenShort' } }, { swap: { followOpen: 'followOpenShort' }, drop: ['greetInline'] }] }
    ]
  }
};
