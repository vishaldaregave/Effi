# Effi v2 — P0 and P1 Features

This document is the hackathon implementation boundary for Effi v2. P0 proves two promises: accessible citizen reporting and an evidence-backed AI case brief for officers. P1 begins only after the complete P0 journey is stable in both Telegram and WhatsApp.

## P0 — Must work in the hackathon demo

### 1. Complete Telegram and WhatsApp reporting

- Both bots support the same end-to-end journey through one shared backend.
- Citizens can send multilingual text, voice notes, images, and current GPS locations or manually selected location pins.
- Effi supports the Indian languages available through the selected speech-to-text, translation, and text-to-speech providers.
- Effi responds with multilingual text and generated voice notes where appropriate.
- Video is not required in P0.

### 2. Guided report creation

- Effi checks only essential completeness: understandable issue, usable evidence, and location.
- Effi asks one focused clarification question at a time.
- Deep contradiction detection and advanced media-quality analysis are deferred until video support in P1.
- The citizen reviews and confirms an editable interpretation before submission.
- A location must be provided as a current GPS location or manually selected pin, and Effi confirms its interpretation.

### 3. Citizen identity and original-channel continuity

- Reporting is supported only in direct messages. A bot-delivered, opaque claim link associates the authenticated citizen ID with one immutable pending submission before case creation.
- Sign-in occurs only after final confirmation. The single-use claim link lasts 24 hours and can be reissued for the same frozen submission if it expires.
- Every message, transcript, attachment reference, extracted result, and clarification state is persisted as it arrives in an anonymous draft.
- An incomplete draft resumes for the same channel, sender, and direct-message chat for seven days; it never resumes across channels or for a different sender.
- A citizen can explicitly start a new report, which isolates the new draft from the old one.
- A report never moves between Telegram, WhatsApp, or the future app. Cross-channel identity linking and session continuation are not supported.

### 4. Submission and simple tracking

- Confirmed reports receive an acknowledgement and unique report ID.
- Bots acknowledge successful registration but do not provide report or case-status tracking.
- Status tracking, detailed timelines, proactive notifications, post-submission clarification threads, and resolution feedback are deferred to P1.

### 5. Evidence-backed AI case brief

The officer brief contains:

- Plain-language issue summary
- Category
- Confirmed location
- Reported time
- Severity and public impact
- Key citizen statements
- Submitted evidence
- Missing or uncertain information
- Explainable Critical, High, Medium, or Low priority recommendation
- Original conversation and evidence access

The dashboard keeps the brief visually clean. Consequential fields such as urgency, location, and key statements can expose a selective **View source** action. Full conversational citations belong to Ask Effi in P1.

### 6. Lightweight officer operations

- Officer OAuth authentication
- Case inbox and case detail
- Assignment
- Priority override
- Basic status changes
- Secure role-based access to citizen and officer data

### 7. Essential audit history

P0 records the original submission, citizen-approved interpretation, AI-generated brief and priority, officer overrides, assignment, and status changes. A sophisticated audit-log interface is not required.

### 8. P0 memory boundary

- The agent resumes from durable report state and bounded recent messages, rather than replaying the complete raw chat history on every bot turn.
- P0 does not add embeddings, semantic retrieval, or RAG. The compact report state exists only to resume the active channel draft safely.
- The confirmed report and AI case brief are stored as persistent case records.
- Each new report is memory-isolated and does not silently inherit a citizen's previous complaints.

## P1 — Build after P0 is stable

P1 should be attempted in this order.

### 1. Citizen app

- Reporting parity with the Telegram and WhatsApp bots
- Persisted incomplete sessions
- Case tracking and detailed citizen timeline
- Interactive map-location selection
- An anonymized nearby-problem heat map showing approximate hotspot areas, category, severity, and freshness
- No exact case pins, reporter identity, conversations, or submitted evidence on the public heat map

### 2. Video reporting and analysis

- Video upload and secure storage
- Speech transcription when present
- Relevance and clarity checks
- Key issue timestamps
- Direct officer playback from identified moments
- Cross-case video similarity is not included

### 3. Ask Effi

- A case-scoped officer copilot
- Answers grounded only in the selected case's messages, transcript segments, evidence descriptions, and officer updates
- Source citations for answers
- Explicit insufficient-evidence responses
- Historical and cross-case questions activate only when pattern intelligence is available

### 4. Citizen-led resolution verification

- An officer marks work as completed through the normal case action without being required to justify the completion.
- Officer completion photos or videos are optional.
- Effi asks the citizen whether the issue is resolved, unresolved, or partially resolved.
- The citizen may add fresh evidence.
- Effi compares the response and available evidence with the original report and recommends closure, further review, or reopening.
- The authorized officer retains the final decision.

### 5. Lightweight pattern intelligence

- Possible duplicate detection
- Same-location recurring-problem detection
- A clear explanation of why reports appear related
- Officer acceptance or rejection
- No advanced multi-location root-cause clusters or cluster maps

### 6. Lightweight dashboard analytics

- New, active, and resolved case counts
- Cases by category
- Advanced trends, performance reporting, average resolution time, recurrence analytics, drill-down charts, and complex filters are not included

### 7. Extended case communication

- Detailed timelines
- Proactive status notifications
- Officer clarification requests and citizen replies
- Resolution feedback through the original channel

## P1 semantic memory and RAG

P1 introduces two isolated retrieval scopes:

1. **Selected-case retrieval for Ask Effi** — embeds individual messages, transcript segments, evidence descriptions, and officer updates from the selected case.
2. **Privacy-safe cross-case retrieval for pattern intelligence** — embeds one sanitized semantic summary per case and combines it with category, approximate location, and time filters.

Raw images, identity details, and entire unsegmented conversations are not embedded. Cross-case retrieval does not expose unrelated citizens' raw conversations or personal data.

## Data retention boundary

- The MVP does not claim a sophisticated regulatory retention or archival policy.
- Unclaimed anonymous drafts expire seven days after their last activity. Expiry and explicit cancellation remove the draft's messages, media, transcripts, and attachment references together.
- Successfully claimed conversations and case evidence persist until an authorized deletion.
- Deletion cascades through related messages, media, transcripts, and semantic-index entries.
- Advanced retention, archival, and automated policies beyond the fixed anonymous-draft expiry are outside the MVP.

## Explicitly outside the hackathon MVP

- Cross-channel identity linking or session continuation
- Advanced geographic or root-cause clusters
- Advanced cluster maps
- Cross-case video similarity
- Detailed analytics and department-performance reporting
- Multiple-reporter resolution voting
- Complex conflicting-evidence workflows
- Detailed closure-packet export
- Advanced retention and archival policies beyond the fixed anonymous-draft expiry
- Scraping government laws, rules, or municipal procedures
- Fully automatic officer assignment
- Automatic interdepartmental escalation
- Complex SLA prediction
- AI-generated operational work plans
- Shift briefings and handovers
- Fully autonomous closure without human authorization
- A live AI phone-call interface
- Multiple agents freely conversing with one another
