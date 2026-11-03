/* ==========================================================================
   COMPANY DATA AND OPTIONS FOR USHA. Update business facts here.
   Nothing in this block touches the interface.
   ========================================================================== */
const CONFIG = {
  /* The list marker used in messages. It pastes cleanly into email and LinkedIn. */
  bullet: '\u2022 ',

  firm: { name: 'Job Point Consultancy', descriptor: 'a recruitment consultancy', country: 'India' },
  clients: [],
  clientCores: {},
  commercial: {lines: [], sentence: ''},
  profileVersion: '',
  /* Drafting defaults taken from the supplied brief. They are not verified
     statements of current platform limits. Users can change them on screen. */
  limits: {
    inviteHard: 200,
    messageMin: 250,
    messageMax: 450,
    emailMin: 90,
    emailMax: 140
  },
  subjectTarget: 60,
  /* A quotation longer than this is left out, because a summary serves better. */
  quoteWordLimit: 30,
  evidenceStaleDays: 30,

  channels: [
    { id: 'email', label: 'Email', short: 'Email' },
    { id: 'invite', label: 'LinkedIn connection note', short: 'LinkedIn note' },
    { id: 'message', label: 'LinkedIn message', short: 'LinkedIn message' },
    { id: 'whatsapp', label: 'WhatsApp message', short: 'WhatsApp' }
  ],

  /* Follow-up timing in working days. Users can change these under Follow-up
     rules. The defaults apply until they do. */
  cadence: { firstReminder: 3, finalReminder: 4, afterReply: 3 },
  weekendDays: [0, 6],
  timeZone: 'Asia/Kolkata',

  /* Added to a 10-digit mobile number when opening WhatsApp. */
  defaultCountryCode: '91',

  stages: [
    { id: 'first', label: 'First contact' },
    { id: 'accepted', label: 'First message after a connection request was accepted' },
    { id: 'followup', label: 'Follow-up' }
  ],

  /* A message may be followed by this many reminders and no more. */
  maxReminders: 2,

  priorTypes: [
    { id: 'first', label: 'My first message' },
    { id: 'reminder', label: 'A reminder' },
    { id: 'final', label: 'A final reminder' },
    { id: 'reply', label: 'A reply to their message' },
    { id: 'agreed', label: 'A reply that agreed a later contact' },
    { id: 'closed', label: 'A closing reply' }
  ],

  /* The next step shown to the user for each confirmed response. */
  responses: [
    { id: 'noResponse', label: 'No response', next: 'Send one brief reminder that adds no pressure.' },
    { id: 'interested', label: 'Interested', next: 'Thank them and suggest one practical next step.' },
    { id: 'moreInfo', label: 'Requests more information', next: 'Answer their question with verified details.' },
    { id: 'commercial', label: 'Requests commercial terms', next: 'Answer with the fee, payment and replacement terms.' },
    { id: 'postponed', label: 'Asks me to contact them later', next: 'Confirm the later date. Email Kit pauses reminders until then.' },
    { id: 'meeting', label: 'Proposes, confirms or changes a meeting', next: 'Record the details. A meeting counts as confirmed only when the date, time and time zone are all agreed.' },
    { id: 'meetingHeld', label: 'We held the meeting', next: 'Thank them and repeat only what you confirmed.' },
    { id: 'referred', label: 'Refers us to another person', next: 'Thank them, and mention their name to the new contact only with clear permission.' },
    { id: 'wrongContact', label: 'Not the right contact', next: 'Thank them and make any request for direction optional.' },
    { id: 'changedEmployer', label: 'Has moved to another company', next: 'Stop messages based on the old role and ask them to confirm the new company.' },
    { id: 'noRequirement', label: 'No current requirement', next: 'Respect their position and leave the next contact to them, unless you agreed a date.' },
    { id: 'otherAgency', label: 'Already works with another agency', next: 'Respect the arrangement and leave the next contact to them, unless you agreed a date.' },
    { id: 'notInterested', label: 'Not interested', next: 'Close politely and do not try to change their decision.' },
    { id: 'optOut', label: 'Explicitly asks for no further contact', next: 'Mark the prospect as Do not contact. You may send the short acknowledgement by hand.' },
    { id: 'deliveryFailure', label: 'The message did not reach them', next: 'Send nothing. Correct the address or number, then decide whether to try again.' },
    { id: 'unclear', label: 'Unclear, so I need to review it', next: 'Email Kit has saved the reply. Ask one question, or choose the right category.' }
  ],

  /* Which restriction an opt-out creates. "review" pauses all outreach to the
     contact until someone decides, because guessing wrong would be worse. */
  optOutScopes: [
    { id: 'all', label: 'No contact with this person on any channel' },
    { id: 'channel', label: 'Only the channels ticked below' },
    { id: 'organisation', label: 'No contact with anyone at this company' },
    { id: 'review', label: 'Not clear, so pause everything until I review it' }
  ],
  restrictChannels: [
    { id: 'email', label: 'Email' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'phone', label: 'Phone calls' }
  ],

  /* Time zones offered for a meeting, and the abbreviations Email Kit can read. */
  zones: [
    { id: 'Asia/Kolkata', label: 'IST, India' },
    { id: 'Asia/Dubai', label: 'GST, Gulf' },
    { id: 'Asia/Singapore', label: 'SGT, Singapore' },
    { id: 'Europe/London', label: 'UK time' },
    { id: 'UTC', label: 'UTC' }
  ],
  zoneWords: { IST: 'Asia/Kolkata', GST: 'Asia/Dubai', SGT: 'Asia/Singapore', GMT: 'UTC', UTC: 'UTC', BST: 'Europe/London' },

  /* Follow-up pacing, shown in Follow-up rules. */
  closeAfterFinal: 5,

  /* Short acknowledgement for an explicit opt-out. Sent by hand only. */
  optOutAck: "Thank you for letting me know. We'll respect your preference and won't contact you again.",

  /* Verified answers to common questions. Only these can appear in a reply. */
  answers: {
    services: '',
    sectors: '',
    clients: 'Our clients include {clients}.',
    locations: 'We support permanent, non-IT white-collar hiring across India.',
    exclusions: 'We do not offer IT staffing, temporary manpower or blue-collar recruitment.'
  },
  askTopics: [
    { id: 'services', label: 'Services and process' },
    { id: 'sectors', label: 'Sectors' },
    { id: 'clients', label: 'Clients' },
    { id: 'locations', label: 'Locations' },
    { id: 'exclusions', label: 'What we do not cover' }
  ],

  /* Keyword suggestions for pasted responses. Users always confirm the result.
     Rules run in order and the first match wins. */
  responseRules: [
    { id: 'optOut', test: /\b(?:refrain from|avoid|quit) (?:contacting|messaging|emailing|calling|writing to)\b|\b(?:do not|don't|dont) (?:reach out|send (?:me|us) (?:any |further |more )?(?:messages|emails))\b|\b(do not|don'?t|dont|never|stop) (contact|email|e-mail|mail|message|whatsapp|call|write)(ing)?\b|\bremove (me|us)\b|\bunsubscribe\b|\bno (further|more) (contact|communication|emails?|messages?|calls?)\b|\b(stop|cease) (all )?(contact|emails?|messages?)\b|\btake (me|us) off\b|\bleave me alone\b|^\s*(please\s+)?stop[.!]?\s*$/i },
    { id: 'deliveryFailure', test: /\b(undeliverable|delivery (has )?failed|delivery status notification|mailer-daemon|mail delivery (failed|subsystem)|address not found|mailbox (is )?(full|unavailable)|recipient (address )?rejected|could not be delivered|message not delivered|no such user)\b/i },
    { id: 'changedEmployer', test: /\bno longer (with|at|work(ing)? (at|for|with))\b|\bleft (the|this) (company|organi[sz]ation|firm)\b|\bi(?:'?ve| have) (moved|joined|left)\b|\bmoved on from\b|\brecently joined\b|\bnow (work|working) (at|for|with)\b|\bmy last (working )?day\b/i },
    { id: 'otherAgency', test: /\b(already|currently|existing)\b.{0,50}\b(agenc(y|ies)|vendors?|recruit\w* partners?|consultants?)\b|\b(another|other) (agency|vendor|consultant)\b|\bempanelled with\b/i },
    { id: 'noRequirement', test: /\bno (current |present |immediate |active )?(requirements?|openings?|vacanc\w+|hiring|positions?)\b|\bnot (hiring|recruiting)\b|\bhiring freeze\b/i },
    { id: 'referred', test: /\b(contact|speak (to|with)|talk to|write to|connect with|get in touch with|email|mail)\s+(Mr\.?\s|Ms\.?\s|Mrs\.?\s|Dr\.?\s)?[A-Z][a-z]+/ },
    { id: 'wrongContact', test: /\bwrong (person|contact)\b|\bnot the (right|correct) (person|contact)\b|\b(do not|don'?t) (handle|deal with|look after)\b|\bnot (my|in my) (area|responsibility|remit)\b/i },
    { id: 'notInterested', test: /\bnot interested\b|\bno,? thank(s| you)\b|\bnot looking\b|\b(do not|don'?t) need\b|\bnot required\b/i },
    { id: 'meeting', test: /\b(meet(ing)?|schedul\w+|reschedul\w+|calendar invite|book a (call|slot|time)|available (on|at|for)|free (on|at)|call (me )?(on|at|tomorrow|next)|speak (on|at|tomorrow|next)|let'?s (speak|talk|meet|connect) (on|at|tomorrow|next))\b/i },
    { id: 'postponed', test: /\b(later|next (week|month|quarter|year)|come back|get back to (me|us)|reach (out|back)|contact (me|us) (in|after|next|on)|in (january|february|march|april|may|june|july|august|september|october|november|december|q[1-4])|after (diwali|holi|eid|christmas|the (holidays?|festival|quarter|budget))|not (now|right now|at (the|this) (moment|time))|on leave|out of (the )?office)\b/i },
    { id: 'commercial', test: /\b(fees?|commercials?|charges?|pricing|rates?|costs?|percentage|payment terms?|replacement|ctc)\b/i },
    { id: 'moreInfo', test: /\bmore (details?|information|info)\b|\b(send|share)\b.{0,30}\b(profile|details|information|brochure)\b|\bhow do you\b|\bwhich (sectors?|locations?|cities)\b|\?/i },
    { id: 'interested', test: /\binterested\b|\bsounds good\b|\blet'?s (talk|discuss|speak)\b|\b(please )?call me\b|\bwe have (a |an )?(requirement|opening|vacancy)\b|\bshare (your|the) (profile|details)\b/i }
  ],
  /* Rules that can agree without the reply being mixed. */
  compatibleResponses: ['interested', 'moreInfo', 'commercial'],
  noReplyRule: /\b(do not|don'?t|no need to|please do not) (reply|respond)\b|\bno (reply|response) (is )?(needed|required|necessary)\b/i,
  topicRules: {
    services: /\b(services?|process|how do you|how you work|screening|what do you do|about your (firm|company))\b/i,
    sectors: /\b(sectors?|industr(y|ies)|domains?)\b/i,
    clients: /\b(clients?|customers?|who (have|do) you work(ed)? (with|for)|companies you)\b/i,
    locations: /\b(locations?|cit(y|ies)|regions?|pan[- ]india|where|do you (also )?(cover|work in|operate in))\b/i,
    exclusions: /\b(it staffing|temporary|contract staff|blue[- ]collar)\b/i
  },
  optOutWords: {
    /* "Do not contact me until March" is a request to wait, not an opt-out. */
    temporary: /\b(until|till|before|for now|for the moment|this (month|quarter|year))\b/i,
    organisation: /\b(anyone|everyone|nobody|no one|our (company|organi[sz]ation|team|staff)|this company|all of us)\b/i,
    broad: /\b(unsubscribe|remove (me|us)|no further (contact|communication)|never contact|do not contact|don'?t contact|stop contact(ing)?|leave me alone|take (me|us) off)\b/i,
    channels: {
      email: 'e-?mails?|e-?mailing|mails?|mailing',
      linkedin: 'linkedin',
      whatsapp: 'whats ?app',
      phone: 'calls?|calling|phone|ring'
    }
  },

  /* Questions with no verified answer. The draft leaves them out and says so. */
  unverifiedTopics: [
    { label: 'how quickly you can close a role', test: /\b(turnaround|tat|how (long|soon|quickly)|timelines?)\b/i },
    { label: 'your references or results', test: /\b(references?|case stud(y|ies)|track record|success rate)\b/i },
    { label: 'candidate availability', test: /\bcandidates? (available|ready)\b|\bcvs?\b|\bresumes?\b/i }
  ],

  responsibilities: [
    { id: 'unknown', label: 'Unknown' },
    { id: 'decision', label: 'Hiring decision-maker' },
    { id: 'recruiter', label: 'Operational recruiter' },
    { id: 'vendor', label: 'Recruitment vendor or empanelment manager' },
    { id: 'influencer', label: 'Business influencer' }
  ],

  reasons: [
    { id: 'role', label: 'Role-based introduction' },
    { id: 'vacancy', label: 'Verified vacancy' },
    { id: 'expansion', label: 'Verified business expansion' },
    { id: 'post', label: 'Relevant public post or statement' },
    { id: 'referral', label: 'Genuine referral' },
    { id: 'previous', label: 'Previous conversation' }
  ],

  /* First entry for each recipient type is the recommended request. */
  desired: {
    decision: [
      { id: 'fit', label: 'Recommended: ask if they use recruitment partners' },
      { id: 'call', label: 'Ask for a short call' },
      { id: 'requirement', label: 'Ask them to share a requirement' },
      { id: 'details', label: 'Offer details of how we work' }
    ],
    recruiter: [
      { id: 'fit', label: 'Recommended: ask if they use recruitment partners' },
      { id: 'direction', label: 'Ask who manages recruitment partners' },
      { id: 'requirement', label: 'Ask them to share a requirement' }
    ],
    vendor: [
      { id: 'empanel', label: 'Recommended: ask how empanelment works' },
      { id: 'call', label: 'Ask for a short call about empanelment' },
      { id: 'details', label: 'Offer details for assessment' }
    ],
    influencer: [{ id: 'direction', label: 'Recommended: ask for the right colleague' }],
    unknown: [{ id: 'direction', label: 'Recommended: ask who handles partnerships' }],
    afterReply: [
      { id: 'call', label: 'Recommended: suggest a short call' },
      { id: 'requirement', label: 'Ask for the role and location details' }
    ]
  },

  replyTypes: [
    { id: 'details', label: 'They want more information' },
    { id: 'later', label: 'They asked me to come back later' },
    { id: 'declined', label: 'They declined' }
  ],

  /* Only these sectors are named in messages. Other sectors can still be
     selected, but the message will not claim sector coverage. */
  sectors: {
    'Retail and Beautycare': 'retail and beautycare',
    'Pharmaceuticals': 'pharmaceutical',
    'FMCG': 'FMCG',
    'Banking and Insurance': 'banking and insurance',
    'QSR and Restaurants': 'QSR and restaurant',
    'Hospitality': 'hospitality',
    'Manufacturing': 'manufacturing'
  },

  lists: {
    industries: ['Retail and Beautycare', 'Pharmaceuticals', 'FMCG', 'Banking and Insurance', 'QSR and Restaurants', 'Automotive', 'Consumer Durables', 'Education', 'Financial Services', 'Healthcare', 'Hospitality', 'Logistics', 'Manufacturing', 'Media', 'Real Estate', 'Textiles and Apparel'],
    locations: ['Kolkata', 'Howrah', 'Siliguri', 'Durgapur', 'Asansol', 'West Bengal', 'Ahmedabad', 'Bengaluru', 'Bhubaneswar', 'Chennai', 'Delhi NCR', 'Guwahati', 'Hyderabad', 'Lucknow', 'Mumbai', 'Patna', 'Pune', 'Ranchi'],
    /* Searchable designation list. "r" is the suggested responsibility. */
    designations: [
      ['Chief Human Resources Officer', 'decision'], ['CHRO', 'decision'], ['Chief People Officer', 'decision'],
      ['President HR', 'decision'], ['Vice President HR', 'decision'], ['VP Human Resources', 'decision'],
      ['AVP HR', 'decision'], ['Director HR', 'decision'], ['HR Director', 'decision'],
      ['Head of HR', 'decision'], ['HR Head', 'decision'], ['Head of Human Resources', 'decision'],
      ['General Manager HR', 'decision'], ['DGM HR', 'decision'], ['Head of Talent Acquisition', 'decision'],
      ['Talent Acquisition Head', 'decision'], ['Head of Recruitment', 'decision'], ['HR Manager', 'decision'],
      ['Talent Acquisition Manager', 'decision'], ['Recruitment Manager', 'decision'],
      ['Founder', 'decision'], ['Co-Founder', 'decision'], ['Managing Director', 'decision'],
      ['Chief Executive Officer', 'decision'], ['CEO', 'decision'], ['Director', 'decision'],
      ['Owner', 'decision'], ['Proprietor', 'decision'], ['Partner', 'decision'],
      ['Recruiter', 'recruiter'], ['Senior Recruiter', 'recruiter'], ['Talent Acquisition Specialist', 'recruiter'],
      ['Talent Acquisition Executive', 'recruiter'], ['Talent Acquisition Partner', 'recruiter'],
      ['Recruitment Executive', 'recruiter'], ['HR Executive', 'recruiter'], ['HR Officer', 'recruiter'],
      ['HR Generalist', 'recruiter'], ['HR Associate', 'recruiter'],
      ['Vendor Manager', 'vendor'], ['Vendor Management Lead', 'vendor'], ['Empanelment Manager', 'vendor'],
      ['Recruitment Vendor Manager', 'vendor'], ['HR Vendor Manager', 'vendor'], ['HR Procurement Manager', 'vendor'],
      ['Procurement Manager', 'vendor'], ['Category Manager, HR Services', 'vendor'], ['Sourcing Manager', 'vendor'],
      ['HR Business Partner', 'influencer'], ['Business Head', 'influencer'], ['Business Unit Head', 'influencer'],
      ['Chief Operating Officer', 'influencer'], ['Chief Financial Officer', 'influencer'],
      ['Sales Director', 'influencer'], ['National Sales Manager', 'influencer'], ['Regional Sales Manager', 'influencer'],
      ['Regional Manager', 'influencer'], ['Zonal Manager', 'influencer'], ['Area Sales Manager', 'influencer'],
      ['Branch Manager', 'influencer'], ['Operations Head', 'influencer'], ['Operations Manager', 'influencer'],
      ['Plant Head', 'influencer'], ['Marketing Head', 'influencer'], ['Finance Head', 'influencer'], ['Store Manager', 'influencer']
    ]
  },

  /* Ordered keyword rules for titles typed outside the list. First match wins. */
  titleRules: [
    { r: 'vendor', test: /(vendor|empanel|procurement|sourcing manager)/i },
    { r: 'recruiter', test: /\b(recruiter|hr (executive|officer|generalist|associate|assistant)|talent acquisition (specialist|executive|partner|associate|lead)|recruitment (executive|specialist|associate))\b/i },
    { r: 'influencer', test: /\b(hr ?bp|hr business partner)\b/i },
    { r: 'decision', test: /\b(chro|ceo|cpo|founder|co-?founder|managing director|owner|proprietor|(head|vp|vice president|avp|director|president|gm|dgm|general manager|manager)\b.*\b(hr|human resources|people|talent|recruitment)|(hr|human resources|people|talent acquisition|recruitment)\b.*\b(head|director|manager|lead))\b/i },
    { r: 'influencer', test: /\b(head|director|chief|vp|vice president|gm|general manager|regional|zonal|national|area|branch|plant|operations|sales|marketing|finance)\b/i }
  ],

  /* Service boundary checks. Keyword matching can be wrong, so the interface
     lets a user confirm a false match. Temporary hiring cannot be confirmed. */
  scope: {
    it: {
      label: 'IT staffing',
      terms: [/\bIT\b/, /\b(software|developer|programmer|coder|devops|sdet|full[- ]?stack|front[- ]?end|back[- ]?end|data engineer|data scientist|cloud engineer|network engineer|system administrator|sysadmin|cyber ?security|java|python|\.net|sap abap|tech lead|technical architect|solution architect|ui\/ux)\b/i]
    },
    temporary: {
      label: 'temporary manpower supply',
      terms: [/\b(temporary|temp staff|contract staff(ing)?|contractual|contract basis|daily wage|manpower|third[- ]party payroll|seasonal staff|gig worker)\b/i]
    },
    blueCollar: {
      label: 'blue-collar recruitment',
      terms: [/\b(driver|helper|labou?r(er)?|welder|fitter|electrician|plumber|mason|carpenter|machine operator|forklift|loader|packer|picker|delivery (boy|rider)|rider|housekeeping|security guard|peon|cook|sweeper|cleaner|factory worker|site worker|technician)s?\b/i]
    },
    outsideIndia: [/\b(dubai|abu dhabi|sharjah|saudi|riyadh|jeddah|qatar|doha|oman|muscat|kuwait|bahrain|singapore|malaysia|london|canada|australia|germany|nepal|kathmandu|bangladesh|dhaka|sri lanka|united states|united kingdom|united arab emirates)\b/i, /\b(UAE|USA|UK)\b/],
    itIndustry: [/\bIT\b/, /\b(information technology|software|saas|tech(nology)? services)\b/i]
  },

  /* Text that should not survive in a final message. */
  lint: {
    placeholder: /\{[^}]*\}|\[[^\]]*\]|<[^>]+>|\b(XXX+|TBD|TBC|INSERT|PLACEHOLDER|LOREM)\b/,
    commercial: /8\.33|\d\s*(%|percent|per cent)\s*(of|on)?\s*(the\s*)?(annual\s*)?(ctc|salary|package)\b|\bCTC\b|\bfees?\b|\bcommissions?\b|\bcharges?\b|\bpayment\b|\bannual salary\b|\breplacement\b|\b(30|60)[- ]days?\b/i,
    claims: /\b(guarantee[ds]?|100%|top talent|best in|leading|number one|proven|immediately|urgent(ly)?|ready candidates|database of|pool of)\b/i,
    dash: /[\u2013\u2014]/,
    /* Spam filters weigh sender reputation far more than words. These checks
       catch content habits only, so they warn and never block. */
    spamPhrases: /\b(act now|limited time|click here|special promotion|money back|risk[- ]free|winner|cash bonus)\b/i,
    fakeReply: /^\s*(re|fw|fwd)\s*:/i
  }
};

/* One operator and one agency per workspace. A backup must never silently
   activate the sender claims of another business. */
function applyAgency(profile) {
  const p = profile && profile.approved === true && (!profile.reviewBy || profile.reviewBy >= new Date().toISOString().slice(0,10)) ? profile : {};
  const value = key => typeof p[key] === 'string' ? p[key].trim() : '';
  CONFIG.firm.name = value('name') || 'Job Point Consultancy';
  CONFIG.profileVersion = value('revision') || 'platform-identity-v1';
  CONFIG.clients = value('references').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  CONFIG.clientCores = Object.fromEntries(CONFIG.clients.map(n => [n, n.toLowerCase().replace(/\.(com|in|co)\b/g, '').replace(/&/g, 'and').replace(/[^\p{L}\p{N}]/gu, '')]));
  CONFIG.answers.services = value('services');
  CONFIG.answers.sectors = value('sectors');
  CONFIG.commercial.lines = value('terms').split(/\n/).map(s => s.trim()).filter(Boolean);
  CONFIG.commercial.sentence = CONFIG.commercial.lines.join(' ');
  CONFIG.reviewBy = value('reviewBy');
}
