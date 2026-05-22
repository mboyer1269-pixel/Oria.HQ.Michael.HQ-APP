import type { Route } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import {
  LOCAL_RUNTIME_ID,
  LOCAL_RUNTIME_VERSION,
  RUNTIME_HEALTH_ECHO_SKILL_ID,
  buildMockLocalRuntimeInstruction,
  runLocalRuntimeInstruction,
  verifyMockLocalRuntimeResult,
} from "@/server/runtime/local-runtime";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";

export const dynamic = "force-dynamic";

type StatusLevel = "enabled" | "locked" | "partial";

type StatusItem = {
  label: string;
  value: string;
  level: StatusLevel;
  note?: string;
};

const LEVEL_STYLES: Record<StatusLevel, { badge: string; dot: string }> = {
  enabled: {
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  partial: {
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    dot: "bg-amber-400",
  },
  locked: {
    badge: "border-red-500/20 bg-red-500/10 text-red-300",
    dot: "bg-red-400",
  },
};

const LEVEL_LABEL: Record<StatusLevel, string> = {
  enabled: "disponible",
  partial: "partiel",
  locked: "verrouillé",
};

const DEPLOYMENT_PHASES = [
  { phase: "0", label: "Plan ratifié", done: true },
  { phase: "1", label: "Prototype local", done: true },
  { phase: "2", label: "Canary echo sur VPS", done: false },
  { phase: "3", label: "Premier skill read-only", done: false },
  { phase: "4", label: "Persistance Supabase", done: false },
  { phase: "5", label: "Red Team pass", done: false },
  { phase: "6", label: "Live unlock (par skill)", done: false },
];

function runCanaryCheck() {
  try {
    const now = new Date();
    const instruction = buildMockLocalRuntimeInstruction({
      instructionId: `hq-status-check-${now.getTime()}`,
      now,
      ttlSeconds: 120,
      inputPayload: { message: "hq-status-ping" },
    });
    const result = runLocalRuntimeInstruction(instruction, { now });
    const verified = verifyMockLocalRuntimeResult(result);
    return {
      ok: result.outcome === "completed" && verified,
      outcome: result.outcome,
      verified,
    };
  } catch {
    return { ok: false, outcome: "error" as const, verified: false };
  }
}

export default async function RuntimePage() {
  const access = await requireOwnerAccess("/hq/runtime");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const canary = runCanaryCheck();

  const statusItems: StatusItem[] = [
    {
      label: "Prototype local",
      value: `${LOCAL_RUNTIME_ID} · ${LOCAL_RUNTIME_VERSION}`,
      level: "enabled",
      note: "In-process, no VPS",
    },
    {
      label: "Canary skill",
      value: RUNTIME_HEALTH_ECHO_SKILL_ID,
      level: "enabled",
      note: "Echo only — zero side effects",
    },
    {
      label: "Signature",
      value: "mock-local:v1 (HMAC-SHA256)",
      level: "partial",
      note: "Mock key — real secret at deploy time",
    },
    {
      label: "Exécuteur live",
      value: "mode: live — rejeté",
      level: "locked",
      note: "Locked through Phase 5",
    },
    {
      label: "VPS",
      value: "Non déployé",
      level: "locked",
      note: "Phase 2+",
    },
    {
      label: "Persistance / idempotency",
      value: "Non câblée",
      level: "locked",
      note: "Phase 4 prerequisite",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={"/hq" as Route}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Michael HQ
          </Link>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-300">
            <Server className="h-3.5 w-3.5" />
            Runtime Status
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
            Runtime Oria
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
            Statut du plan d&apos;exécution agent. Phase 1 — prototype local actif. L&apos;exécuteur
            live reste verrouillé jusqu&apos;au Red Team pass (Phase 5).
          </p>
        </div>

        <aside className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 sm:w-52">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Canary check
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {canary.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <span className={canary.ok ? "text-emerald-300" : "text-red-300"}>
                {canary.ok ? "Round-trip OK" : "Échec"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {canary.verified ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <span className={canary.verified ? "text-emerald-300" : "text-red-300"}>
                {canary.verified ? "Signature vérifiée" : "Signature invalide"}
              </span>
            </div>
          </div>
        </aside>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          État du runtime
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statusItems.map((item) => {
            const styles = LEVEL_STYLES[item.level];
            return (
              <div
                key={item.label}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles.badge}`}
                  >
                    <span
                      className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${styles.dot}`}
                    />
                    {LEVEL_LABEL[item.level]}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-neutral-300">{item.value}</p>
                {item.note && (
                  <p className="mt-1.5 text-xs text-neutral-500">{item.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Plan de déploiement — 7 phases
        </h2>
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/70">
          {DEPLOYMENT_PHASES.map((phase, index) => (
            <div
              key={phase.phase}
              className={`flex items-center gap-4 px-4 py-3 ${
                index < DEPLOYMENT_PHASES.length - 1 ? "border-b border-neutral-800" : ""
              } ${phase.done ? "bg-emerald-500/5" : ""}`}
            >
              <span
                className={`shrink-0 font-mono text-xs ${
                  phase.done ? "text-emerald-400" : "text-neutral-600"
                }`}
              >
                {phase.done ? <CheckCircle2 className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
              </span>
              <span
                className={`text-xs font-medium uppercase tracking-[0.12em] ${
                  phase.done ? "text-emerald-300" : "text-neutral-500"
                }`}
              >
                Phase {phase.phase}
              </span>
              <span
                className={`text-sm ${phase.done ? "text-white" : "text-neutral-500"}`}
              >
                {phase.label}
              </span>
              {phase.done && (
                <span className="ml-auto shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                  fait
                </span>
              )}
              {!phase.done && phase.phase === "2" && (
                <span className="ml-auto shrink-0 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                  suivant
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Prochains déverrouillages
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-semibold text-amber-300">Audit Codex (Phase 1)</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Revue de sécurité de <span className="font-mono">local-runtime.ts</span> — vérification
              du chemin de signature, rejets de la gate sequence, et absence de side effects. Prérequis
              avant tout endpoint API.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-700/50 bg-neutral-900/40 p-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-neutral-400" />
              <p className="text-sm font-semibold text-neutral-300">Endpoint local (Phase 1 → 2)</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Route locale <span className="font-mono">POST /api/runtime/echo</span> wrappant{" "}
              <span className="font-mono">runLocalRuntimeInstruction</span>. Dry-run seulement.
              Nécessite l&apos;audit Codex d&apos;abord.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Contrat runtime
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Signature", value: "HMAC-SHA256" },
            { label: "TTL dry-run", value: "120 s" },
            { label: "TTL live (futur)", value: "30–60 s" },
            { label: "Heartbeat", value: "30 s / stale 90 s" },
            { label: "Transport (futur)", value: "HTTP webhooks" },
            { label: "Canary skill", value: RUNTIME_HEALTH_ECHO_SKILL_ID },
            { label: "Node", value: "Single node (Phase 2)" },
            { label: "Live unlock", value: "Phase 6 — per skill" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-2">
              <p className="text-neutral-500">{item.label}</p>
              <p className="mt-0.5 font-mono text-neutral-200">{item.value}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
