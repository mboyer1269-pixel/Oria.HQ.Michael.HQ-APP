import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { MichaelHqDatabase } from "@/server/db/types";

export function createBrowserSupabaseClient() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  return createBrowserClient<MichaelHqDatabase>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
