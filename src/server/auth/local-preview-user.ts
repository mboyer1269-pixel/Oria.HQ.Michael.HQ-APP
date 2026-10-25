import type { User } from "@supabase/supabase-js";
import { isLocalPreviewSessionAllowed } from "@/server/auth/user-context";

/**
 * Synthetic user for local UI previews only (pages, never API routes).
 * Returns null unless isLocalPreviewSessionAllowed() — off by default and
 * impossible in production / Vercel.
 */
export function getLocalPreviewUser(): User | null {
  if (!isLocalPreviewSessionAllowed()) return null;
  return {
    id: "local-preview",
    email: undefined,
    app_metadata: {},
    user_metadata: {},
    aud: "local-preview",
    created_at: new Date(0).toISOString(),
  } as User;
}
