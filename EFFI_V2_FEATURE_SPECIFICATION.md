# Effi v2 — Feature Specification

## 1. Product Overview

**Effi v2** is an AI-powered civic reporting and officer-intelligence platform. It enables citizens to report civic issues naturally through familiar messaging channels using their preferred language and media, then converts those conversations into concise, evidence-backed cases for officers. Pattern detection and citizen-led resolution verification extend this foundation.

> **Core positioning:** Report naturally. Give officers a case they can act on.

### Primary users

1. **Citizen / Reporter** — reports an issue and follows its progress.
2. **Admin / Civic Officer** — investigates, manages, and resolves reported cases.

### Two core product promises

1. **Accessible reporting** — citizens can report civic problems naturally through familiar messaging channels, in their preferred language and medium.
2. **Officer intelligence** — Effi converts unstructured citizen reports into concise, evidence-backed case briefs that officers can act on.

Civic Pattern Intelligence and the Proof-of-Resolution Engine extend these promises after the core reporting and case-brief workflow is stable.

---

## 2. Citizen / Reporter Side

### 2.1 Multimodal reporting chat

The citizen reports an issue through a simple chat interface instead of completing a long government form.

#### Supported citizen inputs

- Text messages
- Voice notes
- Images
- Videos
- Device GPS location
- Manually selected map location

#### Supported Effi responses

- Text messages
- Generated voice-note responses
- Clarification questions
- Submission confirmation
- Case-progress notifications

### 2.2 Multilingual communication

- Citizens can report an issue in their preferred supported language.
- Voice notes are transcribed using a speech-to-text model.
- Text and transcripts are translated when required for internal processing.
- Effi responds in the citizen's selected language.
- A citizen can play Effi's response as audio using text-to-speech.
- The original message, transcript, and translated version remain attached to the case.

### 2.3 Guided evidence collection

Effi checks whether the submitted information is sufficient before creating the case.

#### Evidence checks

- Detect whether an uploaded image or video is relevant to the reported issue.
- Check whether the media is clear enough for officer review.
- Compare the citizen's description with the visible evidence.
- Confirm or request the issue location.
- Detect missing, unclear, or conflicting information.
- Ask one focused follow-up question when necessary.

#### Example

> “The damaged area is not clearly visible. Please upload a wider image showing the road and a nearby landmark.”

### 2.4 Review before submission

Before creating the case, Effi displays an editable summary containing:

- Detected issue
- Issue category
- Location
- Short description
- Attached evidence
- Any missing information

The citizen can confirm or correct the interpretation before submission.

### 2.5 Case creation and acknowledgement

After confirmation:

- A unique report ID is generated.
- The report and original evidence are stored.
- The citizen receives an acknowledgement.
- The report is sent to the officer dashboard.
- If it matches an existing issue, it may be linked to that case while remaining visible to the reporter.

### 2.6 Transparent case timeline

Citizens see meaningful progress instead of only a generic status.

#### Timeline stages

1. Report submitted
2. Evidence reviewed
3. Officer assigned
4. Under inspection
5. Work in progress
6. Resolution verification pending
7. Verified resolved or reopened

Each timeline event can show its date, time, short explanation, and responsible team where appropriate.

### 2.7 Clarification and follow-up requests

- Officers can request additional information through Effi.
- Effi translates the request into the citizen's preferred language.
- Citizens can respond using text, voice, image, or video.
- New responses automatically become part of the case evidence.
- The citizen does not need to begin a new complaint.

### 2.8 Resolution confirmation

When an officer reports that work is complete, Effi asks the original reporter:

> “Has this issue actually been resolved?”

The citizen can:

- Confirm that it is resolved.
- State that it is unresolved.
- Indicate that it is only partially resolved.
- Upload fresh image or video evidence.
- Add a text or voice explanation.

This response becomes part of the final closure decision.

### 2.9 Nearby-problem heat map — supporting feature

- Citizens can view anonymized, aggregated civic-problem hotspots near their selected location.
- The heat map can show approximate areas, issue categories, severity, and freshness.
- Exact report locations, reporter details, conversations, and submitted evidence are never displayed publicly.
- The heat map is intended for situational awareness, not public access to individual case files.

