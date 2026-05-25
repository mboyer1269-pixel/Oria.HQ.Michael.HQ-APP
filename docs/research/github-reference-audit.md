# GitHub Reference Audit - Oria HQ

Date: 2026-05-25  
Scope: read-only GitHub audit for Oria.HQ / michael.hq.app.  
Constraint observed: no code change, no dependency install, no VPS, no deployment, no endpoint, no worker, no secret. This report is the only artifact.

## Executive Decision

### Integrate now

Use these as immediate standards or implementation references in upcoming scoped PRs. Do not vendor entire repositories.

1. `shadcn-ui/ui` - component and registry standard for Oria's Next.js/Tailwind UI.
2. `vercel/ai` - TypeScript AI SDK standard for model calls, structured output, streaming, and future agent UI.
3. `imbhargav5/nextbase-nextjs-supabase-starter` - Supabase SSR, RLS, safe server-action, and test-pattern reference only. Adopt patterns selectively, not its repo structure.

### Reference only

Use these to guide decisions without copying large surfaces.

1. `nextjs/saas-starter` - teams, RBAC, Stripe, dashboard, and activity-log patterns.
2. `birobirobiro/awesome-shadcn-ui` - discovery index for shadcn components and agent UI primitives.
3. `PostHog/posthog` - product analytics, feature flags, session replay, AI observability product model.
4. `langfuse/langfuse` - LLM tracing, prompt management, evals, dataset, and Vercel AI SDK observability model.

### Playground test

Evaluate outside the production repo only after MVP-critical work is stable.

1. `mastra-ai/mastra` - TypeScript agent/workflow framework.
2. `triggerdotdev/trigger.dev` - durable workflows/background jobs for AI tasks.
3. `VoltAgent/voltagent` - agent platform concepts, guardrails, observability, RAG.

### Ignore for MVP speed

Do not integrate during the MVP window.

- `vercel/nextjs-subscription-payments` - archived and explicitly replaced by `nextjs/saas-starter`.
- `n8n-io/n8n` - excellent product, but license and platform size make it a non-fit for copying into Oria.
- `vercel/commerce` - strong ecommerce template, but off-core unless DADZCO/MUMZCO explicitly becomes commerce-first.

## Scoring Method

Score weights:

- Fit with Oria's current stack and workspace-first mission: 30
- Direct acceleration for MVP without architectural dispersion: 25
- License and copyability: 15
- Recent activity and maintainer signal: 15
- Complexity/risk profile: 15

Verdict meanings:

- `ADOPT NOW`: use as a near-term standard or targeted implementation reference.
- `REFERENCE ONLY`: study and selectively copy ideas, not architecture.
- `PLAYGROUND TEST`: test in an isolated playground before any Oria PR.
- `LATER`: potentially useful after MVP constraints relax.
- `REJECT`: do not use for Oria implementation.

## Repository Evaluation

### 1. nextjs/saas-starter

- URL: https://github.com/nextjs/saas-starter
- Utility for Oria HQ: High. Useful for team/user dashboard, basic RBAC, Stripe subscription, route protection, activity log, and SaaS page composition. Less aligned on auth/storage because Oria is Supabase-first.
- Utility for NOORKI / Suivia: High for paid SaaS onboarding, account settings, subscription flows, and activity audit patterns.
- Utility for DADZCO / MUMZCO: Medium. Useful if these become subscription communities or membership products; less useful if they are content/commerce-led first.
- License: MIT.
- Recent activity: Medium. GitHub shows 107 commits, 15.8k stars, and commit activity through 2025-12-11, including security-oriented Next.js updates.
- Stack: Next.js, TypeScript, Postgres, Drizzle, Stripe, shadcn/ui.
- Complexity: Medium. Small enough to read, but still a full starter with auth, billing, teams, and DB assumptions.
- Risks: Drizzle/Postgres patterns can conflict with Oria's Supabase contracts; copying auth or billing wholesale could introduce a second identity/payment model.
- Can copy: Activity-log concepts, team/role flows, protected route layout, Stripe webhook shape, dashboard CRUD ergonomics.
- Must not copy: Its full auth model, database schema, package-manager assumptions, or app shell wholesale.
- Score: 78/100.
- Verdict: `REFERENCE ONLY`.

### 2. vercel/nextjs-subscription-payments

