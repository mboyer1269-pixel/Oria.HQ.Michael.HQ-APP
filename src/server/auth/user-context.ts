import { serverEnv } from "@/lib/server-env";

// Synthetic single-user identity for local development only. This is NOT a real
// user id (real ids are Supabase UUIDs) and must never back a real deployment.
// Kept as a stable contract value — smoke tests, fixtures, and the auth-context
// contract doc reference "local-michael".
const localUserId = "local-michael";

export type ServerUserContext = {
  userId: string;
  email?: string;
  storagePreference: "local" | "supabase";
};

/**
 * Whether the dev single-user fallback identity may be used when no real owner
 * (MICHAEL_HQ_OWNER_ID) is configured.
 *
 * - Outside production: allowed, so the app runs locally without Supabase/owner
 *   configuration.
 * - In production: refused unless ORIA_ALLOW_DEV_USER_FALLBACK is explicitly set
 *   to "true". This stops a misconfigured production from silently booting on a
 *   fake single-user identity.
 */
export function isDevUserFallbackAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ORIA_ALLOW_DEV_USER_FALLBACK === "true";
}

let warnedDevUserFallback = false;

function warnDevUserFallbackOnce() {
  if (warnedDevUserFallback) return;
  warnedDevUserFallback = true;
  console.warn(
    "[auth] No MICHAEL_HQ_OWNER_ID configured — using the local dev single-user " +
      "fallback identity. Development only; configure a real owner before any " +
      "real deployment.",
  );
}

export function getServerUserContext(): ServerUserContext {
  if (serverEnv.michaelHqOwnerId) {
    return {
      userId: serverEnv.michaelHqOwnerId,
      email: serverEnv.michaelHqOwnerEmail,
      storagePreference: "supabase",
    };
  }

  // No real owner configured. Never fall back silently — and never in production
  // unless explicitly opted in.
  if (!isDevUserFallbackAllowed()) {
    throw new Error(
      "[auth] Refusing the dev single-user fallback identity in production: " +
        "MICHAEL_HQ_OWNER_ID is not set. Configure a real owner, or set " +
        "ORIA_ALLOW_DEV_USER_FALLBACK=true to explicitly allow it (not recommended).",
    );
  }

  warnDevUserFallbackOnce();

  return {
    userId: localUserId,
    email: serverEnv.michaelHqOwnerEmail,
    storagePreference: "local",
  };
}
