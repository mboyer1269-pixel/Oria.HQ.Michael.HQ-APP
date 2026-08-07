import { CheckCircle2, LockKeyhole, ShieldAlert, Sparkles, Zap } from "lucide-react";
import {
  deriveRuntimePosture,
  INVENTORY_SCOPE,
  RUNTIME_CAPABILITIES,
  type RuntimeCapability,
} from "@/core/runtime-capability-inventory";
import { agentRegistry } from "@/features/agents/seed";
import { skillsCatalog } from "@/features/skills/seed";
import { agentLicenseRegistry } from "@/server/agents/agent-execution-license";

// Agentic Factory Status.
//
// Every card is derived from a registry, and each names the registry it counts.
// A card asserting a state with no source behind it is what this panel exists
// to avoid, so there is no hand-written status value here.
//
// The capability counts are scoped: INVENTORY_SCOPE states what the inventory
// covers, and the panel repeats it wherever a number appears, because a count
// without its boundary reads as a total.

const EFFECT_LABEL: Record<RuntimeCapability["effect"], string> = {
  none: "aucun effet",
  internal_write: "écriture interne",
  external_call: "appel externe",
};

const GATE_LABEL: Record<RuntimeCapability["gate"], string> = {
  ceo_approval: "approbation CEO",
  owner_confirmed: "session propriétaire + confirmation",
  owner_session: "session propriétaire seule",
  sentinelle_green_lane: "Sentinelle · zone verte",
  scheduled_pass: "passe planifiée",
  public_unauthenticated: "public, sans session",
};

const NEUTRAL_BADGE = "border-neutral-700 bg-neutral-900 text-neutral-400";
const OK_BADGE = "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
const WARN_BADGE = "border-amber-500/20 bg-amber-500/10 text-amber-300";

type StatusCard = {
  label: string;
  description: string;
  icon: React.ReactNode;
  badge: string;
  /** The value shown on the pill — always counted, never asserted. */
  state: string;
  /** The registry this card counts. Rendered so a reader can check it. */
  source: string;
};

export function AgenticFactoryStatus() {
  const posture = deriveRuntimePosture(RUNTIME_CAPABILITIES);
  const gatedCount = posture.effectful.length - posture.ungatedEffects.length;
  const publicEffects = posture.effectful.filter(
    (capability) => capability.gate === "public_unauthenticated",
  );

  const licensedAgentIds = new Set(agentLicenseRegistry.map((licence) => licence.agentId));
  const licensedAgents = agentRegistry.filter((agent) => licensedAgentIds.has(agent.id));
  const buildableSkills = skillsCatalog.filter((skill) => skill.status !== "planned");

  const statusItems: StatusCard[] = [
    {
      label: "Agents sous licence",
      description: `${licensedAgents.length} des ${agentRegistry.length} agents du registre portent une licence d'exécution`,
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
      badge: licensedAgents.length > 0 ? OK_BADGE : NEUTRAL_BADGE,
      state: `${licensedAgents.length}/${agentRegistry.length}`,
      source: "agentRegistry + agentLicenseRegistry",
    },
    {
      label: "Compétences déclarées",
      description: `${buildableSkills.length} des ${skillsCatalog.length} compétences ne sont plus au stade « planned »`,
      icon: <Sparkles className="h-5 w-5 text-amber-400" />,
      badge: buildableSkills.length > 0 ? WARN_BADGE : NEUTRAL_BADGE,
      state: `${buildableSkills.length}/${skillsCatalog.length}`,
      source: "skillsCatalog",
    },
    {
      label: "Approbation CEO requise",
      description: `${gatedCount} des ${posture.effectful.length} exécuteurs à effet du périmètre passent par une approbation CEO`,
      icon: <ShieldAlert className="h-5 w-5 text-violet-400" />,
      badge: posture.ungatedEffects.length === 0 ? OK_BADGE : WARN_BADGE,
      state: `${gatedCount}/${posture.effectful.length}`,
      source: "RUNTIME_CAPABILITIES (périmètre déclaré)",
    },
    {
      label: "Posture du runtime",
      description: posture.detail,
      icon: <LockKeyhole className="h-5 w-5 text-blue-400" />,
      badge: posture.state === "bounded" ? WARN_BADGE : OK_BADGE,
      state: posture.meta,
      source: "deriveRuntimePosture(RUNTIME_CAPABILITIES)",
    },
    {
      label: "Exécuteurs du périmètre",
      description:
        `${RUNTIME_CAPABILITIES.length} exécuteurs dans le périmètre, dont ${posture.effectful.length} à effet réel` +
        (publicEffects.length > 0
          ? ` · ${publicEffects.length} atteignable(s) sans session`
          : ""),
      icon: <Zap className="h-5 w-5 text-sky-400" />,
      badge: publicEffects.length > 0 ? WARN_BADGE : NEUTRAL_BADGE,
      state: String(RUNTIME_CAPABILITIES.length),
      source: "RUNTIME_CAPABILITIES (périmètre déclaré)",
    },
  ];

  return (
    <section className="rounded-3xl border border-neutral-800 bg-neutral-950/70 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">Antigravity</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Agentic Factory Status</h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-500/20 bg-neutral-500/10 px-3 py-1 text-xs text-neutral-300">
          Chaque carte est comptée depuis un registre
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statusItems.map((item) => (
          <article key={item.label} className="flex flex-col justify-between rounded-2xl border border-neutral-800 bg-neutral-900/70 p-4">
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800/50">
                {item.icon}
              </div>
              <h3 className="font-semibold text-white">{item.label}</h3>
              <p className="mt-1 text-xs leading-5 text-neutral-400">{item.description}</p>
            </div>
            <div>
              <div className={`mt-4 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${item.badge}`}>
                {item.state}
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-neutral-600">source : {item.source}</p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-3 text-[11px] leading-5 text-neutral-400">
        <span className="font-semibold text-neutral-300">Périmètre de l&apos;inventaire —</span>{" "}
        couvre {INVENTORY_SCOPE.covers}. Exclut {INVENTORY_SCOPE.excludes}. Les comptes
        ci-dessus portent sur ce périmètre, pas sur l&apos;ensemble du runtime.
      </p>

      <ul className="mt-3 space-y-2">
        {RUNTIME_CAPABILITIES.map((capability) => (
          <li
            key={capability.id}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-white">{capability.label}</p>
              <span className="text-[11px] text-neutral-400">
                {EFFECT_LABEL[capability.effect]} · {GATE_LABEL[capability.gate]}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{capability.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
