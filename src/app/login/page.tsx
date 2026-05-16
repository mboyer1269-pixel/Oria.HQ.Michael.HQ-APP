import { redirect } from "next/navigation";
import { LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";
import { getCurrentAuthUser, isOwnerUser } from "@/server/auth/owner";
import { asRoute, defaultPrivatePath, normalizePrivateRedirectPath } from "@/server/auth/redirects";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requestedNext = Array.isArray(params?.next) ? params.next[0] : params?.next;
  const nextPath = normalizePrivateRedirectPath(requestedNext ?? defaultPrivatePath);
  const user = await getCurrentAuthUser();

  if (user && isOwnerUser(user)) {
    redirect(asRoute(nextPath));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8 text-neutral-100 md:py-12">
      <section className="w-full max-w-md rounded-lg border border-amber-500/20 bg-neutral-950/90 p-5 shadow-2xl shadow-amber-950/20 sm:p-7">
        <div className="mb-7 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div className="inline-flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
              Oria privé
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-amber-300">
              <LockKeyhole className="h-5 w-5" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-neutral-500">Oria · Michael HQ</p>
            <h1 className="text-2xl font-bold text-white sm:text-4xl">Connexion au workspace</h1>
            <p className="text-sm leading-6 text-neutral-400">
              Accès réservé. Entre ton email et ton mot de passe pour ouvrir Michael HQ.
            </p>
          </div>

          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <p>Session privée, réservée au workspace Michael HQ.</p>
            </div>
          </div>
        </div>

        <LoginForm
          initialState={{
            nextPath,
          }}
        />
      </section>
    </main>
  );
}