- URL: https://github.com/vercel/nextjs-subscription-payments
- Utility for Oria HQ: Low. Historically relevant for Supabase + Stripe, but GitHub marks it archived and the README says it has been sunset and replaced by `nextjs/saas-starter`.
- Utility for NOORKI / Suivia: Low to medium as a historical Stripe/Supabase reference only.
- Utility for DADZCO / MUMZCO: Low. Billing ideas are generic, but the template is stale.
- License: MIT.
- Recent activity: Low. Archived on 2025-01-23; no active issues or PRs.
- Stack: Next.js, TypeScript, Supabase, PLpgSQL, Stripe, Tailwind.
- Complexity: Medium. The code is not huge, but the local Supabase and Stripe setup is heavier than Oria's current local-fallback dev model.
- Risks: Archived code, outdated Supabase patterns, secret-heavy setup, and replacement by a newer official starter.
- Can copy: Historical subscription table naming and Stripe sync checklist if needed.
- Must not copy: Any live implementation, deploy flow, local Docker/Supabase workflow, or env handling.
- Score: 41/100.
- Verdict: `REJECT`.

### 3. vercel/ai

- URL: https://github.com/vercel/ai
- Utility for Oria HQ: Very high. It directly targets TypeScript AI apps, provider abstraction, structured output, streaming UI, tool calls, and agent-facing interfaces.
- Utility for NOORKI / Suivia: Very high for sales/coaching assistants, call summaries, structured scoring, conversation UI, and provider portability.
- Utility for DADZCO / MUMZCO: High for chat, content generation, guided onboarding, family/community assistants, and structured recommendation flows.
- License: Apache-2.0.
- Recent activity: Very high. GitHub shows 7k+ commits, 24k+ stars, hundreds of PRs, and releases/commits in May 2026.
- Stack: TypeScript monorepo; React/Next.js examples; provider packages for OpenAI, Anthropic, Google, and others; MCP, agents, UI streaming.
- Complexity: Medium-high. Simple API surface for consumers, but the repo itself is large and fast-moving.
- Risks: Provider abstraction can hide model-specific behavior; the default Gateway path may be a vendor choice Oria should make explicitly; frequent releases require version discipline.
- Can copy: Provider abstraction boundary, structured output patterns, tool-call UI patterns, streaming message protocol, examples for Next.js App Router.
- Must not copy: Full monorepo internals, unreleased/canary examples, implicit Vercel AI Gateway dependency, or broad agent abstractions before permission policies are ready.
- Score: 90/100.
- Verdict: `ADOPT NOW`.

### 4. shadcn-ui/ui

- URL: https://github.com/shadcn-ui/ui
- Utility for Oria HQ: Very high. Oria needs quiet, dense, professional operator UI, and shadcn aligns with Tailwind, accessible primitives, copy-owned components, and a registry model.
- Utility for NOORKI / Suivia: High for dashboards, forms, conversation review screens, customer/account surfaces, and admin tooling.
- Utility for DADZCO / MUMZCO: High for polished product UI without a heavy design-system dependency.
- License: MIT.
- Recent activity: Very high. GitHub shows 115k stars, 2k+ commits, releases through 2026-05-21, and active commits in May 2026.
- Stack: TypeScript, React, Tailwind, Radix/Base UI, registry tooling, MDX docs.
- Complexity: Medium. Component consumption is simple; the ecosystem and registry surface are broad.
- Risks: Over-copying community blocks can create generic UI; registry updates can churn styling; unvetted third-party components may have accessibility or maintenance gaps.
- Can copy: Component patterns, accessibility conventions, registry discipline, form/dialog/table/sidebar primitives, token strategy.
- Must not copy: Decorative marketing-heavy blocks, unreviewed registry code, or visual patterns that make Oria feel generic.
- Score: 92/100.
- Verdict: `ADOPT NOW`.

### 5. birobirobiro/awesome-shadcn-ui

- URL: https://github.com/birobirobiro/awesome-shadcn-ui
- Utility for Oria HQ: Medium-high. Strong discovery layer for shadcn-compatible components, agent UI, calendars, dashboards, forms, and workflow builders.
- Utility for NOORKI / Suivia: High for quickly finding conversation, CRM, calendar, and form UI components.
- Utility for DADZCO / MUMZCO: Medium-high for finding landing, community, admin, and ecommerce UI blocks.
- License: MIT.
- Recent activity: High. GitHub shows 19k+ stars, 700+ commits, and updates in April 2026.
- Stack: TypeScript, Next.js, Tailwind, shadcn registry/catalog content.
- Complexity: Low as a reference index; medium risk if components are copied without audit.
- Risks: It is a directory, not a quality gate. Listed projects vary in license, quality, maintenance, and design taste.
- Can copy: Shortlists of candidate components, naming conventions, component-discovery workflow.
- Must not copy: Any listed component without checking its own license, dependencies, accessibility, and maintenance.
- Score: 76/100.
- Verdict: `REFERENCE ONLY`.

