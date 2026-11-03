# Email Kit conversation continuity

## Research and choice

Gmail groups replies into ordered threads, while its incremental sync requires a full refresh when history tokens expire. A mailbox connector would therefore need OAuth consent, scope management, per-account state, revocation, and recovery from gaps. CRM timelines also associate messages, tasks and meetings with a contact. For this platform the smallest reliable first step is structured intake plus optional pasted history, followed by consultant verification and storage in the existing conversation record. The source text is retained; unlabelled text is not treated as confirmed chronology. No mailbox is read or message sent automatically.

References: [Gmail threads](https://developers.google.com/workspace/gmail/api/guides/threads), [Gmail sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Microsoft Graph mail messages](https://learn.microsoft.com/en-us/graph/api/resources/message), [HubSpot email engagements](https://developers.hubspot.com/docs/api-reference/crm-emails-v3/guide).

## Implemented flow

The six scenario labels map to the existing first contact and follow-up lifecycle. Imported conversations require company, a contact identifier, objective, edited summary, latest sender/date, and the latest client's wording if the client replied. The last communication, source history and verified context are stored in the existing D1 records. The engine prevents a duplicate open conversation. It creates a reply task after a client message, or a review task after the consultant's latest reply. A deterministic advisor pauses recent follow-ups, flags possible stop requests and future dates, and asks for missing essentials. A reply based on imported history requires a verified answer or next step. The draft remains editable and is recorded as sent only after explicit confirmation.

## Limits

The parser extracts only labelled headers and literal questions. It does not infer intent, resolve contradictory claims, extract every historical message, monitor mailboxes or autonomously send. Consultants should check imported summaries against originals. Connection health checks in Operations do not synchronise mailboxes or expose remote tools to users.
