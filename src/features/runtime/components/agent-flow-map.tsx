"use client";

// Agent Flow Map — live visualization of the controlled execution path:
//   Agents → Gouvernance → Surfaces d'exécution → Ledger (preuve)
//
// RAG-graph style: nodes with live counts, animated edges showing the flow
// direction, and a trace list of recent ledger events mapped onto the path.
// Pure presentation — all data arrives as props from the server page.

import { useMemo, useState } from "react";
import {
  Bot,
  CalendarCheck,
  ListChecks,
  ScrollText,
  SendHorizonal,
  ShieldCheck,
} from "lucide-react";

export type FlowLedgerEvent = {
  id: string;
  agentId?: string;
  actionType: string;
  eventType?: string;
  summary: string;
  createdAt: string;
};

export type AgentFlowData = {
  agents: { id: string; label: string; eventCount: number }[];
  decisions: number;
  actions: number;
  results: number;
  surfaces: { sendDesk: number; calendar: number; missions: number };
  recentEvents: FlowLedgerEvent[];
};

const STAGE_X = { agents: 90, governance: 320, surfaces: 550, ledger: 780 } as const;

function surfaceForActionType(actionType: string): "sendDesk" | "calendar" | "missions" {
  if (actionType.startsWith("outbound.")) return "sendDesk";
  if (actionType.includes("calendar")) return "calendar";
  return "missions";
}

function Node({
  x,
  y,
  label,
  sub,
  active,
  tone,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
  active: boolean;
  tone: "sky" | "amber" | "emerald" | "violet";
}) {
  const tones = {
    sky: { stroke: "rgba(56,189,248,0.55)", fill: "rgba(56,189,248,0.08)", text: "#7dd3fc" },
    amber: { stroke: "rgba(251,191,36,0.55)", fill: "rgba(251,191,36,0.08)", text: "#fcd34d" },
    emerald: { stroke: "rgba(52,211,153,0.55)", fill: "rgba(52,211,153,0.08)", text: "#6ee7b7" },
    violet: { stroke: "rgba(167,139,250,0.55)", fill: "rgba(167,139,250,0.08)", text: "#c4b5fd" },
  }[tone];
  return (
    <g transform={`translate(${x},${y})`}>
      {active ? (
        <rect
          x={-78}
          y={-26}
          width={156}
          height={52}
          rx={14}
          fill="none"
          stroke={tones.stroke}
          strokeWidth={6}
          opacity={0.18}
        />
      ) : null}
      <rect
        x={-74}
        y={-22}
        width={148}
        height={44}
        rx={12}
        fill={tones.fill}
        stroke={tones.stroke}
        strokeWidth={1.2}
      />
      <text x={0} y={-3} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#fafafa">
        {label}
      </text>
      <text x={0} y={12} textAnchor="middle" fontSize={9.5} fill={tones.text}>
        {sub}
      </text>
    </g>
  );
}

function Edge({
  x1,
  y1,
  x2,
  y2,
  active,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  return (
    <g>
      <path d={path} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1.4} />
      {active ? (
        <path
          d={path}
          fill="none"
          stroke="rgba(52,211,153,0.7)"
          strokeWidth={1.6}
          strokeDasharray="6 10"
          className="animate-[flowdash_1.6s_linear_infinite]"
        />
      ) : null}
    </g>
  );
}

