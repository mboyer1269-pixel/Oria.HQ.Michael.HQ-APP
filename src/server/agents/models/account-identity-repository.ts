import "server-only";
import { randomUUID } from "node:crypto";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

export type AccountIdentityKey = {
  provider: string;
  workspaceId: string;
  email: string;
};

// Development-only, process-local identities; these do not survive a restart.
const mockAccountIdentities = new Map<string, string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeKey(key: AccountIdentityKey): AccountIdentityKey {
  if (
    !key || typeof key !== "object" ||
    typeof key.provider !== "string" || key.provider.length > 80 ||
    typeof key.workspaceId !== "string" || key.workspaceId.length > 160 ||
    typeof key.email !== "string" || key.email.length > 254
  ) {
    throw new TypeError("Invalid account identity key.");
  }
  const provider = key.provider.trim();
  const workspaceId = key.workspaceId.trim();
  const email = key.email.trim().toLowerCase();
  if (
    !/^[a-z][a-z0-9_-]{0,79}$/.test(provider) ||
    !workspaceId || /\p{Cc}/u.test(workspaceId) ||
    !/^[^\s@]+@[^\s@]+$/.test(email) || /\p{Cc}/u.test(email)
  ) {
    throw new TypeError("Invalid account identity key.");
  }
  return { provider, workspaceId, email };
}

/**
 * Returns a random surrogate for one provider/workspace/email, never the email.
 * Durability requires migration 0029 and the server's Supabase admin client.
 * Concurrent creators retain the existing row; changing the email creates a new identity.
 */
export async function resolveOpaqueAccountId(
  key: AccountIdentityKey,
  clock: () => string = () => new Date().toISOString(),
): Promise<string> {
  const normalized = normalizeKey(key);
  try {
    const supabase = createOptionalSupabaseAdminClient();
    if (supabase) {
      const createdAt = clock();
      if (typeof createdAt !== "string" || createdAt.length > 40 || !Number.isFinite(Date.parse(createdAt))) {
        throw new Error("Invalid identity timestamp.");
      }
      const { error: insertError } = await supabase.from("account_identities").upsert({
        account_id: randomUUID(),
        provider: normalized.provider,
        workspace_id: normalized.workspaceId,
        email: normalized.email,
        created_at: createdAt,
      }, { onConflict: "provider,workspace_id,email", ignoreDuplicates: true });
      if (insertError) throw new Error("Identity insert failed.");

      // A conflict means another caller won. Always read the persisted UUID.
      const { data, error } = await supabase.from("account_identities")
        .select("account_id")
        .eq("provider", normalized.provider)
        .eq("workspace_id", normalized.workspaceId)
        .eq("email", normalized.email)
        .maybeSingle();
      if (error || !data || typeof data.account_id !== "string" || !UUID.test(data.account_id)) {
        throw new Error("Invalid persisted identity.");
      }
      return data.account_id;
    }

    if (!isLocalPersistenceFallbackAllowed()) {
      throw new Error("Identity persistence is unavailable.");
    }
    const localKey = JSON.stringify([normalized.provider, normalized.workspaceId, normalized.email]);
    const existing = mockAccountIdentities.get(localKey);
    if (existing) return existing;
    const accountId = randomUUID();
    mockAccountIdentities.set(localKey, accountId);
    return accountId;
  } catch {
    // Database errors and thrown transport errors can contain the lookup email.
    throw new Error("Account identity persistence failed.");
  }
}

export function __clearMockAccountIdentities(): void {
  mockAccountIdentities.clear();
}
