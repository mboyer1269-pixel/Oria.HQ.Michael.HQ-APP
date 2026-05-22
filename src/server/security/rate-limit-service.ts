import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import {
  checkRateLimit,
  DEFAULT_RATE_LIMIT_CONFIG,
  type MissionRateLimitConfig,
} from "@/server/missions/idempotency-contract";
import { createOptionalSupabaseAdminClient, hasSupabaseAdminConfig } from "@/server/supabase/admin";

export class RateLimitServiceError extends Error {
  constructor(
    message: string,
    public readonly code: "RATE_LIMIT_UNAVAILABLE" | "RATE_LIMIT_WRITE_FAILED",
  ) {
    super(message);
    this.name = "RateLimitServiceError";
  }
}

export type SharedRateLimitConfig = MissionRateLimitConfig;

export const CONTACT_POST_RATE_LIMIT_CONFIG: SharedRateLimitConfig = {
  maxAttempts: 5,
  windowSeconds: 15 * 60,
};

export const CONTACT_POST_RATE_LIMIT_SCOPE = "api.contact.post";

type LocalRateLimitEvent = {
  scope: string;
  bucketKey: string;
  createdAt: string;
};

const localRateLimitEvents: LocalRateLimitEvent[] = [];

export type SharedRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function buildBucketId(scope: string, bucketKey: string) {
  return `${scope}:${bucketKey}`;
}

async function loadAttemptTimestamps(
  scope: string,
  bucketKey: string,
  windowSeconds: number,
  now: Date,
): Promise<string[]> {
  const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString();

  if (hasSupabaseAdminConfig()) {
    const supabase = createOptionalSupabaseAdminClient();
    if (!supabase) {
      throw new RateLimitServiceError("Supabase client unavailable.", "RATE_LIMIT_UNAVAILABLE");
    }

    const { data, error } = await supabase
      .from("api_rate_limit_events")
      .select("created_at")
      .eq("scope", scope)
      .eq("bucket_key", bucketKey)
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true });

    if (error) {
      throw new RateLimitServiceError(error.message, "RATE_LIMIT_WRITE_FAILED");
    }

    return (data ?? []).map((row) => row.created_at);
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new RateLimitServiceError(
      "Persistent rate limiting requires Supabase configuration in production.",
      "RATE_LIMIT_UNAVAILABLE",
    );
  }

  return localRateLimitEvents
    .filter(
      (event) =>
        event.scope === scope &&
        event.bucketKey === bucketKey &&
        event.createdAt >= windowStart,
    )
    .map((event) => event.createdAt);
}

async function recordRateLimitAttempt(scope: string, bucketKey: string, now: Date): Promise<void> {
  const createdAt = now.toISOString();

  if (hasSupabaseAdminConfig()) {
    const supabase = createOptionalSupabaseAdminClient();
    if (!supabase) {
      throw new RateLimitServiceError("Supabase client unavailable.", "RATE_LIMIT_UNAVAILABLE");
    }

    const { error } = await supabase.from("api_rate_limit_events").insert({
      scope,
      bucket_key: bucketKey,
      created_at: createdAt,
    });

    if (error) {
      throw new RateLimitServiceError(error.message, "RATE_LIMIT_WRITE_FAILED");
    }

    return;
  }

  if (!isLocalPersistenceFallbackAllowed()) {
    throw new RateLimitServiceError(
      "Persistent rate limiting requires Supabase configuration in production.",
      "RATE_LIMIT_UNAVAILABLE",
    );
  }

  localRateLimitEvents.push({ scope, bucketKey, createdAt });
}

export async function enforceSharedRateLimit(input: {
  scope: string;
  bucketKey: string;
  config?: SharedRateLimitConfig;
  now?: Date;
}): Promise<SharedRateLimitResult> {
  const config = input.config ?? DEFAULT_RATE_LIMIT_CONFIG;
  const now = input.now ?? new Date();
  const bucketKey = input.bucketKey.trim();

  if (!bucketKey) {
    throw new RateLimitServiceError("Rate limit bucket key is required.", "RATE_LIMIT_UNAVAILABLE");
  }

  const attemptTimestamps = await loadAttemptTimestamps(
    input.scope,
    bucketKey,
    config.windowSeconds,
    now,
  );

  const check = checkRateLimit(
    {
      workspaceId: buildBucketId(input.scope, bucketKey),
      attemptTimestamps,
      windowSeconds: config.windowSeconds,
    },
    config,
    now,
  );

  if (!check.allowed) {
    return { allowed: false, retryAfterSeconds: check.retryAfterSeconds };
  }

  await recordRateLimitAttempt(input.scope, bucketKey, now);
  return { allowed: true };
}

export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 200);
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 200);

  return "unknown";
}

/** Dev/test helper — clears the local fallback event log only. */
export function resetLocalRateLimitEventsForTests() {
  localRateLimitEvents.length = 0;
}
