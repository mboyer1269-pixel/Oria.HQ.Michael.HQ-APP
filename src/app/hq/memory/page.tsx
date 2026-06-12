import type { Route } from "next";
import { ShieldCheck, Clock, FileText, BookOpen, StickyNote, Link2, Network, Repeat } from "lucide-react";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import {
  HqMetric,
  HqPageHeader,
  HqPageShell,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";
import { MemoryVaultExplorer } from "@/features/memory/components/memory-vault-explorer";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  buildChainlineGraph,
  buildMemoryGraph,
  detectDuplicateMemory,
} from "@/server/memory/memory-graph";
import {
  adaptVaultEntryToMemoryEntry,
  loadFileVaultEntries,
  mergeMemoryEntries,
} from "@/server/memory/memory-file-vault";
import { getLearningLoopReport } from "@/server/memory/learning-loop-service";
import { listAllVaultEntriesForWorkspace } from "@/server/memory/memory-vault-repository";
import type { MemoryVaultEntry, MemoryVaultEntryType, MemoryVaultTrustLevel } from "@/server/memory/memory-vault-types";

export const dynamic = "force-dynamic";

function trustLevelBadge(level: MemoryVaultTrustLevel) {
  const map: Record<MemoryVaultTrustLevel, { label: string; className: string }> = {
    verified: { label: "Vérifié", className: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
    proposed: { label: "Proposé", className: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
    draft: { label: "Draft", className: "bg-neutral-700 text-neutral-400 border border-neutral-600" },
  };
  const { label, className } = map[level];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {level === "verified" && <ShieldCheck className="h-3 w-3" />}
      {label}
    </span>
  );
}

function typeIcon(type: MemoryVaultEntryType) {
  const map: Record<MemoryVaultEntryType, { icon: React.ReactNode; label: string; className: string }> = {
    decision: { icon: <ShieldCheck className="h-3.5 w-3.5" />, label: "Décision", className: "text-violet-400" },
    sop: { icon: <BookOpen className="h-3.5 w-3.5" />, label: "SOP", className: "text-sky-400" },
    note: { icon: <StickyNote className="h-3.5 w-3.5" />, label: "Note", className: "text-amber-400" },
    source: { icon: <Link2 className="h-3.5 w-3.5" />, label: "Source", className: "text-teal-400" },
    doc: { icon: <FileText className="h-3.5 w-3.5" />, label: "Doc", className: "text-neutral-400" },
  };
  const { icon, label, className } = map[type];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}

function MemoryEntryCard({ entry }: { entry: MemoryVaultEntry }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 transition hover:border-neutral-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {typeIcon(entry.type)}
          {trustLevelBadge(entry.trustLevel)}
        </div>
        <span className="flex items-center gap-1 text-xs text-neutral-600">
          <Clock className="h-3 w-3" />
          {entry.updatedAt.slice(0, 10)}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-snug text-white">{entry.title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-neutral-400">{entry.content}</p>
      {entry.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-500">
              #{tag}
            </span>
          ))}
        </div>
      )}
      {entry.sourceRef && (
        <p className="mt-2 truncate text-xs text-neutral-600">
          <span className="text-neutral-500">Ref:</span> {entry.sourceRef}
        </p>
      )}
    </div>
  );
}

