---
name: choose-core-loops
description: Synthesize completed grilling, research, prototypes, and handoffs into the first 2–3 hackathon core loops. Use after discovery and before writing a spec or tickets to recommend the smallest convincing build, including any high-leverage foundation work.
---

# Choose Core Loops

A **core loop** is an end-to-end user journey that produces visible proof of the product's promised value. It is a vertical slice, not a screen, endpoint, or technical layer.

Use this after `/grill-me` or `/grill-with-docs`, plus any relevant `/research`, `/prototype`, and `/handoff` work. It synthesizes what is already known; it does not restart discovery.

## 1. Reconstruct the evidence

Read the full current conversation and every supplied or discoverable planning artifact: grilling decisions, research notes, prototype verdicts, handoff documents, project brief, judging criteria, and repository context. Follow context pointers in handoffs and issues. List the established facts and cite the artifact or conversation that supports each one.

Never re-ask a resolved question. If a decision still lacks evidence, name the smallest next discovery that would settle it — research, logic prototype, UI prototype, or a grilling question — and ask the user whether to run it.

Completion criterion: every recommendation can point to evidence, an explicit user preference, or a stated assumption.

## 2. Form candidate loops

Turn the discussed features into candidate loops in this form:

```markdown
<Actor> starts with <trigger>, does <key action>, receives <valuable outcome>, and shows <proof>.
```

Also propose a better loop when the evidence shows that the discussed features are a weaker route to the product promise. Explain which evidence supports the alternative; do not invent a new direction without saying it is an assumption.

Completion criterion: every plausible first-build feature is represented as a user outcome, not a technical task.

## 3. Recommend the smallest convincing build

Assess each candidate against:

- **Promise** — directly delivers the central product promise.
- **Proof** — gives a judge a clear, observable result.
- **Evidence** — is supported by grilling, research, or prototype learning rather than wishful planning.
- **Risk** — retires an important product, UX, or technical uncertainty early enough to react.
- **Leverage** — establishes a domain concept, seam, or data flow that later loops genuinely reuse.
- **Cost** — is small enough to complete, test, and demo within the hackathon.

Recommend at most three core loops; one or two is stronger when they make the promise convincing. Put all other product features in **Later**.

Recommend **foundation work** only when it is the smallest prerequisite that makes a selected loop work safely or makes later changes local. State the loop it unlocks, its test seam, and why it cannot live inside that loop's ticket. Prefer a narrow enabling ticket or prefactor over a horizontal foundation phase.

Completion criterion: removing any recommended loop or foundation item would make the demo less convincing, less safe to change, or unable to run.

## 4. Confirm and hand off to the build flow

Present the recommendation in this form:

```markdown
## Evidence used

- <decision or learning> — <source>

## Recommended core loops

1. **<name>** — <actor → action → outcome → proof>
   - Why first: <promise, evidence, risk, or leverage>
   - Demo proof: <what the judge sees>

## Foundation work

- **<name>** — unlocks <core loop>; test at <seam>; <why it must precede the loop>

## Later

- <feature> — <why it follows the core build>

## Open discovery

- <question> — recommend <research / prototype / grilling> because <reason>
```

Ask the user to confirm or alter the recommendation. 

Completion criterion: the user has confirmed at most three core loops, each with a demo proof, and every foundation item has a named loop and seam.
