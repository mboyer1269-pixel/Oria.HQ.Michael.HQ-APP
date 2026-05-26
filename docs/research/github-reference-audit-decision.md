# GitHub Reference Audit - Decision Plan

Date: 2026-05-25  
Source: `docs/research/github-reference-audit.md`  
Scope: repo decision plan only. No code change, dependency install, runtime, worker, endpoint, deployment, VPS, or secret.

## 1. Adopt Now

### shadcn/ui

Decision: adopt as the standard UI reference for Oria.

Use it for:

- Core UI primitives, form controls, dialogs, tables, sidebars, tabs, menus, and dense operator surfaces.
- Accessibility and interaction conventions.
- Copy-owned component patterns that keep Oria independent from a heavy external design-system runtime.

Guardrail: adopt shadcn as a standard, not as a bulk import mandate. Every component still needs a scoped ticket and review for fit, accessibility, and visual restraint.

### Vercel AI SDK

Decision: approved only for a precise AI implementation ticket.

Use it for:

- Model-call boundaries.
- Structured output.
- Streaming UI where a ticket explicitly requires it.
- Provider abstraction where Oria needs portability.

Guardrail: do not add the AI SDK just because it is approved in principle. No package, provider adapter, stream endpoint, tool-call surface, or agent behavior is added without a ticket that names the AI workflow.

### NextBase

Decision: use as a Supabase/RLS/tests checklist, not as a structure to import.

Use it for:

- Supabase SSR boundary review.
- RLS policy test ideas.
- Server-action validation patterns.
- Auth/data-access separation checklist.
- Cache and test coverage inspiration.

Guardrail: do not copy its monorepo structure, package manager, local Supabase workflow, premium-kit assumptions, or app shell.

## 2. Reference Only

### nextjs/saas-starter

Use as reference for:

- Team and role flows.
- Dashboard/account settings patterns.
- Billing and activity-log concepts.
- Protected route ergonomics.

Do not copy:

- Its auth model.
- Its Drizzle/Postgres schema.
- Its Stripe implementation wholesale.
- Its app structure.

### birobirobiro/awesome-shadcn-ui

Use as reference for:

- Finding candidate shadcn-compatible components.
- Shortlisting UI ideas for tickets.
- Discovering agent, dashboard, calendar, form, and workflow UI patterns.

Do not copy:

- Any listed component without checking license, dependencies, accessibility, maintenance, and design fit.

### PostHog

Use as observability reference only.

Reference areas:

- Product analytics taxonomy.
- Feature flag lifecycle.
- Session replay and event-governance thinking.
- AI observability product model.

Decision: no installation now.

### Langfuse

Use as LLM observability reference only.

Reference areas:

- Trace schema ideas.
- Prompt versioning.
- Evaluation datasets.
- Feedback loops.
- Vercel AI SDK observability posture.

Decision: no installation now.

## 3. Playground Test

These repos must be tested outside Oria before any production-repo integration.

### Mastra

Playground purpose:

- Evaluate TypeScript agent/workflow concepts.
- Study memory, evals, MCP integration, and typed agent composition.

Restriction: no Mastra runtime or framework code enters Oria without a ticket plus audit.

### Trigger.dev

Playground purpose:

- Evaluate durable background jobs, retries, scheduled tasks, and AI workflow execution.

Restriction: no Trigger runtime, worker, queue, scheduled job, endpoint, or deployment enters Oria without a ticket plus audit.

### VoltAgent

Playground purpose:

- Evaluate agent guardrails, observability, RAG UX, and multi-agent orchestration concepts.

Restriction: no VoltAgent framework adoption, managed deploy path, or platform-owned monitoring model enters Oria without a ticket plus audit.

## 4. Later

### n8n

Decision: later.

Reason:

- Strong automation product reference, but too large for MVP.
- License and product scope are poor fits for direct copying.
- It would pull Oria toward workflow-platform scope too early.

Use later for:

- Credential UX inspiration.
- Integration catalog taxonomy.
- Execution history UX.

### vercel/commerce

