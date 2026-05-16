import { ShieldAlert } from "lucide-react";
import { signOutAction } from "@/server/auth/actions";

type OwnerAccessDeniedProps = {
  email?: string;
};

export function OwnerAccessDenied({ email }: OwnerAccessDeniedProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-8 text-neutral-100 md:py-12">
      <section className="w-full max-w-lg rounded-lg border border-red-500/20 bg-neutral-950/90 p-5 text-center shadow-2xl shadow-red-950/20 sm:p-8">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-300">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <p className="text-xs font-semibold uppercase text-red-300">Accès réservé</p>
        <h1 className="mt-3 text-2xl font-bold text-white">Accès refusé</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">
          Ce compte{email ? ` (${email})` : ""} est connecté, mais il ne peut pas ouvrir ce workspace Oria.
        </p>
        <form action={signOutAction} className="mt-6">
          <button
            type="submit"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-red-400 px-4 py-3 text-sm font-bold text-neutral-950 transition hover:bg-red-300 sm:w-auto"
          >
            Se déconnecter
          </button>
        </form>
      </section>
    </main>
  );
}