### 6. imbhargav5/nextbase-nextjs-supabase-starter

- URL: https://github.com/imbhargav5/nextbase-nextjs-supabase-starter
- Utility for Oria HQ: Very high as a pattern source. It matches Next.js 16, Supabase, TypeScript, Tailwind v4, SSR auth, RLS, migrations, typed DB access, testing, and safe server actions.
- Utility for NOORKI / Suivia: High for authenticated SaaS surfaces, Supabase RLS patterns, onboarding, and tenant-safe data access.
- Utility for DADZCO / MUMZCO: Medium-high for account/profile areas and protected product/community dashboards.
- License: MIT.
- Recent activity: High. GitHub shows active commits in April 2026 and a roadmap tracking Next.js 16, Cache Components, Playwright, and Vitest.
- Stack: Next.js 16, React 19, Supabase, RLS, `@supabase/ssr`, next-safe-action, Zod, TanStack Query, shadcn/ui, Tailwind v4, Turborepo, pnpm, Vitest, Playwright.
- Complexity: High for direct adoption because it is a monorepo starter with its own package manager, tooling, local Supabase workflow, and premium-kit positioning.
- Risks: Direct migration would violate MVP focus; pnpm/Turbo/local Supabase assumptions diverge from Oria's npm monolith and local-persistence fallback; premium kit references are not open-source surface.
- Can copy: Supabase SSR client boundaries, RLS test patterns, server-action validation shape, data-access directory boundaries, cache-component notes, auth route failure handling.
- Must not copy: Monorepo structure, package manager switch, premium features, local Docker/Supabase lifecycle, entire auth implementation.
- Score: 84/100.
- Verdict: `ADOPT NOW`.

### 7. mastra-ai/mastra

- URL: https://github.com/mastra-ai/mastra
- Utility for Oria HQ: High but not immediate. It is directly relevant to agents, workflows, memory, evals, and MCP, but Oria's permissioned runtime contract should not be replaced casually.
- Utility for NOORKI / Suivia: High for agentic sales/coaching workflows, evaluation loops, and tool orchestration.
- Utility for DADZCO / MUMZCO: Medium for multi-step assistant flows and content/workflow agents.
- License: Apache-2.0 for core; enterprise license for `ee/` areas.
- Recent activity: Very high. GitHub shows 24k+ stars, 7k+ commits, 88 releases, and active commits/releases in May 2026.
- Stack: TypeScript, Node.js, agents, workflows, MCP, evals, TTS, LLM integrations.
- Complexity: High. It is a framework, not a small library.
- Risks: Framework adoption could overtake Oria's own workspace/action/permission abstractions; dual-license boundaries require care; fast-moving agent APIs can create churn.
- Can copy: Workflow vocabulary, eval patterns, MCP integration ideas, memory boundaries, examples of typed agent composition.
- Must not copy: Enterprise code, framework ownership of core contracts, hosted/deploy assumptions, or agent builder runtime before Oria permissions are settled.
- Score: 74/100.
- Verdict: `PLAYGROUND TEST`.

### 8. VoltAgent/voltagent

- URL: https://github.com/VoltAgent/voltagent
- Utility for Oria HQ: Medium-high as an agent-platform reference. Useful for observability, guardrails, RAG, multi-agent concepts, and agent deployment UX.
- Utility for NOORKI / Suivia: Medium-high for agent monitoring, sales assistant guardrails, and tool-call visibility.
- Utility for DADZCO / MUMZCO: Medium for assistant workflows and content-agent experiments.
- License: MIT.
- Recent activity: High. GitHub shows 9k+ stars, hundreds of releases, and a latest package release in May 2026.
- Stack: TypeScript, Node.js, AI agents, MCP, observability, RAG, guardrails, multi-agent tooling.
- Complexity: High. Broad platform scope with its own runtime concepts.
- Risks: Could duplicate Oria runtime/ledger/permission concepts; managed deployment messaging is out of scope; smaller ecosystem than Vercel AI or Mastra.
- Can copy: Guardrail taxonomy, agent trace UI ideas, RAG UX patterns, multi-agent orchestration vocabulary.
- Must not copy: Managed deploy assumptions, entire agent framework, platform-owned monitoring model.
- Score: 68/100.
- Verdict: `PLAYGROUND TEST`.