Decision: later.

Reason:

- Useful only if DADZCO/MUMZCO becomes commerce-led.
- Not central to Oria's workspace-first operator platform.

Use later for:

- Next.js storefront patterns.
- Shopify/product-grid performance ideas.

## 5. Reject / Ignore Now

### vercel/nextjs-subscription-payments

Decision: reject for implementation.

Reason:

- Archived.
- Replaced by `nextjs/saas-starter`.
- Stale Supabase/Stripe patterns would slow the MVP.

Ignore now:

- Any local Supabase setup flow.
- Any Stripe implementation copied from this repo.
- Any env-heavy deployment pattern.

### General ignore list for MVP speed

Ignore now:

- Full agent frameworks.
- Self-hosted observability platforms.
- Workflow engines.
- Ecommerce architecture.
- Archived starters.
- Runtime infrastructure patterns that require workers, queues, cron, Docker, VPS, or deployed services.

## 6. Règles d’intégration

1. No new runtime, worker, self-hosting path, queue, scheduled job, endpoint, or agent framework enters Oria without an explicit ticket and audit.
2. No dependency is added only because a reference repo recommends it.
3. No `package.json` or `package-lock.json` change is allowed from this decision document alone.
4. No external repo is copied wholesale into Oria.
5. All copied code snippets must be traced to license, purpose, and ticket.
6. Shadcn components are allowed only through scoped UI tickets with accessibility and visual-fit review.
7. Vercel AI SDK usage requires a scoped AI ticket naming the model workflow, data contract, error behavior, and observability needs.
8. Supabase/RLS changes must be derived from Oria's existing contracts first; NextBase is a checklist, not an architecture override.
9. Observability concepts from PostHog/Langfuse may inform event and trace design, but neither product is installed now.
10. Playground evaluations must happen outside the production repo and must return a written audit before any Oria integration proposal.
11. Secrets, `.env`, API keys, production credentials, and deployment settings remain out of scope.
12. Any future integration PR must include validation evidence and explain what was copied, referenced, or intentionally rejected.

## 7. Prochains tickets recommandés

### Ticket 1 - UI Standardization Checklist

Goal: define Oria's shadcn/ui adoption checklist.

Scope:

- Allowed component categories.
- Accessibility review requirements.
- Visual-density rules for operator UI.
- Registry/copy ownership rules.

No dependency change unless the ticket explicitly authorizes component installation.

### Ticket 2 - AI SDK Decision Boundary

Goal: define when Oria may use Vercel AI SDK.

Scope:

- Approved AI workflows.
- Provider boundary.
- Structured-output contract.
- Streaming yes/no criteria.
- Error and fallback behavior.

No implementation until a concrete AI feature ticket exists.

### Ticket 3 - Supabase/RLS Checklist From NextBase

Goal: extract a checklist from NextBase patterns without importing structure.

Scope:

- SSR client boundary checklist.
- RLS test checklist.
- Server-action validation checklist.
- Auth/data-access separation review.

No monorepo, package-manager, or local Supabase workflow changes.

### Ticket 4 - Observability Vocabulary

Goal: define Oria's first-party event and AI trace vocabulary using PostHog/Langfuse as references.

Scope:

- Event taxonomy.
- Prompt/trace redaction rules.
- Feedback loop shape.
- What not to log.

No PostHog or Langfuse installation.

### Ticket 5 - Agent Framework Playground Audit

Goal: compare Mastra, Trigger.dev, and VoltAgent outside Oria.

Scope:

- One isolated playground per candidate or one comparative sandbox.
- Runtime requirements.
- Permission-model fit.
- Observability and failure behavior.
- License and self-hosting implications.

No framework code, worker, endpoint, queue, or deployment in Oria.

### Ticket 6 - Later Review For n8n And Commerce

Goal: defer n8n and Vercel Commerce until there is a venture-specific need.

Scope:

- n8n only for automation/product UX reference.
- Vercel Commerce only if DADZCO/MUMZCO becomes commerce-led.

No MVP work should depend on this ticket.
