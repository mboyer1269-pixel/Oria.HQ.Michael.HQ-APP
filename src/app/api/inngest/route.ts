import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/inngest-client";
import { jorisExecuteJob } from "@/server/jobs/joris-execute-job";

// ---------------------------------------------------------------------------
// Inngest webhook handler — registers all background jobs with the Inngest
// platform. This route handles event delivery, job execution, and retries.
//
// In development: connect to the local Inngest dev server at http://localhost:8288
//   npx inngest-cli@latest dev
//
// In production (Vercel): Inngest auto-discovers this route at /api/inngest.
//   Required env vars:
//     INNGEST_EVENT_KEY — your Inngest event signing key
//     INNGEST_SIGNING_KEY — your Inngest webhook signing key
// ---------------------------------------------------------------------------

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [jorisExecuteJob],
});
