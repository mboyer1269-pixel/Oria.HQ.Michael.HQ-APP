# Advisory skill recipe context v1

## Delivered boundary

`SkillProfile.recipe` is optional metadata on the existing catalog. Only
`spec.draft` has a recipe, original to this repository. Its status remains
**planned**. Agent `skillIds`, licences, runtime handlers and permissions are
unchanged. This is neither a new skill registry nor an execution framework.

`src/core/skills/spec-draft-recipe.ts` contains the exact recipe and its pinned
UTF-8 SHA-256. Source, context and evaluation references are a closed static
allowlist. The composer does not load paths, fetch URLs, import external skills,
read secrets, call a model, grant tools, persist anything or run tests.
`requiredToolIds` is empty: this advisory recipe needs only supplied context.
Evaluation references identify test files; they are not test-pass evidence.

The recipe asks for grounded alternatives, explicit assumptions, a smallest
useful choice and falsifiable acceptance tests. This describes an intended
working method, not an observed improvement in model output.

## Pure preparation contract

`composeSkillRecipeContext` in `src/server/agents/context/skill-recipe-context.ts`
accepts:

- an authenticated server-resolved workspace/mission/version scope;
- projections `{ id, skillIds }` and `{ id, recipe }` from the existing server-
  resolved agent and skill catalogs (never take them from the request body);
- a matching pinned binding containing scope, agent, skill, recipe version and
  content hash;
- at most three scoped excerpts, each at most 2,000 characters, using only
  `mission:objective`, `mission:constraints` or `mission:evidence`;
- an optional smaller output cap; the hard maximum is 8,000 characters.

Every supplied excerpt is explicitly **untrusted**, even if it describes facts.
It is JSON-encoded separately from the static recipe; delimiter characters are
escaped. This prevents delimiter forgery, not every semantic prompt injection.
Downstream model output must still be reviewed and never grant authority.
Foreign scope, duplicate/unknown references, metadata drift, invalid hashes,
mismatched bindings and oversized output are rejected with no partial snapshot.
No excerpts are silently truncated. Absent context remains unknown. Legacy
skills without a recipe return `unavailable: no_recipe`.

The prepared snapshot includes `noExecutionAuthorized: true`, an immutable
binding, exact block and `snapshotHash` (SHA-256 of
`JSON.stringify({ binding, block })`). Integrity checks do not authenticate a
caller; the future server boundary must establish ownership and assignments.

## Not wired — mandatory future integration gate

The composer has **no application runtime caller**. Catalog metadata is not
runtime proof. No UI, Atelier handler, launch path, dispatcher or approval code
is changed by this increment.

Before future runtime use, persist the exact snapshot and bind both its hash
and recipe content hash into the immutable mission payload **before approval**.
Changing the recipe, excerpts, agent, workspace or mission version requires a
new binding/review. Never append a newly composed recipe after approval and
never re-read a moving recipe at launch. Continue to enforce existing licence,
tool, model-consumption, workspace and execution gates independently.

No external skill is admitted by this v1. Future external sources require their
own verified revision, licence and notice review; a URL or licence label alone
does not meet that condition.

## Tests versus runtime evidence

`src/server/agents/context/skill-recipe-context.test.mjs` exercises real pure
composition with synthetic supplied excerpts, including strict rejection,
scope isolation, hash binding, caps, legacy compatibility and injection-marker
separation. These tests do not run an LLM, prove output quality, obtain approval,
execute an agent or constitute an end-to-end mission demonstration.
