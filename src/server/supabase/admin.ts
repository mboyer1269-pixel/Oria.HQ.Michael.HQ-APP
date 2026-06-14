// Server-only: this module builds a Supabase client with the service-role key
// (bypasses RLS). It must never be bundled into client code. Importing it from a
// Client Component fails the build instead of leaking the privileged client.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/server-env";
import type { MichaelHqDatabase } from "@/server/db/types";

export function createSupabaseAdminClient() {
  if (!serverEnv.supabaseUrl || !serverEnv.supabaseServiceRoleKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient<MichaelHqDatabase>(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function hasSupabaseAdminConfig() {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseServiceRoleKey);
}

export function createOptionalSupabaseAdminClient() {
  if (!hasSupabaseAdminConfig()) return null;

  return createSupabaseAdminClient();
}
