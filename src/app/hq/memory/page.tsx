import type { Route } from "next";
import { ShieldCheck, Clock, FileText, BookOpen, StickyNote, Link2 } from "lucide-react";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import {
  HqMetric,
  HqPageHeader,
  HqPageShell,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";
import { requireOwnerAccess } from "@/server/auth/owner";
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

  const entries = listAllVaultEntriesForWorkspace("michael-hq");
  const verifiedCount = entries.filter((e) => e.trustLevel === "verified").length;
  const proposedCount = entries.filter((e) => e.trustLevel === "proposed").length;

  return (
    <HqPageShell size="narrow">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Memory Vault"
        icon={ShieldCheck}
        tone="emerald"
        title="Memory Vault"
        description={
          <>
          Mémoire opérationnelle workspace-scoped. Seules les entrées{" "}
          <span className="text-emerald-400">vérifiées</span> sont injectées dans le contexte de Joris.
          </>
        }
      >
        <HqSummaryRail>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Vault
          </p>
          <div className="mt-3 grid gap-2">
            <HqMetric label="Total" value={entries.length} />
            <HqMetric label="Vérifiés" value={verifiedCount} tone="emerald" />
            <HqMetric label="En attente" value={proposedCount} tone="amber" />
          </div>
        </HqSummaryRail>
      </HqPageHeader>

      <HqWidget title="Entrées mémoire" eyebrow="Read-only context" icon={BookOpen}>
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-8 text-center">
            <p className="text-sm text-neutral-500">Aucune entrée dans la vault pour ce workspace.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry) => (
              <MemoryEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </HqWidget>

      <p className="mt-8 text-center text-xs text-neutral-700">
        Vue lecture seule · Persistance Supabase verrouillée jusqu&apos;au prochain mandat
      </p>
    </HqPageShell>
  );
}