### 9. n8n-io/n8n

- URL: https://github.com/n8n-io/n8n
- Utility for Oria HQ: Medium as a product reference, low as code to copy. It demonstrates workflow automation, integrations, AI workflows, credential UX, and visual flow-building at scale.
- Utility for NOORKI / Suivia: High as an external automation benchmark for CRM and operational integrations.
- Utility for DADZCO / MUMZCO: Medium if those ventures need low-code ops automations later.
- License: Sustainable Use License plus n8n Enterprise License for enterprise files.
- Recent activity: Very high. GitHub shows 190k stars, 20k+ commits, 640 releases, and active commits on 2026-05-25.
- Stack: TypeScript monorepo, Vue UI, Node.js, workflow engine, integrations, AI/LangChain, MCP.
- Complexity: Very high.
- Risks: License is not permissive like MIT/Apache; product scope is enormous; copying internals could create legal and architectural drag; it pushes Oria toward becoming a workflow platform too early.
- Can copy: Product concepts, node/credential UX inspiration, execution history UX, integration marketplace taxonomy.
- Must not copy: Source code, license-restricted enterprise files, workflow engine, self-hosting/deployment model.
- Score: 55/100.
- Verdict: `LATER`.

### 10. vercel/commerce

- URL: https://github.com/vercel/commerce
- Utility for Oria HQ: Low. Ecommerce is not Oria's core operator-platform surface.
- Utility for NOORKI / Suivia: Low unless the product needs checkout/storefront examples.
- Utility for DADZCO / MUMZCO: Medium-high if either becomes commerce-led, especially Shopify storefronts.
- License: MIT.
- Recent activity: Medium. GitHub shows 14k+ stars, 1.4k commits, but the README states Vercel actively maintains only a Shopify version.
- Stack: Next.js App Router, TypeScript, React Server Components, Server Actions, Suspense, Shopify.
- Complexity: Medium-high for non-commerce products because data model and UI are storefront-specific.
- Risks: Distracts from Oria MVP; Shopify dependency and storefront mental model are irrelevant to workspace operations.
- Can copy: App Router ecommerce patterns, product grid performance ideas, server-rendered storefront examples.
- Must not copy: Shopify integration, cart/checkout architecture, storefront-first IA.
- Score: 50/100.
- Verdict: `LATER`.

### 11. PostHog/posthog

- URL: https://github.com/PostHog/posthog
- Utility for Oria HQ: High as a product/observability reference. Useful for analytics, session replay, feature flags, experiments, error tracking, and AI observability posture.
- Utility for NOORKI / Suivia: High for funnel analytics, coaching conversion metrics, product feedback, and feature rollout.
- Utility for DADZCO / MUMZCO: High for content/product analytics, community retention, experiments, and surveys.
- License: MIT Expat outside `ee/`; enterprise license applies to `ee/` where present.
- Recent activity: Very high. GitHub shows 34k+ stars, many open PRs/issues, and an active multi-language monorepo.
- Stack: Python, TypeScript, Rust, ClickHouse, product analytics, feature flags, surveys, session replay, AI observability.
- Complexity: Very high. This is a platform, not a drop-in library.
- Risks: Self-hosting is explicitly advanced and limited; copying server code is unnecessary; privacy and event taxonomy must be designed before instrumentation.
- Can copy: Event taxonomy thinking, feature flag lifecycle, onboarding analytics, AI observability product concepts, privacy-conscious product measurement model.
- Must not copy: Backend platform, self-hosting script, enterprise code, broad event capture without data governance.
- Score: 72/100.
- Verdict: `REFERENCE ONLY`.

### 12. triggerdotdev/trigger.dev

