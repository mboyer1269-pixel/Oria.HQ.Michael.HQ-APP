"use client";

import { useMemo, useState } from "react";
import type {
  ChainlinePath,
  MemoryEntry,
  MemoryEntryType,
  MemoryGraph,
  MemoryNode,
} from "@/server/memory/memory-graph";

// ---------------------------------------------------------------------------
// Memory Vault explorer — Obsidian-like graph + detail panel.
// Pure React + SVG, no graph library. Receives a pre-built serializable
// graph from the server component on /hq/memory.
// ---------------------------------------------------------------------------

const TYPE_ORDER: MemoryEntryType[] = [
  "source",
  "doc",
  "note",
  "sop",
  "decision",
  "action",
  "pr",
  "chainline",
  "agent",
  "venture",
];

const TYPE_COLORS: Record<MemoryEntryType, string> = {
  source: "#2dd4bf",
  doc: "#a3a3a3",
  note: "#fbbf24",
  sop: "#38bdf8",
  decision: "#a78bfa",
  action: "#fb923c",
  pr: "#60a5fa",
  chainline: "#f5f5f5",
  agent: "#34d399",
  venture: "#fb7185",
};

const TYPE_LABELS: Record<MemoryEntryType, string> = {
  source: "Source",
  doc: "Doc",
  note: "Note",
  sop: "SOP",
  decision: "Décision",
  action: "Action",
  pr: "PR",
  chainline: "Chainline",
  agent: "Agent",
  venture: "Venture",
};

const VIEW_WIDTH = 680;
const VIEW_HEIGHT = 560;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = VIEW_HEIGHT / 2 - 10;
const RADIUS = 215;

type PositionedNode = MemoryNode & { x: number; y: number };

function layoutNodes(nodes: MemoryNode[]): PositionedNode[] {
  const ordered = [...nodes].sort((a, b) => {
    const typeDelta = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    if (typeDelta !== 0) return typeDelta;
    return a.title.localeCompare(b.title);
  });
  const count = Math.max(ordered.length, 1);
  return ordered.map((node, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: CENTER_X + Math.cos(angle) * RADIUS,
      y: CENTER_Y + Math.sin(angle) * RADIUS,
    };
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function TypeBadge({ type }: { type: MemoryEntryType }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs font-medium"
      style={{ color: TYPE_COLORS[type] }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: TYPE_COLORS[type] }}
      />
      {TYPE_LABELS[type]}
    </span>
  );
}

