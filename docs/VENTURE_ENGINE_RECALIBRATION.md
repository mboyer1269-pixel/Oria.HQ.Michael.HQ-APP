# Venture Engine Recalibration

Status: Canonical direction before new venture contracts, UI, database, or agent runtime work.

## Core Direction

Michael HQ is the CEO's personal Venture Engine.

The goal is to create, test, operate, and scale ventures that generate revenue. Michael HQ is not a static portfolio of existing projects, and it is not anchored to any prior list of brands.

Existing named ventures such as MCL, Suivia, NOORKI, Dad School, and prior holding portfolio documents are historical examples only. They do not define the canonical Venture Engine model.

The system must support blank-slate venture creation. Ventures can be created manually by the CEO or suggested by agents. Agent-generated ventures always start as candidates only; they do not become validation or active ventures without explicit CEO approval.

## Initial Operating Shape

The first Venture Engine surface should support:

- unlimited raw ideas and backlog items
- 6 visible candidate cards
- 3 active validation slots
- blank venture cards created manually by the CEO
- agent-generated venture candidates
- later add, edit, archive, kill, and scale behavior

A venture that becomes sufficiently autonomous can free capacity for another active venture. Capacity should be about CEO attention and validation bandwidth, not a hard lifetime cap on ideas.

## Promotion And Lifecycle

The CEO must approve promotion from candidate to validation or active status.

Suggested lifecycle:

- discovered
- candidate
- scored
- shortlisted
- approved_for_validation
- validating
- operating
- autonomous
- scaling
- paused
- killed
- archived

A venture can be edited, archived, killed, or scaled later. Those actions should become explicit product operations with auditability, not hidden state changes.

## Safe Autonomy Doctrine

A venture can become more autonomous when it proves value. Autonomy must be domain-based, not one global number.

Low-risk domains may become highly autonomous when evidence supports it:

- research
- market scanning
- analysis
- scoring
- reporting
- planning
- internal optimization
- draft generation

Risky domains must remain controlled or approval-gated:

- spending money
- contacting prospects or customers
- publishing publicly
- signing or making legal commitments
- deleting data
- changing production database/schema
- executing irreversible external workflows
- making financial promises

The approval model should distinguish safe autonomy from dangerous autonomy. A venture may be trusted to research and score opportunities while still being blocked from spending, outreach, publication, legal commitments, production database changes, or irreversible external execution.

## UX Doctrine

Michael HQ must stay user-friendly and not overloaded. The main HQ should remain a cockpit, not a dense admin panel.

Preferred UX:

- HQ page shows only high-signal modules
- Venture page handles venture cards and active decisions
- details, settings, audit, and advanced autonomy controls live in drill-down pages or settings panels
- avoid placing every concept directly on the main HQ page

The Venture Engine should make the CEO's next decision obvious: what to investigate, what to validate, what to stop, and what is ready to scale.

## Historical Context

Prior portfolio documents and named venture ideas remain useful as research history. They should not be treated as foundation contracts for the new Venture Engine.

Historical docs may inform examples, copy, and lessons learned, but new contracts must start from this recalibration:

- blank-slate ventures are first-class
- agent suggestions are candidates only
- CEO promotion gates are mandatory
- autonomy is domain-based
- revenue validation drives progression

## Future PR Sequence

Next PR:

- `feat(ventures): add venture lifecycle and safe autonomy contracts`

Then:

- venture cards read-only
- manual venture creation form
- editable venture cards
- agent-generated venture suggestions
- persistence with Supabase/RLS
- reporting and autonomy upgrades
