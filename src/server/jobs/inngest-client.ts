import { Inngest } from "inngest";

// ---------------------------------------------------------------------------
// Inngest client — single shared instance for all background jobs.
//
// In development (INNGEST_EVENT_KEY not set), Inngest SDK falls back to the
// local dev server (npx inngest-cli@latest dev). Jobs run inline in dev.
//
// In production, set INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY in your
// deployment environment (Vercel env vars).
//
// See: https://www.inngest.com/docs/quick-start
// ---------------------------------------------------------------------------

export const inngest = new Inngest({
  id: "michael-hq",
  name: "Michael HQ",
});
