import {
  Activity,
  Bot,
  CheckCircle2,
  ClipboardList,
  DatabaseZap,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { agentRegistry } from "@/features/agents/seed";
import { skillsCatalog } from "@/features/skills/seed";
import { summarizeMissions } from "@/features/missions/summary";
import {
  calendarBookRequiresDecisionAndAction,
  countAgentsByStatus,
  countSkillsBySideEffect,
  countSkillsByStatus,
  OPERATOR_GUARDRAIL_CODES,
} from "@/features/hq/operator-snapshot";
import { listMissionsForWorkspace } from "@/server/missions";
import {
  LOCAL_RUNTIME_ID,
  LOCAL_RUNTIME_VERSION,
  RUNTIME_HEALTH_ECHO_SKILL_ID,
} from "@/server/runtime/local-runtime";

type SnapshotLevel = "enabled" | "locked" | "partial";

const LEVEL_STYLES: Record<SnapshotLevel, { badge: string; dot: string; text: string }> = {
  enabled: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
    text: "actif",
  },
  locked: {
    badge: "border-red-500/20 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
    text: "verrouillé",
  },
  partial: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
    text: "partiel",
  },
};

const GUARDRAIL_ITEMS = [
  { label: "Exécution live bloquée", code: "LIVE_MODE_NOT_SUPPORTED" },
  { label: "Approbation client rejetée", code: "APPROVAL_SOURCE_NOT_TRUSTED" },
  { label: "Skills à effet / externes bloqués sans approbation", code: "EFFECTFUL_SKILL_REQUIRES_APPROVAL" },
  { label: "Skill non supporté bloqué", code: "UNSUPPORTED_SKILL" },
  { label: "Ledger requis pour tout effet", code: "LEDGER_REQUIRED_FOR_EFFECT" },
] satisfies { label: string; code: (typeof OPERATOR_GUARDRAIL_CODES)[number] }[];

function StatusPill({ level, label }: { level: SnapshotLevel; label?: string }) {
  const style = LEVEL_STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {label ?? style.text}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</p>
      <p className="mt-1 tabular-nums text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function FactRow({ label, value, level }: { label: string; value: string; level: SnapshotLevel }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-neutral-800 py-2.5 last:border-0">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-right text-sm font-medium text-white">{value}</span>
      <div className="justify-self-end">
        <StatusPill level={level} />
      </div>
    </div>
  );
}

export async function OperatorSnapshot() {
  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
  const { missions, source } = await listMissionsForWorkspace({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  });

  const missionSummary = summarizeMissions(missions);
  const agentCounts = countAgentsByStatus(agentRegistry);
  const skillStatusCounts = countSkillsByStatus(skillsCatalog);
  const skillSideEffectCounts = countSkillsBySideEffect(skillsCatalog);
  const calendarLedgerReady = calendarBookRequiresDecisionAndAction(skillsCatalog);

  return (
    <section
      id="operator-snapshot"
      aria-label="Aperçu opérateur HQ"
      className="scroll-mt-6 rounded-lg border border-neutral-800 bg-neutral-950/80 p-4 md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Activity className="h-3.5 w-3.5" />
            Aperçu opérateur
          </div>
          <h2 className="mt-4 text-2xl font-semibold text-white md:text-3xl">
            Ledger, runtime et garde-fous visibles.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">
            Aperçu en lecture seule du workspace actif. Il expose ce qui est actif, verrouillé ou partiel sans déclencher
            d&apos;exécution, de migration ou de route runtime.
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">Workspace</p>
          <p className="mt-1 font-mono text-sm text-white">{activeWorkspace.id}</p>
          <p className="mt-1 text-xs text-neutral-500">Missions : {source === "supabase" ? "Supabase" : "locale"}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Route className="h-4 w-4 text-emerald-300" />
              <h3 className="font-semibold text-white">Mode runtime</h3>
            </div>
            <StatusPill level="locked" label="lecture seule" />
          </div>
          <FactRow label="Runtime" value="prototype local" level="enabled" />
          <FactRow label="Exécuteur live" value="verrouillé" level="locked" />
          <FactRow label="Endpoint API" value="non exposé" level="locked" />
          <FactRow label="VPS" value="non déployé" level="locked" />
          <FactRow label="Canary" value={RUNTIME_HEALTH_ECHO_SKILL_ID} level="enabled" />
          <FactRow label="Mode" value="dry-run / lecture seule" level="partial" />
          <p className="mt-3 font-mono text-xs text-neutral-500">
            {LOCAL_RUNTIME_ID} · {LOCAL_RUNTIME_VERSION}
          </p>
        </article>

        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-amber-300" />
              <h3 className="font-semibold text-white">Santé du ledger</h3>
            </div>
            <StatusPill level="partial" />
          </div>
          <FactRow
            label="calendar.book exige"
            value={calendarLedgerReady ? "décision + action" : "contrat ledger manquant"}
            level={calendarLedgerReady ? "enabled" : "locked"}
          />
          <FactRow label="Décision avant création" value="actif" level="enabled" />
          <FactRow label="Action après création" value="actif" level="enabled" />
          <FactRow label="Événements bornés au workspace" value="actif" level="enabled" />
          <FactRow label="Risque restant" value="pas encore de transaction multi-système" level="partial" />
        </article>

        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <h3 className="font-semibold text-white">Santé des garde-fous</h3>
            </div>
            <StatusPill level="enabled" />
          </div>
          <div className="space-y-2">
            {GUARDRAIL_ITEMS.map((item) => (
              <div key={item.code} className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2">
                <p className="text-xs font-medium text-white">{item.label}</p>
                <p className="mt-1 font-mono text-[11px] text-emerald-200">{item.code}</p>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-amber-300" />
            <h3 className="font-semibold text-white">Aperçu missions</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="total" value={missionSummary.total} />
            <Metric label="en attente" value={missionSummary.draft + missionSummary.queued} />
            <Metric label="en cours" value={missionSummary.running} />
            <Metric label="à approuver" value={missionSummary.needs_approval} />
            <Metric label="terminées" value={missionSummary.completed} />
            <Metric label="échouées" value={missionSummary.failed} />
            <Metric label="annulées" value={missionSummary.cancelled} />
          </div>
        </article>

        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Bot className="h-4 w-4 text-emerald-300" />
            <h3 className="font-semibold text-white">Aperçu agents</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="actifs" value={agentCounts.active} />
            <Metric label="standby" value={agentCounts.standby} />
            <Metric label="planifiés" value={agentCounts.planned} />
            <Metric label="verrouillés" value={agentCounts.locked} />
          </div>
        </article>

        <article className="rounded-lg border border-neutral-800 bg-neutral-900/45 p-4">
          <div className="mb-3 flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-red-300" />
            <h3 className="font-semibold text-white">Aperçu skills</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="actifs" value={skillStatusCounts.active} />
            <Metric label="partiels" value={skillStatusCounts.partial} />
            <Metric label="planifiés" value={skillStatusCounts.planned} />
            <Metric label="lecture seule" value={skillSideEffectCounts.none} />
            <Metric label="brouillon interne" value={skillSideEffectCounts["internal-draft"]} />
            <Metric label="écriture réversible" value={skillSideEffectCounts["reversible-write"]} />
            <Metric label="externe irréversible" value={skillSideEffectCounts["irreversible-external"]} />
          </div>
        </article>
      </div>

      <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p className="text-sm leading-6 text-amber-50/80">
            Prochaine étape envisagée : frontière transactionnelle (création calendrier + écritures ledger). Cet aperçu
            ne déverrouille aucune exécution live.
          </p>
        </div>
      </div>
    </section>
  );
}