- URL: https://github.com/triggerdotdev/trigger.dev
- Utility for Oria HQ: High for future durable background jobs, scheduled AI workflows, retries, queues, and agent task orchestration.
- Utility for NOORKI / Suivia: High for follow-up automations, reminders, enrichment jobs, long-running analysis, and workflow retries.
- Utility for DADZCO / MUMZCO: Medium-high for scheduled content, community workflows, and operational automations.
- License: Apache-2.0.
- Recent activity: High. GitHub shows 15k+ stars, 621 releases, and a latest release in May 2026.
- Stack: TypeScript, serverless workflows, background jobs, scheduler, AI agents, MCP, self-hosting via Docker/Kubernetes.
- Complexity: High. It introduces its own deployed runtime and operational model.
- Risks: Violates MVP constraints if adopted now because it implies endpoints/workers/deployment; cloud/runtime coupling must be decided explicitly later.
- Can copy: Job lifecycle concepts, retry/idempotency vocabulary, task dashboard UX, AI workflow examples.
- Must not copy: Deployed runtime, workers, self-hosting stack, or background execution architecture before Oria runtime policy is approved.
- Score: 73/100.
- Verdict: `PLAYGROUND TEST`.

### 13. langfuse/langfuse

- URL: https://github.com/langfuse/langfuse
- Utility for Oria HQ: High for LLM observability, prompt management, evaluation, traces, datasets, and debugging agent/tool calls.
- Utility for NOORKI / Suivia: Very high for call/coaching quality, prompt regression tracking, user feedback, and cost/latency monitoring.
- Utility for DADZCO / MUMZCO: Medium-high for AI content quality, assistant debugging, and prompt/version tracking.
- License: MIT Expat outside `ee/`; enterprise license applies to `ee/`, `web/src/ee/`, and `worker/src/ee/`.
- Recent activity: Very high. GitHub shows 27k+ stars, 7k+ commits, active issues/PRs, and broad integrations.
- Stack: TypeScript/Next.js web app, worker, Docker, ClickHouse, JS/TS and Python SDKs, OpenTelemetry, OpenAI, LangChain, Vercel AI SDK, Mastra integrations.
- Complexity: High. The product is observability infrastructure, not an app starter.
- Risks: Requires credentials and event governance; self-hosting adds Docker/infra; copying platform internals is unnecessary; prompt logging may expose sensitive data if not designed carefully.
- Can copy: Trace schema ideas, prompt/version workflow, eval/dataset lifecycle, user-feedback loop, Vercel AI SDK integration posture.
- Must not copy: Self-hosting stack, `ee` code, raw prompt logging without redaction, hosted product assumptions.
- Score: 79/100.
- Verdict: `REFERENCE ONLY`.

## Cross-Repo Lessons For Oria

1. Keep Oria's core contracts generic. The strongest repos support this: `vercel/ai` abstracts providers, `shadcn-ui/ui` keeps UI copy-owned, and NextBase shows clear trust boundaries.
2. Do not add a second platform inside Oria. n8n, PostHog, Langfuse, Trigger.dev, Mastra, and VoltAgent are valuable, but they can swallow roadmap surface if copied wholesale.
3. The MVP should copy patterns, not architectures. Best near-term wins are small: UI primitives, typed AI outputs, Supabase SSR/RLS boundaries, activity logs, and eval/trace vocabulary.
4. Runtime adapters remain future work. Agent/workflow frameworks should stay in playground until Oria's permission execution behavior is explicitly mandated.
5. Avoid stale official templates. `vercel/nextjs-subscription-payments` is archived and should not influence implementation except as historical context.

## Final Recommendation

The sharpest MVP path is:

1. Standardize Oria UI implementation around `shadcn-ui/ui`.
2. Standardize AI provider/tool-call patterns around `vercel/ai` when the next scoped AI implementation is mandated.
3. Use `nextbase-nextjs-supabase-starter` as a checklist for Supabase SSR, RLS, server-action validation, and tests, without importing its structure.

Use `nextjs/saas-starter`, `awesome-shadcn-ui`, `PostHog`, and `langfuse` as reference material. Test `Mastra`, `Trigger.dev`, and `VoltAgent` outside this repo. Ignore the rest until the MVP no longer depends on speed and scope control.

## Source Links

- https://github.com/nextjs/saas-starter
- https://github.com/vercel/nextjs-subscription-payments
- https://github.com/vercel/ai
- https://github.com/shadcn-ui/ui
- https://github.com/birobirobiro/awesome-shadcn-ui
- https://github.com/imbhargav5/nextbase-nextjs-supabase-starter
- https://github.com/mastra-ai/mastra
- https://github.com/VoltAgent/voltagent
- https://github.com/n8n-io/n8n
- https://github.com/vercel/commerce
- https://github.com/PostHog/posthog
- https://github.com/triggerdotdev/trigger.dev
- https://github.com/langfuse/langfuse