function ChainlineRail({
  path,
  selectedId,
  onSelect,
}: {
  path: ChainlinePath;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-3">
      <p className="text-xs font-semibold text-neutral-300">{path.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {path.steps.map((step, index) => (
          <span key={`${step.stage}-${step.targetId}`} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-neutral-700">→</span>}
            <button
              type="button"
              onClick={() => step.resolved && onSelect(step.targetId)}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                step.targetId === selectedId
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : step.resolved
                    ? "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                    : "cursor-default border-dashed border-neutral-800 text-neutral-600"
              }`}
              title={step.resolved ? step.label : `Non résolu: ${step.label}`}
            >
              <span className="mr-1 uppercase tracking-wide text-[9px] text-neutral-500">
                {step.stage}
              </span>
              {truncate(step.label, 28)}
            </button>
          </span>
        ))}
      </div>
      {path.missingStages.length > 0 && (
        <p className="mt-2 text-[11px] text-neutral-600">
          Étapes absentes : {path.missingStages.join(", ")}
        </p>
      )}
    </div>
  );
}

export function MemoryVaultExplorer({
  entries,
  graph,
  chainlines,
}: {
  entries: MemoryEntry[];
  graph: MemoryGraph;
  chainlines: ChainlinePath[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const positioned = useMemo(() => layoutNodes(graph.nodes), [graph.nodes]);
  const positionById = useMemo(
    () => new Map(positioned.map((node) => [node.id, node])),
    [positioned],
  );
  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );

  const selectedEntry = selectedId ? (entryById.get(selectedId) ?? null) : null;
  const selectedNode = selectedId ? (positionById.get(selectedId) ?? null) : null;

  const neighborIds = useMemo(() => {
    if (!selectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const edge of graph.edges) {
      if (edge.sourceId === selectedId) ids.add(edge.targetId);
      if (edge.targetId === selectedId) ids.add(edge.sourceId);
    }
    return ids;
  }, [graph.edges, selectedId]);

  const selectedBacklinks = selectedId ? (graph.backlinks[selectedId] ?? []) : [];
  const selectedChainlines = useMemo(
    () =>
      selectedId
        ? chainlines.filter(
            (path) =>
              path.id === selectedId ||
              path.steps.some((step) => step.targetId === selectedId),
          )
        : chainlines,
    [chainlines, selectedId],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Graph */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-2 lg:col-span-3">
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            className="h-auto w-full"
            role="img"
            aria-label="Graphe du Memory Vault"
          >
            {graph.edges.map((edge) => {
              const from = positionById.get(edge.sourceId);
              const to = positionById.get(edge.targetId);
              if (!from || !to) return null;
              const active =
                selectedId !== null &&
                (edge.sourceId === selectedId || edge.targetId === selectedId);
              return (
                <line
                  key={`${edge.sourceId}->${edge.targetId}:${edge.kind}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={active ? "#34d399" : edge.kind === "chainline" ? "#f5f5f5" : "#404040"}
                  strokeOpacity={selectedId === null ? 0.55 : active ? 0.9 : 0.15}
                  strokeWidth={active ? 1.6 : 1}
                  strokeDasharray={edge.kind === "chainline" ? "4 3" : undefined}
                />
              );
            })}
            {positioned.map((node) => {
              const isSelected = node.id === selectedId;
              const isNeighbor = neighborIds.has(node.id);
              const dimmed = selectedId !== null && !isSelected && !isNeighbor;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.3 : 1}
                  onClick={() => setSelectedId(isSelected ? null : node.id)}
                >
                  <circle
                    r={isSelected ? 10 : 7}
                    fill={node.missing ? "transparent" : TYPE_COLORS[node.type]}
                    stroke={isSelected ? "#ffffff" : TYPE_COLORS[node.type]}
                    strokeWidth={node.missing ? 1.5 : isSelected ? 2 : 0}
                    strokeDasharray={node.missing ? "3 2" : undefined}
                  />
                  <text
                    y={node.y > CENTER_Y ? 22 : -14}
                    textAnchor="middle"
                    fill={isSelected ? "#ffffff" : "#a3a3a3"}
                    fontSize={10}
                  >
                    {truncate(node.title, 24)}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap gap-2 px-2 pb-2">
            {TYPE_ORDER.filter((type) => graph.nodes.some((n) => n.type === type)).map(
              (type) => (
                <TypeBadge key={type} type={type} />
              ),
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4 lg:col-span-2">
          {selectedNode === null ? (
            <div className="flex h-full flex-col justify-center gap-2 text-center">
              <p className="text-sm text-neutral-400">
                Sélectionne un nœud pour voir le détail, les backlinks et la chainline.
              </p>
              <p className="text-xs text-neutral-600">
                {graph.nodes.filter((n) => !n.missing).length} entrées ·{" "}
                {graph.edges.length} liens · {graph.orphanIds.length} orphelins
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={selectedNode.type} />
                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-500">
                  {selectedNode.status}
                </span>
              </div>
              <h3 className="text-sm font-semibold leading-snug text-white">
                {selectedNode.title}
              </h3>
              {selectedNode.missing ? (
                <p className="text-xs text-neutral-500">
                  Cible référencée mais sans entrée dans la vault — à créer.
                </p>
              ) : selectedEntry ? (
                <>
                  <p className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-neutral-400">
                    {selectedEntry.body}
                  </p>
                  {selectedEntry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedEntry.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-xs text-neutral-500"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedEntry.sourceRefs.length > 0 && (
                    <div className="text-xs text-neutral-600">
                      <span className="text-neutral-500">Refs:</span>{" "}
                      {selectedEntry.sourceRefs.join(" · ")}
                    </div>
                  )}
                  {selectedEntry.filePath && (
                    <p className="truncate text-xs text-neutral-700">{selectedEntry.filePath}</p>
                  )}
                </>
              ) : null}

              {selectedEntry && selectedEntry.links.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Liens sortants
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedEntry.links.map((link) => (
                      <button
                        key={`${link.refKind ?? link.targetType ?? ""}:${link.targetId}`}
                        type="button"
                        onClick={() => setSelectedId(link.targetId)}
                        className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 transition hover:border-neutral-500"
                      >
                        {truncate(link.raw, 36)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedBacklinks.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                    Backlinks
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedBacklinks.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedId(id)}
                        className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 transition hover:border-neutral-500"
                      >
                        {truncate(entryById.get(id)?.title ?? id, 36)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chainlines */}
      {selectedChainlines.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Chainlines — source → note → décision → action → ledger → PR → next
          </p>
          {selectedChainlines.map((path) => (
            <ChainlineRail
              key={path.id}
              path={path}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
