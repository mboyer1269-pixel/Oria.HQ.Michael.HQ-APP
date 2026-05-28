import {
  Briefcase,
  Rocket,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Target,
  Cpu,
} from "lucide-react";

export function AgenticHoldingPreview() {
  return (
    <section className="mb-12 flex flex-col gap-8 rounded-3xl border border-violet-500/20 bg-violet-950/10 p-6 md:p-8">
      {/* 1. Agentic Holding Overview */}
      <div className="flex flex-col gap-4">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/20 px-3 py-1 text-xs font-medium text-violet-300">
          <Briefcase className="h-3.5 w-3.5" />
          Agentic Holding OS Preview
        </div>
        <h2 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
          Opérations d&apos;Holding Agentique
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-400">
          Oria HQ évolue vers un système d&apos;exploitation d&apos;Holding Agentique.{" "}
          <strong className="text-violet-300 font-medium">Joris</strong> agit en tant que Directeur
          (Mission Router), tandis que les <strong className="text-white font-medium">Agents</strong> sont
          des mini-opérateurs d&apos;entreprise autonomes. Ils utilisent des{" "}
          <strong className="text-emerald-300 font-medium">Boosters</strong> (upgrades de
          capacités) et opèrent via des <strong className="text-amber-300 font-medium">Work Orders</strong> mesurables,
          tout en respectant des portails d&apos;approbation stricts.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 2. Mini-business Agent Cards */}
        <div className="flex flex-col gap-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-300">
            <UsersIcon className="h-4 w-4 text-violet-400" />
            Opérateurs (Mini-business Agents)
          </h3>
          <div className="flex flex-col gap-3">
            <AgentPreviewCard
              name="Innovation Scout"
              objective="Identifier les tendances IA et opportunités de marché"
              profitTarget="0 EUR (Recherche)"
              promotionLevel="L2"
              autonomy="Medium"
              boosters={["Research", "Automation"]}
              currentMission="Analyse du marché des agents MCP"
              nextAction="Générer un rapport d'opportunité"
              approvalRisk="Low"
            />
            <AgentPreviewCard
              name="Revenue Operator"
              objective="Maximiser la monétisation et la conversion"
              profitTarget="10,000 EUR / mois"
              promotionLevel="L3"
              autonomy="High"
              boosters={["Pricing", "Copywriting"]}
              currentMission="Optimisation du tunnel de vente Premium"
              nextAction="Déployer A/B test pricing"
              approvalRisk="High"
            />
            <AgentPreviewCard
              name="Product Builder"
              objective="Livrer des MVPs et fonctionnalités cœur"
              profitTarget="N/A (Cost Center)"
              promotionLevel="L4 (Original Orya)"
              autonomy="High"
              boosters={["QA", "Automation"]}
              currentMission="Lancement du dashboard analytique"
              nextAction="Validation CI/CD"
              approvalRisk="Medium"
            />
          </div>
        </div>

        <div className="flex flex-col gap-8">
          {/* 3. Booster Stack */}
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-300">
              <Zap className="h-4 w-4 text-emerald-400" />
              Stack de Boosters
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <BoosterPreviewCard name="Research Booster" skillArea="Data Analysis" modelTier="Premium" costTier="Medium" expectedOutput="Rapport structuré" />
              <BoosterPreviewCard name="Pricing Booster" skillArea="Strategy" modelTier="Standard" costTier="Low" expectedOutput="Modèle tarifaire" />
              <BoosterPreviewCard name="Copywriting Booster" skillArea="Content" modelTier="Premium" costTier="High" expectedOutput="Landing page copy" />
              <BoosterPreviewCard name="QA Booster" skillArea="Testing" modelTier="Economy" costTier="Low" expectedOutput="Rapport de bugs" />
              <BoosterPreviewCard name="Automation Booster" skillArea="DevOps" modelTier="Standard" costTier="Medium" expectedOutput="Script CI/CD" />
            </div>
          </div>

          {/* 4. Work Order Preview */}
          <div className="flex flex-col gap-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-neutral-300">
              <CheckCircle2 className="h-4 w-4 text-amber-400" />
              Work Orders
            </h3>
            <div className="flex flex-col gap-4">
              {/* Mission Work Order */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                    Mission Work Order
                  </span>
                  <span className="text-xs text-neutral-500">Owner: Innovation Scout</span>
                </div>
                <h4 className="text-sm font-medium text-white">Analyse des LLMs locaux</h4>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <div className="text-neutral-500">Valeur:</div>
                  <div className="text-neutral-300">Learning (High Conf.)</div>
                  <div className="text-neutral-500">Output attendu:</div>
                  <div className="text-neutral-300">Comparatif Markdown</div>
                  <div className="text-neutral-500">Prochaine action:</div>
                  <div className="text-neutral-300">Scraping GitHub</div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3 text-[11px]">
                  <ShieldAlert className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-neutral-400">Gates: None (Low Risk)</span>
                </div>
              </div>

              {/* Venture Work Order */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    Venture Work Order
                  </span>
                  <span className="text-xs text-neutral-500">Owner: Revenue Operator</span>
                </div>
                <h4 className="text-sm font-medium text-white">Lancement Micro-SaaS Analytics</h4>
                <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                  <div className="text-neutral-500">Valeur:</div>
                  <div className="text-emerald-400 font-medium">Revenue (5,000 EUR)</div>
                  <div className="text-neutral-500">Output attendu:</div>
                  <div className="text-neutral-300">MVP déployé</div>
                  <div className="text-neutral-500">Métrique succès:</div>
                  <div className="text-neutral-300">100 clients payants</div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3 text-[11px]">
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-amber-400">Gates: Money, Publishing, Deployment</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Helpers / Subcomponents

function UsersIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function AgentPreviewCard({
  name,
  objective,
  profitTarget,
  promotionLevel,
  autonomy,
  boosters,
  currentMission,
  nextAction,
  approvalRisk,
}: {
  name: string;
  objective: string;
  profitTarget: string;
  promotionLevel: string;
  autonomy: string;
  boosters: string[];
  currentMission: string;
  nextAction: string;
  approvalRisk: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-white">{name}</h4>
          <p className="mt-0.5 text-xs text-neutral-400">{objective}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold text-violet-300">
            {promotionLevel}
          </span>
          <span className="text-[10px] text-neutral-500">Auto: {autonomy}</span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-950/50 p-2 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase text-neutral-500">Profit Target</span>
          <span className="font-medium text-emerald-400">{profitTarget}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase text-neutral-500">Boosters</span>
          <span className="text-neutral-300">{boosters.join(", ")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-baseline gap-2">
          <Target className="h-3 w-3 shrink-0 text-neutral-500" />
          <span className="text-neutral-300 truncate"><span className="text-neutral-500">Mission:</span> {currentMission}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <Rocket className="h-3 w-3 shrink-0 text-neutral-500" />
          <span className="text-neutral-300 truncate"><span className="text-neutral-500">Next:</span> {nextAction}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <ShieldAlert className="h-3 w-3 shrink-0 text-neutral-500" />
          <span className="text-neutral-300"><span className="text-neutral-500">Risk:</span> {approvalRisk}</span>
        </div>
      </div>
    </div>
  );
}

function BoosterPreviewCard({
  name,
  skillArea,
  modelTier,
  costTier,
  expectedOutput,
}: {
  name: string;
  skillArea: string;
  modelTier: string;
  costTier: string;
  expectedOutput: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-white">{name}</span>
        </div>
      </div>
      <div className="text-[11px] text-neutral-400">Area: {skillArea}</div>
      <div className="flex items-center justify-between border-t border-neutral-800 pt-2 text-[10px]">
        <span className="text-neutral-500">
          Tier: <span className="text-neutral-300">{modelTier}</span>
        </span>
        <span className="text-neutral-500">
          Cost: <span className="text-neutral-300">{costTier}</span>
        </span>
      </div>
      <div className="text-[10px] text-neutral-500">
        Output: <span className="text-neutral-300">{expectedOutput}</span>
      </div>
    </div>
  );
}
