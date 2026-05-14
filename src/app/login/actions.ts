"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasOwnerAuthConfig, isOwnerUser } from "@/server/auth/owner";
import { asRoute, defaultPrivatePath, normalizePrivateRedirectPath } from "@/server/auth/redirects";

export type LoginFormState = {
  error?: string;
  email?: string;
  nextPath: string;
};

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Entre un courriel valide.")
    .max(254, "Le courriel est trop long.")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Entre ton mot de passe.").max(256, "Le mot de passe est trop long."),
  nextPath: z.string().optional(),
});

function getFieldValue(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value : "";
}

export async function signInAction(previousState: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    email: getFieldValue(formData, "email"),
    password: getFieldValue(formData, "password"),
    nextPath: getFieldValue(formData, "nextPath"),
  });

  const nextPath = normalizePrivateRedirectPath(parsed.success ? parsed.data.nextPath : previousState.nextPath);
  const email = parsed.success ? parsed.data.email : getFieldValue(formData, "email").trim().toLowerCase();

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Impossible de valider les informations.";

    return {
      error: firstIssue,
      email,
      nextPath,
    };
  }

  if (!hasOwnerAuthConfig()) {
    return {
      error: "La connexion privée n'est pas disponible pour le moment.",
      email: parsed.data.email,
      nextPath,
    };
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;

  try {
    supabase = await createServerSupabaseClient();
  } catch (error) {
    if (error instanceof Error && error.message === "Supabase public environment variables are missing.") {
      return {
        error: "La connexion privée n'est pas disponible sur ce déploiement.",
        email: parsed.data.email,
        nextPath,
      };
    }

    throw error;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !user) {
    return {
      error: "Courriel ou mot de passe invalide.",
      email: parsed.data.email,
      nextPath,
    };
  }

  if (!isOwnerUser(user)) {
    await supabase.auth.signOut();

    return {
      error: "Accès réservé. Ce compte ne peut pas ouvrir Michael HQ.",
      email: parsed.data.email,
      nextPath,
    };
  }

  redirect(asRoute(nextPath || defaultPrivatePath));
}
