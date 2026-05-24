import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/server-env";
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
  return Boolean(serverEnv.michaelHqOwnerId || serverEnv.michaelHqOwnerEmail);
}

export function isOwnerUser(user: User) {
  const email = user.email?.trim().toLowerCase();

  return Boolean(
    (serverEnv.michaelHqOwnerId && user.id === serverEnv.michaelHqOwnerId) ||
      (serverEnv.michaelHqOwnerEmail && email === serverEnv.michaelHqOwnerEmail),
  );
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

/** Pour les Route Handlers : même barrière que le HQ, sans redirect HTML. */
export async function requireOwnerApiSession(): Promise<NextResponse | null> {
  const globals = globalThis as typeof globalThis & {
    __ownerApiSessionTestResult?: NextResponse | null;
  };

  if (Object.prototype.hasOwnProperty.call(globals, "__ownerApiSessionTestResult")) {
    return globals.__ownerApiSessionTestResult ?? null;
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