export function AgentFlowMap({ data }: { data: AgentFlowData }) {
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const agentYs = useMemo(() => {
    const count = Math.max(data.agents.length, 1);
    return data.agents.map((_, index) => 60 + (index * 280) / Math.max(count - 1, 1));
  }, [data.agents]);

  const hovered = data.recentEvents.find((event) => event.id === hoveredEventId) ?? null;
  const hoveredSurface = hovered ? surfaceForActionType(hovered.actionType) : null;
  const hoveredAgentIndex = hovered
    ? Math.max(
        data.agents.findIndex((agent) => agent.id === hovered.agentId),
        0,
      )
    : -1;

  const surfaceNodes: { key: "sendDesk" | "calendar" | "missions"; label: string; y: number; count: number }[] = [
    { key: "sendDesk", label: "Send Desk", y: 80, count: data.surfaces.sendDesk },
    { key: "calendar", label: "Calendrier", y: 200, count: data.surfaces.calendar },
    { key: "missions", label: "Missions", y: 320, count: data.surfaces.missions },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr,320px]">
      <style>{`@keyframes flowdash { to { stroke-dashoffset: -16; } }`}</style>

      <div className="relative overflow-x-auto rounded-2xl border border-white/[0.07] bg-gradient-to-br from-black/40 via-neutral-950 to-black/30 p-2">
        <svg viewBox="0 0 880 400" className="min-w-[760px]" role="img" aria-label="Chemin d'exécution des agents">
          {/* Column headers */}
          {[
            { x: STAGE_X.agents, label: "AGENTS", icon: "🤖" },
            { x: STAGE_X.governance, label: "GOUVERNANCE", icon: "🛡" },
            { x: STAGE_X.surfaces, label: "EXÉCUTION", icon: "⚡" },
            { x: STAGE_X.ledger, label: "PREUVE", icon: "📜" },
          ].map((column) => (
            <text
              key={column.label}
              x={column.x}
              y={24}
              textAnchor="middle"
              fontSize={9}
              fontWeight={800}
              letterSpacing={2.5}
              fill="rgba(163,163,163,0.7)"
            >
              {column.label}
            </text>
          ))}

          {/* Edges agents -> governance */}
          {agentYs.map((y, index) => (
            <Edge
              key={`ag-${index}`}
              x1={STAGE_X.agents + 74}
              y1={y}
              x2={STAGE_X.governance - 74}
              y2={200}
              active={hovered !== null && hoveredAgentIndex === index}
            />
          ))}
          {/* Edges governance -> surfaces */}
          {surfaceNodes.map((surface) => (
            <Edge
              key={`gs-${surface.key}`}
              x1={STAGE_X.governance + 74}
              y1={200}
              x2={STAGE_X.surfaces - 74}
              y2={surface.y}
              active={hoveredSurface === surface.key}
            />
          ))}
          {/* Edges surfaces -> ledger */}
          {surfaceNodes.map((surface) => (
            <Edge
              key={`sl-${surface.key}`}
              x1={STAGE_X.surfaces + 74}
              y1={surface.y}
              x2={STAGE_X.ledger - 74}
              y2={200}
              active={hoveredSurface === surface.key}
            />
          ))}

          {/* Agent nodes */}
          {data.agents.map((agent, index) => (
            <Node
              key={agent.id}
              x={STAGE_X.agents}
              y={agentYs[index]}
              label={agent.label}
              sub={`${agent.eventCount} événement${agent.eventCount > 1 ? "s" : ""}`}
              active={hovered !== null && hoveredAgentIndex === index}
              tone="sky"
            />
          ))}

          {/* Governance node */}
          <Node
            x={STAGE_X.governance}
            y={200}
            label="Sentinelle + CEO"
            sub={`${data.decisions} décision${data.decisions > 1 ? "s" : ""} · approbation humaine`}
            active={hovered !== null}
            tone="amber"
          />

          {/* Surface nodes */}
          {surfaceNodes.map((surface) => (
            <Node
              key={surface.key}
              x={STAGE_X.surfaces}
              y={surface.y}
              label={surface.label}
              sub={`${surface.count} action${surface.count > 1 ? "s" : ""}`}
              active={hoveredSurface === surface.key}
              tone="emerald"
            />
          ))}

          {/* Ledger node */}
          <Node
            x={STAGE_X.ledger}
            y={200}
            label="Action Ledger"
            sub={`${data.results} preuve${data.results > 1 ? "s" : ""} · hash-chain`}
            active={hovered !== null}
            tone="violet"
          />
        </svg>
      </div>

      <aside className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-2xl border border-white/[0.07] bg-black/25 p-3">
        <p className="px-1 text-[10px] font-extrabold uppercase tracking-[0.22em] text-neutral-500">
          Trace récente — survole pour voir le chemin
        </p>
        {data.recentEvents.length === 0 ? (
          <p className="px-1 py-3 text-xs text-neutral-600">
            Aucun événement ledger encore. Le premier envoi du Send Desk allumera ce graphe.
          </p>
        ) : (
          data.recentEvents.map((event) => {
            const surface = surfaceForActionType(event.actionType);
            const SurfaceIcon =
              surface === "sendDesk" ? SendHorizonal : surface === "calendar" ? CalendarCheck : ListChecks;
            return (
              <button
                key={event.id}
                type="button"
                onMouseEnter={() => setHoveredEventId(event.id)}
                onMouseLeave={() => setHoveredEventId(null)}
                onFocus={() => setHoveredEventId(event.id)}
                onBlur={() => setHoveredEventId(null)}
                className={`rounded-xl border px-2.5 py-2 text-left transition ${
                  hoveredEventId === event.id
                    ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                    : "border-white/[0.05] bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-200">
                  <Bot className="h-3 w-3 shrink-0 text-sky-400" />
                  {event.agentId ?? "système"}
                  <span className="text-neutral-600">→</span>
                  <ShieldCheck className="h-3 w-3 shrink-0 text-amber-400" />
                  <span className="text-neutral-600">→</span>
                  <SurfaceIcon className="h-3 w-3 shrink-0 text-emerald-400" />
                  <span className="text-neutral-600">→</span>
                  <ScrollText className="h-3 w-3 shrink-0 text-violet-400" />
                </p>
                <p className="mt-1 truncate text-[11px] text-neutral-400">{event.summary}</p>
                <p className="mt-0.5 text-[10px] tabular-nums text-neutral-600">
                  {event.actionType} ·{" "}
                  {new Date(event.createdAt).toLocaleTimeString("fr-CA", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
            );
          })
        )}
      </aside>
    </div>
  );
}