### 2.10 Telegram and WhatsApp reporting bots

Telegram and WhatsApp are the primary citizen reporting channels. Both connect to the same Effi backend, Case Investigator, case records, and officer dashboard rather than operating as separate AI systems.

#### Supported bot inputs

- Multilingual text messages
- Voice notes and audio files
- Images
- Explicitly shared location pins
- Typed addresses or nearby landmarks

#### Supported Effi responses

- Multilingual text responses
- Generated voice-note responses
- Clarification questions
- Reviewable case summaries with Confirm and Edit options
- Case acknowledgement and report ID
- Simple case-status lookup

#### Shared bot case flow

- A citizen can begin and complete a report without installing an app.
- Telegram and WhatsApp messages enter the same evidence-processing pipeline.
- The citizen confirms Effi's interpretation before the report is created.
- The created report appears on the same officer dashboard and follows the same timeline.
- A bot-delivered sign-in link or button associates the authenticated citizen with the active conversation before case creation. The exact sign-in timing is an implementation-stage decision.
- Every message and attachment reference is persisted as it arrives, allowing an incomplete report to resume in its original channel.
- Reports and sessions remain tied to their original channel; cross-channel continuation and identity linking are not supported.

---

## 3. Admin / Civic Officer Side

### 3.1 Civic command dashboard

The dashboard provides an operational overview containing:

- New reports
- Active cases
- Issue clusters
- Cases awaiting officer action
- Cases awaiting citizen information
- Cases awaiting resolution verification
- Reopened cases
- Map-based case distribution

Filters can include location, category, priority, status, date, evidence confidence, and cluster membership.

#### Dashboard analytics

The dashboard summarizes operational and public-service performance using:

- Total, new, active, reopened, and resolved cases
- Cases by category, status, location, and priority
- Average resolution time
- Recurring locations and issue clusters
- Verified resolution rate
- Citizen resolution-confirmation rate
- Time-based complaint trends

Analytics can be filtered by date, location, category, and case status. Officers can open the underlying cases behind every metric or trend.

### 3.2 Evidence-backed AI case brief

Effi converts the citizen's unstructured conversation and media into a structured officer brief.

#### Case brief fields

- Issue summary
- Detected category
- Exact or approximate location
- Reported date and time
- Visible severity or impact
- Important citizen statements
- Available media and evidence types
- Missing or conflicting information
- Related current reports
- Previous cases near the location
- AI interpretation confidence

The officer can always access the original evidence and conversation.

#### AI urgency and priority scoring

Effi recommends a priority level for every case:

- **Critical**
- **High**
- **Medium**
- **Low**

The recommendation uses evidence-backed signals such as visible public-safety risk, reported impact, number and rate of related reports, recurrence at the location, time unresolved, and relevant nearby public infrastructure. Effi displays the reasons and source evidence behind the score.

The officer can override the recommended priority. Both the AI recommendation and the officer's final decision remain recorded in the audit trail.

### 3.3 Source-grounded evidence navigation

The case brief remains visually clean while allowing officers to inspect the evidence behind consequential fields such as urgency, location, and key citizen statements through a selective **View source** action. Ask Effi provides full answer-level citations when that P1 capability is available.

#### Supported evidence references

- Citizen message
- Voice-note transcript and timestamp
- Video timestamp
- Image or selected image region
- GPS record
- Related report
- Historical case
- Officer note or completion evidence

#### Example

> “This was marked as a road-safety risk because the reporter described vehicles entering the opposite lane at 00:18 in the voice note, and the obstruction is visible from 00:07–00:12 in the video.”

### 3.4 Ask Effi — case copilot

The officer can ask questions about the selected case using natural language.

#### Example questions

- What exactly did the reporter say?
- Translate the original Marathi voice note into English.
- Where in the video is the issue visible?
- When did the reporter say the issue started?
- What evidence is missing?
- Why was this case assigned this confidence or priority?
- Are there similar reports nearby?
- Was this location repaired previously?
- Summarize all updates after assignment.
- Draft a clarification question for the citizen.

