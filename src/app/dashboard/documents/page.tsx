import type { Route } from "next";
import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Clock, FileText, FolderLock } from "lucide-react";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";
import { signOutAction } from "@/server/auth/actions";

export const dynamic = "force-dynamic";

type LocalDocument = {
  id: string;
  filename: string;
  hat: string;
  created_at: string;
};

async function readLocalDocuments(): Promise<LocalDocument[]> {
  const dbPath = path.join(process.cwd(), "db", "documents.json");

  try {
    const content = await fs.readFile(dbPath, "utf-8");
    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter((doc): doc is LocalDocument => {
      if (!doc || typeof doc !== "object") return false;

      const candidate = doc as Partial<LocalDocument>;

      return (
        typeof candidate.id === "string" &&
        typeof candidate.filename === "string" &&
        typeof candidate.hat === "string" &&
        typeof candidate.created_at === "string"
      );
    });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;

    if (code !== "ENOENT") {
      console.error("Erreur lors de la lecture de la base locale:", error);
    }

    return [];
  }
}

export default async function DocumentsDashboard() {
  const access = await requireOwnerAccess("/dashboard/documents");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const documents = await readLocalDocuments();
  const stats = documents.reduce<Record<string, number>>((acc, doc) => {
    acc[doc.hat] = (acc[doc.hat] || 0) + 1;
    return acc;
  }, {});

  const hats = ["suivia", "mcl", "hq", "personal"];
  const hatLabels: Record<string, string> = {
    suivia: "Suivia",
    mcl: "MCL",
    hq: "HQ",
    personal: "Personnel",
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-lg border border-neutral-800 bg-neutral-950/90 p-5 shadow-2xl shadow-amber-950/10">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <Link
                href={"/hq" as Route}
                className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300 transition hover:text-amber-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour au HQ privé
              </Link>
              <div className="mt-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <FolderLock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-500">Documents</p>
                  <h1 className="mt-1 text-3xl font-bold text-white">Coffre documentaire privé</h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
                    Notes, décisions, SOPs et fichiers utiles à Joris. Accès réservé au propriétaire de Michael HQ.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:items-center">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                <span className="block text-xs text-emerald-300">Statut</span>
                <span className="text-sm font-bold text-emerald-100">Session privée active</span>
              </div>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 px-4 text-sm font-bold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-900 sm:w-auto"
                >
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {hats.map((hat) => (
            <article key={hat} className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-neutral-500">{hatLabels[hat]}</div>
                  <div className="mt-2 text-3xl font-black text-white">{stats[hat] || 0}</div>
                </div>
                <FileText className="h-5 w-5 text-amber-300" />
              </div>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/80">
          <div className="border-b border-neutral-800 px-5 py-4">
            <h2 className="font-bold text-white">Derniers documents traités</h2>
            <p className="mt-1 text-sm text-neutral-500">Stockage local sécurisé, prêt pour la mémoire de Joris.</p>
          </div>

          {documents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-500">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-white">Aucun document pour le moment.</p>
                <p className="mt-1 max-w-md text-sm leading-6 text-neutral-500">
                  Quand Joris traite une note, une décision ou une SOP, elle va apparaître ici avec son projet.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-neutral-900 text-xs font-bold uppercase text-neutral-500">
                  <tr>
                    <th className="px-5 py-4">Nom du fichier</th>
                    <th className="px-5 py-4">Projet</th>
                    <th className="px-5 py-4">Date de traitement</th>
                    <th className="px-5 py-4 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="transition-colors hover:bg-neutral-900/70">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-amber-300">
                            <FileText className="h-4 w-4" />
                          </div>
                          <span className="font-semibold text-neutral-100">{doc.filename}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[11px] font-bold uppercase text-neutral-300">
                          {hatLabels[doc.hat] ?? doc.hat}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-neutral-400">
                        {new Date(doc.created_at).toLocaleString("fr-CA", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Archivé local
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
