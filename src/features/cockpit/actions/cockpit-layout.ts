"use server";

import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { requireOwnerAccess } from "@/server/auth/owner";
import { createCockpitLayoutPersistence } from "@/server/cockpit/layout-persistence";
import type { CockpitLayoutRead, CockpitLayoutSave } from "@/features/cockpit/cockpit-layout-contract";

/** Session/owner checks belong to EACH independently invocable server action. */
export async function getCockpitLayout(): Promise<CockpitLayoutRead> {
  const access = await requireOwnerAccess("/hq/cockpit");
  if (access.status === "forbidden") return { status: "forbidden" };
  let client;
  try { client = createOptionalSupabaseAdminClient(); }
  catch { return { status: "unavailable" }; }
  return createCockpitLayoutPersistence(client, access.user.id).read();
}

/** One untrusted preference request; identity is NEVER a client parameter. */
export async function saveCockpitLayout(request: unknown): Promise<CockpitLayoutSave> {
  const access = await requireOwnerAccess("/hq/cockpit");
  if (access.status === "forbidden") return { status: "not_attempted", reason: "forbidden" };
  let client;
  try { client = createOptionalSupabaseAdminClient(); }
  catch { return { status: "not_attempted", reason: "unavailable" }; }
  return createCockpitLayoutPersistence(client, access.user.id).save(request);
}