Answers initially use only evidence from the selected case, include citations to their sources, and clearly state when the available evidence is insufficient. Historical and cross-case questions become available only after pattern intelligence is enabled.

### 3.5 Report-to-case management

- A **report** represents one citizen's submission.
- A **case** represents the civic problem being investigated.
- Multiple reports can be linked to one case.
- Every reporter retains their individual evidence and updates.
- Officers can manually link or unlink reports when Effi's recommendation is incorrect.

### 3.6 Civic Pattern Intelligence

Effi searches across present and historical reports to identify relationships that officers may miss.

#### Signals used

- Geographic proximity
- Issue category
- Report time and frequency
- Text and transcript similarity
- Image or video similarity
- Repeated complaints after a previous closure
- Similar conditions across nearby locations
- Citizen confirmations

#### Pattern levels

1. **Possible duplicate** — multiple reports likely describe the same physical issue.
2. **Recurring issue** — a similar problem repeatedly returns at the same location.
3. **Issue cluster** — reports across nearby locations may indicate one wider underlying civic failure.

#### Example output

> **Possible recurring drainage failure:** 11 reports across three nearby streets during the last two rainfalls. Two locations were previously marked resolved, but complaints returned.

### 3.7 Explainable issue clusters

For every suggested cluster, Effi displays:

- Reports included
- Map relationship
- Shared issue characteristics
- Relevant dates and frequency
- Historical repairs or closures
- Evidence supporting the connection
- Pattern confidence

The officer can accept, modify, or reject the cluster. Effi must not merge reports irreversibly without officer confirmation.

### 3.8 Historical civic intelligence

When viewing a case or location, the officer can see:

- Previous reports at or near the location
- Earlier issue categories
- Past completion evidence
- Whether citizens accepted or challenged earlier resolutions
- Reopened cases
- Frequency of recurrence
- Before-and-after evidence from earlier cases

This helps distinguish a new incident from a repeatedly failing location.

### 3.9 Officer case actions

The officer can:

- Confirm or correct the issue category.
- Adjust priority.
- Assign an officer or team.
- Change the case status.
- Add internal notes.
- Request citizen clarification.
- Link or unlink reports.
- Accept or reject an issue cluster.
- Upload inspection evidence.
- Upload completion evidence.
- Submit a case for resolution verification.
- Approve closure or reopen the case.

Every action is timestamped and added to the case history.

### 3.10 Proof-of-Resolution Engine

An officer's **work completed** status initiates verification; it does not automatically close the case.

#### Verification inputs

- Original citizen evidence
- Officer completion images or videos, when voluntarily provided
- GPS and capture metadata where available
- Before-and-after visual comparison
- Original reporter feedback
- Feedback from other linked reporters
- Previous failed closure attempts

#### Verification checks

- Is completion evidence from the correct case and location?
- Does it clearly show the originally reported area?
- Is the media sufficiently clear?
- Does the visible issue appear removed or improved?
- Does the citizen agree that it is resolved?
- Are there conflicting citizen responses or new evidence?
- Has the same issue returned after an earlier closure?

#### Possible verdicts

- **Verified resolved**
- **Likely resolved — citizen confirmation pending**
- **Partially resolved**
- **Evidence insufficient**
- **Conflicting evidence — manual review required**
- **Issue appears unresolved — reopen recommended**

Effi recommends a verdict and explains it. An authorized officer retains the final closure decision.

### 3.11 Closure packet

Before final closure, Effi creates a concise packet containing:

- Original problem summary
- Original evidence
- Actions and timeline
- Completion evidence
- Before-and-after comparison
- Citizen feedback
- Conflicting evidence, if any
- AI verification verdict and confidence
- Final human decision

The packet becomes an auditable record of why the case was closed or reopened.

---

## 4. Shared AI and Data Capabilities

### 4.1 Current-case memory

Stores information required to manage the active case:

