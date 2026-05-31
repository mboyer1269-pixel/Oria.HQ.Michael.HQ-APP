import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

export default async function DocumentsDashboard() {
  const access = await requireOwnerAccess("/dashboard/documents");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-4 py-10 md:px-8">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 md:p-8">
        <Link
          href={"/hq" as Route}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Michael HQ
        </Link>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-white sm:text-4xl">
          Module retiré temporairement
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-400">
          Cette section était une maquette locale non actionnable. Elle sera reconstruite plus tard avec dossiers
          ouvrables, édition, permissions et audit trail.
        </p>
        <Link
          href={"/hq" as Route}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-500 px-4 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
        >
          Retour à Michael HQ
        </Link>
      </section>
    </main>
  );
}