export default async function MemoryPage() {
  const access = await requireOwnerAccess("/hq/memory");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const vaultEntries = listAllVaultEntriesForWorkspace("michael-hq");
  const verifiedCount = vaultEntries.filter((e) => e.trustLevel === "verified").length;
  const proposedCount = vaultEntries.filter((e) => e.trustLevel === "proposed").length;

  const fileEntries = await loadFileVaultEntries();
  const allEntries = mergeMemoryEntries(
    fileEntries,
    vaultEntries.map(adaptVaultEntryToMemoryEntry),
  );
  const graph = buildMemoryGraph(allEntries);
  const chainlines = buildChainlineGraph(allEntries);
  const duplicates = detectDuplicateMemory(allEntries);
  const decisionCount = allEntries.filter((e) => e.type === "decision").length;
  const learningLoop = await getLearningLoopReport("michael-hq");

  return (
    <HqPageShell>
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Memory Vault"
        icon={ShieldCheck}
        tone="emerald"
        title="Memory Vault"
        description={
          <>
          Mémoire opérationnelle workspace-scoped : entrées runtime + vault fichiers{" "}
          <code className="text-neutral-500">memory/</code>. Seules les entrées{" "}
          <span className="text-emerald-400">vérifiées</span> sont injectées dans le contexte de Joris.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Vault
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Entrées" value={allEntries.length} />
            <HqMetric label="Décisions" value={decisionCount} tone="violet" />
            <HqMetric label="Liens" value={graph.edges.length} tone="sky" />
            <HqMetric label="Orphelins" value={graph.orphanIds.length} tone={graph.orphanIds.length > 0 ? "amber" : "neutral"} />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <HqWidget
        title="Graphe mémoire"
        eyebrow="Fichiers memory/ + runtime"
        icon={Network}
        tone="emerald"
      >
        <MemoryVaultExplorer entries={allEntries} graph={graph} chainlines={chainlines} />
        {duplicates.length > 0 && (
          <p className="mt-3 text-xs text-amber-400">
            ⚠ {duplicates.length} doublon(s) potentiel(s) :{" "}
            {duplicates.map((d) => d.key).join(", ")}
          </p>
        )}
      </HqWidget>

      <HqWidget
        title="Boucle d'apprentissage"
        eyebrow="Arena → Vault → Agents"
        icon={Repeat}
        tone="violet"
      >
        {learningLoop.signalCount === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-6">
            <p className="text-sm text-neutral-400">
              Aucun verdict Arena en mémoire pour ce processus. La boucle s&apos;active dès que
              l&apos;Arena évalue des candidats : les patterns gagnants et les échecs répétés
              deviennent des leçons proposées ici, à approuver avant injection dans le contexte agent.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-950/60">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-500">
                    <th className="px-3 py-2 font-semibold">Agent</th>
                    <th className="px-3 py-2 font-semibold">Signaux</th>
                    <th className="px-3 py-2 font-semibold">Win rate</th>
                    <th className="px-3 py-2 font-semibold">Score moyen</th>
                    <th className="px-3 py-2 font-semibold">Valeur nette</th>
                    <th className="px-3 py-2 font-semibold">Meilleur ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {learningLoop.summaries.map((summary) => (
                    <tr key={summary.agentKey} className="border-b border-neutral-900 text-neutral-300">
                      <td className="px-3 py-2 font-medium text-white">{summary.agentKey}</td>
                      <td className="px-3 py-2 tabular-nums">{summary.signals}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {summary.winRate === null ? "—" : `${Math.round(summary.winRate * 100)}%`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {summary.averageScore === null ? "—" : summary.averageScore.toFixed(0)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {(summary.totalNetValueCents / 100).toFixed(2)}$
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {summary.bestRoiMultiple === null ? "—" : `${summary.bestRoiMultiple.toFixed(1)}x`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {learningLoop.proposals.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Leçons proposées — approbation CEO requise avant entrée dans la vault
                </p>
                {learningLoop.proposals.map((proposal) => (
                  <div
                    key={proposal.id}
                    className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-300">
                        {proposal.kind}
                      </span>
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                        Proposé
                      </span>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white">{proposal.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-neutral-400">{proposal.content}</p>
                    <p className="mt-2 truncate text-xs text-neutral-600">
                      Candidats: {proposal.sourceRefs.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {learningLoop.duplicatesSkipped > 0 && (
              <p className="text-xs text-neutral-600">
                {learningLoop.duplicatesSkipped} leçon(s) déjà dans la vault — non re-proposées.
              </p>
            )}
          </div>
        )}
      </HqWidget>

      <HqWidget title="Entrées runtime" eyebrow="Contexte Joris (read-only)" icon={BookOpen}>
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-neutral-500">
          <span>{verifiedCount} vérifiées</span>
          <span>·</span>
          <span>{proposedCount} en attente</span>
        </div>
        {vaultEntries.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-8 text-center">
            <p className="text-sm text-neutral-500">Aucune entrée dans la vault pour ce workspace.</p>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {vaultEntries.map((entry) => (
              <MemoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </HqWidget>

      <p className="mt-8 text-center text-xs text-neutral-700">
        Vue lecture seule · Vault fichiers : <code>memory/</code> · Persistance Supabase verrouillée jusqu&apos;au prochain mandat
      </p>
    </HqPageShell>
  );
}
