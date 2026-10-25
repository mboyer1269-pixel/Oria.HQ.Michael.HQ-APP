import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { configuredMemberships, membershipsForUser, resolveAuthzContext, WorkspaceAccessError, type AuthzContext } from "@/server/auth/authz-context";
import { DEFAULT_WORKSPACE_SLUG } from "@/core/workspaces/registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { asRoute, getLoginPath } from "@/server/auth/redirects";

export type OwnerAccess =
  | {
      status: "authorized";
      user: User;
    }
  | {
      status: "forbidden";
      user: User;
    };

export function hasOwnerAuthConfig() {
  return configuredMemberships().some((m) => m.role === "owner" && m.workspaceId === DEFAULT_WORKSPACE_SLUG);
}

/**
 * Legacy owner gate: legacy routes still resolve the default workspace context, so
 * only an owner of that default workspace may pass. Owners of other workspaces must
 * go through requireWorkspaceApiSession, which scopes data to their workspace.
 */
export function isOwnerUser(user: User) {
  return membershipsForUser({ userId: user.id, email: user.email }).some((m) =>
    m.role === "owner" && m.workspaceId === DEFAULT_WORKSPACE_SLUG);
}

export async function getCurrentAuthUser() {
  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "Supabase public environment variables are missing.") {
      return null;
    }

    throw error;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;

  return user;
}

/**
 * The identity to attribute an audited action to: the authenticated user's id.
 *
 * Prefer this over the workspace context's `userId` for ledger attribution.
 * `getServerUserContext()` derives its id from configuration
 * (`MICHAEL_HQ_OWNER_ID`) or the dev fallback, so it names the *configured*
 * owner. `isOwnerUser()` also authorizes on email, so a session can be valid
 * while its Supabase `user.id` differs from the configured id — attributing to
 * configuration would then record an identity that never acted.
 *
 * Returns null when no authenticated session is resolvable (local/dev mode,
 * where the synthetic single-user identity is the honest answer). Callers decide
 * what to record in that case.
 */
export async function getAuthenticatedActorId(): Promise<string | null> {
  const user = await getCurrentAuthUser();
  return user?.id ?? null;
}

export async function requireOwnerAccess(nextPath = "/hq"): Promise<OwnerAccess> {
  const user = await getCurrentAuthUser();

  if (!user) {
    redirect(asRoute(getLoginPath(nextPath)));
  }

  if (!isOwnerUser(user)) {
    return {
      status: "forbidden",
      user,
    };
  }

  return {
    status: "authorized",
    user,
  };
}

/**
 * Pour les Route Handlers : même barrière que le HQ, sans redirect HTML.
 *
 * `__ownerApiSessionTestResult` est un point d'injection de test documenté
 * (`src/server/agents/execution-intent-rail-api.test.mjs`,
 * `src/server/orchestration/paperclip-read.test.mjs`) : la propriété présente
 * vaut « réponse imposée », et `null` vaut « autorisé ».
 *
 * Elle n'est lue **qu'hors production** — même garde explicite que
 * `src/server/arena/get-arena-service.ts`. En production la dérivation
 * n'existe pas : aucune propriété posée sur `globalThis` côté serveur ne peut
 * court-circuiter la vérification de session et d'appartenance ci-dessous.
 * Cette garde est de la défense en profondeur ; aucun module de production ne
 * pose cette propriété aujourd'hui.
 */
export async function requireOwnerApiSession(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") {
    const globals = globalThis as typeof globalThis & {
      __ownerApiSessionTestResult?: NextResponse | null;
    };

    if (Object.prototype.hasOwnProperty.call(globals, "__ownerApiSessionTestResult")) {
      return globals.__ownerApiSessionTestResult ?? null;
    }
  }

  const user = await getCurrentAuthUser();

  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  if (!isOwnerUser(user)) {
    return NextResponse.json({ error: "Accès réservé au propriétaire." }, { status: 403 });
  }

  return null;
}

/** Header takes precedence over query; both are untrusted workspace selectors. */
export async function requireWorkspaceApiSession(request?: Request): Promise<{ ctx: AuthzContext; user: User } | NextResponse> {
  const user = await getCurrentAuthUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  const requested = request?.headers.get("x-oria-workspace") ?? (request ? new URL(request.url).searchParams.get("workspace") : null);
  try {
    return { ctx: resolveAuthzContext({ userId: user.id, email: user.email }, requested ?? undefined), user };
  } catch (error) {
    if (!(error instanceof WorkspaceAccessError)) throw error;
    return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  }
}