- Citizen conversation
- Original and translated text
- Voice transcripts
- Images and videos
- Evidence references and timestamps
- Extracted facts
- Officer actions and notes
- Current status
- Linked reports
- Pending questions
- Resolution evidence and verdicts

### 4.2 Historical civic memory

Stores reusable civic history:

- Previous reports and cases
- Locations and issue categories
- Issue clusters
- Past repairs and interventions
- Closure and reopening history
- Citizen resolution feedback
- Recurring-location patterns

### 4.3 Evidence index

Makes all case evidence searchable:

- Text chunks
- Translated text
- Voice transcript segments
- Video segments and timestamps
- Image descriptions or embeddings
- Locations
- Case summaries
- Officer notes

It powers source-grounded officer questions, similarity detection, and historical search.

### 4.4 Confidence and human review

Effi attaches confidence to major AI outputs such as:

- Issue classification
- Evidence relevance
- Report similarity
- Cluster suggestions
- Extracted facts
- Resolution verdicts

Low-confidence or conflicting results are routed for human review. Officers can correct AI outputs, and the original AI output remains recorded for auditability.

### 4.5 Audit trail

The platform records:

- Citizen submissions and edits
- AI-generated interpretations
- Evidence sources used by the AI
- Officer corrections
- Assignment and status changes
- Clarification requests and responses
- Cluster decisions
- Completion uploads
- Verification recommendations
- Final closure or reopening decisions

### 4.6 Secure cloud storage and access

- Case records, conversations, media, transcripts, status events, and audit history are stored in secure cloud infrastructure.
- Role-based access separates citizen, officer, and administrator permissions.
- Citizens can access only their own private reports and permitted public case information.
- Officers can access cases according to their authorized operational scope.
- Authentication, authorization rules, and protected media access are enforced on the server and database rather than only in the client interface.
- Data is encrypted in transit and uses the cloud provider's encryption-at-rest protections.
- Sensitive reporter details are excluded from public maps, nearby-case views, analytics, and shared evidence.
- Every case uses the same backend and officer dashboard. Citizen conversations and cases continue through their original channel only.
- Realtime status updates and cloud storage provide consistent access across supported devices.

---

## 5. MVP Priority

The agreed P0, ordered P1, memory boundaries, and explicitly deferred features are maintained in [EFFI_V2_P0_P1_FEATURES.md](EFFI_V2_P0_P1_FEATURES.md). This specification defines product behavior; the priority document defines the hackathon implementation boundary.

---

## 6. End-to-End Demo Flow

1. A citizen begins a report in Telegram or WhatsApp using an Indian language supported by the selected speech and translation providers.
2. The citizen sends a voice note, an image, and either a location pin or typed landmark.
3. Effi understands the report, responds in the citizen's language and medium, and asks one essential clarification question.
4. The citizen reviews and confirms Effi's interpretation, authenticates through the bot-delivered sign-in flow, and submits the report.
5. Effi returns an acknowledgement and report ID.
6. The authenticated officer opens the new case and receives a concise brief containing the issue, confirmed location, severity, key statements, evidence, uncertainty, and an explainable priority recommendation.
7. The officer uses selective **View source** actions to inspect the evidence behind consequential fields.
8. The officer assigns the case, overrides priority if necessary, and changes its basic status.
9. The citizen uses the original bot channel to check the current status.

The same core journey must work end to end in both Telegram and WhatsApp. P1 expands it with the citizen app, video, Ask Effi, resolution verification, pattern intelligence, and analytics.

---

## 7. Final Product Summary

### Citizen value

Citizens can report issues naturally in their own language and format, receive understandable progress updates, and challenge false or incomplete resolution.

### Officer value

Officers receive concise, source-backed case intelligence instead of manually processing every message and media file. Effi also reveals recurring failures hidden across disconnected reports.

### Civic-system value

Effi makes civic reporting easier to access and gives officers structured intelligence instead of forcing them to interpret fragmented messages and media manually.

> **Final pitch:** Effi lets citizens report civic problems naturally through Telegram or WhatsApp and turns every conversation into an evidence-backed case officers can act on.
