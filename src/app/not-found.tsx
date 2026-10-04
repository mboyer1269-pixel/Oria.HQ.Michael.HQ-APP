import type { Route } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-5 px-4 py-10 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Oria HQ</p>
      <h1 className="text-3xl font-semibold text-white">Page introuvable</h1>
      <p className="text-sm leading-6 text-neutral-400">
        Cette surface n’existe pas ou n’est pas disponible dans ce workspace.
      </p>
      <Link
        href={"/hq" as Route}
        className="mx-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
      >
        Revenir au cockpit
      </Link>
    </main>
  );
}
