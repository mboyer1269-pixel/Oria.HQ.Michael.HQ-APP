"use client";

// src/features/cockpit/components/cockpit-interactive.tsx
//
// Client island that owns:
//   • dnd-kit drag-to-reorder widget grid
//   • ⌘K command palette (cmdk)
//   • Supabase Realtime live-event feed (right panel)
//   • Stagger entry animations, hover glow, gradient buttons

import { type ReactNode, type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Command } from "cmdk";
import {
  Bot,
  Building2,
  CircleDot,
  GripVertical,
  LayoutGrid,
  Lightbulb,
  Rows3,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { MichaelHqDatabase } from "@/server/db/types";
import { IdeaIntakeForm } from "@/features/cockpit/components/idea-intake-form";
import { DailyDirectionWidget } from "@/features/cockpit/components/daily-direction-widget";
import { saveCockpitLayout } from "@/features/cockpit/actions/cockpit-layout";
import type { IdeaProjection } from "@/features/cockpit/events/idea-projection";
import type { DailyDirectionProjection } from "@/features/cockpit/events/daily-direction-projection";

// ─── Design tokens (mirrored from founder-zero-state) ────────────────────────

const TOY = {
  marigold:  { core: "#f59e0b", bright: "#fbbf24", text: "#fcd34d", rgb: "245,158,11" },
  mint:      { core: "#10b981", bright: "#34d399", text: "#6ee7b7", rgb: "16,185,129" },
  grape:     { core: "#a855f7", bright: "#c084fc", text: "#d8b4fe", rgb: "168,85,247" },
  sky:       { core: "#38bdf8", bright: "#7dd3fc", text: "#7dd3fc", rgb: "56,189,248" },
  coral:     { core: "#fb7185", bright: "#fda4af", text: "#fda4af", rgb: "251,113,133" },
  tangerine: { core: "#fb923c", bright: "#fdba74", text: "#fdba74", rgb: "251,146,60" },
  berry:     { core: "#ef4444", bright: "#f87171", text: "#fca5a5", rgb: "239,68,68" },
} as const;

type ToyName = keyof typeof TOY;

function C(name: ToyName) {
  const t = TOY[name];
  return {
    core:     t.core,
    bright:   t.bright,
    text:     t.text,
    tint:     `rgba(${t.rgb},.18)`,
    tintHi:   `rgba(${t.rgb},.30)`,
    tintLo:   `rgba(${t.rgb},.10)`,
    border:   `rgba(${t.rgb},.44)`,
    borderHi: `rgba(${t.rgb},.64)`,
    glow:     `rgba(${t.rgb},.42)`,
  };
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Pill({ color, children }: { color: ToyName; children: ReactNode }) {
  const c = C(color);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 9px",
        borderRadius: 999,
        border: `1px solid ${c.border}`,
        background: c.tintLo,
        fontFamily: "var(--font-sans)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: c.text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ─── Widget card shell ────────────────────────────────────────────────────────

interface WidgetShellProps {
  accent?: ToyName;
  title?: string;
  icon?: typeof Zap;
  badge?: ReactNode;
  noPad?: boolean;
  style?: CSSProperties;
  children: ReactNode;
}

function WidgetShell({ accent, title, icon: Icon, badge, noPad = false, style, children }: WidgetShellProps) {
  const c = accent ? C(accent) : null;
  return (
    <div
      style={{
        position: "relative",
        background: "rgba(20,20,21,.82)",
        border: "1px solid #262626",
        borderRadius: 14,
        boxShadow: "0 1px 2px rgba(0,0,0,.45), 0 10px 30px rgba(0,0,0,.38)",
        overflow: "hidden",
        height: "100%",
        transition: "box-shadow 0.18s ease, transform 0.18s ease",
        ...style,
      }}
      className="cockpit-widget-card"
    >
      {c && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${c.core} 0%, ${c.tintLo} 100%)`,
            borderRadius: "14px 14px 0 0",
          }}
        />
      )}
      {(title || badge) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: c ? "18px 20px 0" : "16px 20px 0",
          }}
        >
          {Icon && (
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                background: c ? `rgba(${TOY[accent!].rgb},.12)` : "rgba(255,255,255,.07)",
                border: `1px solid ${c ? c.border : "rgba(255,255,255,.10)"}`,
                flexShrink: 0,
              }}
            >
              <Icon size={14} color={c?.text ?? "#a3a3a3"} strokeWidth={2} aria-hidden="true" />
            </span>
          )}
          {title && (
            <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "#f5f5f5" }}>
              {title}
            </span>
          )}
          {badge}
        </div>
      )}
      <div style={{ padding: noPad ? 0 : title ? "12px 20px 20px" : "20px" }}>{children}</div>
    </div>
  );
}

// ─── Stub card ────────────────────────────────────────────────────────────────

function StubCard({
  accent,
  title,
  icon: Icon,
  pr,
  note,
}: {
  accent: ToyName;
  title: string;
  icon: typeof Zap;
  pr: string;
  note: string;
}) {
  const c = C(accent);
  return (
    <WidgetShell accent={accent} title={title} icon={Icon} badge={<Pill color={accent}>{pr}</Pill>}>
      <p style={{ fontSize: 12.5, lineHeight: "1.6", color: "#6f7899", marginTop: 8 }}>{note}</p>
      <div
        style={{
          marginTop: 14,
          height: 38,
          borderRadius: 9,
          background: `repeating-linear-gradient(
            -45deg,
            rgba(255,255,255,.022) 0px,
            rgba(255,255,255,.022) 1px,
            transparent 1px,
            transparent 6px
          )`,
          border: `1px solid rgba(255,255,255,.05)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: c.text, opacity: 0.5 }}>
          Non déployé
        </span>
      </div>
    </WidgetShell>
  );
}

// ─── JorisAgentCard ──────────────────────────────────────────────────────────

function JorisAgentCard({
  ideas,
  todayDirection,
  loadError,
}: {
  ideas: IdeaProjection[];
  todayDirection: DailyDirectionProjection | null;
  loadError: boolean;
}) {
  const hasIdeas = ideas.length > 0;
  const hasDirection = !!todayDirection;
  const status = loadError ? "alert" : hasIdeas && hasDirection ? "calm" : "watch";

  const statusLabel =
    loadError ? "Erreur de chargement"
    : !hasDirection ? "En attente de direction"
    : !hasIdeas ? "Aucune idée en pipeline"
    : `${ideas.length} idée${ideas.length > 1 ? "s" : ""} · direction active`;

  return (
    <WidgetShell accent="grape" title="Joris — Agent CEO" icon={Bot} badge={<Pill color="grape">Agent</Pill>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: "50%",
              background: status === "calm" ? TOY.mint.core : status === "alert" ? TOY.berry.core : TOY.marigold.core,
              boxShadow: `0 0 0 3px rgba(${status === "calm" ? TOY.mint.rgb : status === "alert" ? TOY.berry.rgb : TOY.marigold.rgb},.25)`,
            }}
          />
          <span style={{ fontSize: 12, color: "#8791b7" }}>{statusLabel}</span>
        </div>

        {hasDirection && (
          <div style={{
            borderRadius: 9,
            border: "1px solid rgba(168,85,247,.18)",
            background: "rgba(168,85,247,.06)",
            padding: "10px 12px",
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: TOY.grape.text, marginBottom: 4 }}>
              Objectif du jour
            </p>
            <p style={{ fontSize: 12.5, lineHeight: "1.6", color: "#c4cde8" }}>
              {todayDirection.payload.outcomes[0]?.text ?? "—"}
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ideas.slice(0, 4).map((idea) => (
            <span
              key={idea.id}
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,.055)",
                border: "1px solid rgba(255,255,255,.09)",
                fontSize: 11,
                color: "#8791b7",
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {idea.title}
            </span>
          ))}
          {ideas.length > 4 && (
            <span style={{ fontSize: 11, color: "#5d6688", alignSelf: "center" }}>
              +{ideas.length - 4} autres
            </span>
          )}
        </div>
      </div>
    </WidgetShell>
  );
}

// ─── DecisionQueueCard ────────────────────────────────────────────────────────

function DecisionQueueCard({
  ideas,
  loadError,
}: {
  ideas: IdeaProjection[];
  loadError: boolean;
}) {
  // IdeaProjection has no status field — all captured ideas are pending review
  const pending = ideas;

  return (
    <WidgetShell accent="sky" title="File de décision" icon={Rows3} badge={<Pill color="sky">{pending.length} en attente</Pill>}>
      {loadError ? (
        <p style={{ fontSize: 12.5, color: "#fb7185" }}>Erreur lors du chargement des idées.</p>
      ) : pending.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "#6f7899" }}>
          {ideas.length === 0
            ? "Aucune idée capturée. Commence par le widget Idées."
            : "Toutes les idées ont été traitées."}
        </p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pending.slice(0, 5).map((idea) => (
            <li
              key={idea.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                background: "rgba(255,255,255,.035)",
                border: "1px solid rgba(255,255,255,.07)",
              }}
            >
              <CircleDot size={12} color={TOY.sky.core} style={{ marginTop: 1, flexShrink: 0 }} aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, color: "#c4cde8", lineHeight: "1.45", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {idea.title}
                </p>
                <p style={{ fontSize: 10.5, color: "#505878", marginTop: 1 }}>
                  {new Date(idea.capturedAt).toLocaleDateString("fr-CA")}
                </p>
              </div>
            </li>
          ))}
          {pending.length > 5 && (
            <p style={{ fontSize: 11, color: "#5d6688", textAlign: "center", paddingTop: 2 }}>
              +{pending.length - 5} autres
            </p>
          )}
        </ul>
      )}
    </WidgetShell>
  );
}

// ─── IdeaIntakeCard ───────────────────────────────────────────────────────────

function IdeaIntakeCard() {
  return (
    <WidgetShell accent="marigold" title="Capture d'idée" icon={Lightbulb} badge={<Pill color="marigold">Append-only</Pill>}>
      <IdeaIntakeForm />
    </WidgetShell>
  );
}

// ─── Sortable widget wrapper ──────────────────────────────────────────────────

const SPAN2 = new Set(["daily-direction", "modes"]);

function SortableWidget({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: CSSProperties = {
    gridColumn: SPAN2.has(id) ? "span 2" : undefined,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    position: "relative",
    animation: "oria-fadein 0.38s var(--ease, cubic-bezier(.4,0,.2,1)) both",
    animationDelay: `${index * 0.06}s`,
  };

  return (
    <div ref={setNodeRef} style={style} className="cockpit-widget-wrapper">
      {/* Drag handle */}
      <button
        type="button"
        className="cockpit-drag-handle"
        aria-label="Déplacer le widget"
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 24,
          height: 24,
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,.10)",
          background: "rgba(0,0,0,.30)",
          cursor: "grab",
          opacity: 0,
          transition: "opacity 0.15s ease",
          touchAction: "none",
        }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={13} color="#8791b7" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}

// ─── ⌘K Command palette ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: "Cockpit", href: "/hq/cockpit", icon: LayoutGrid },
  { label: "Direction du jour — Joris", href: "#daily-direction", icon: Zap },
  { label: "Capture d'idée", href: "#idea-intake", icon: Lightbulb },
  { label: "File de décision", href: "#decision-queue", icon: Rows3 },
  { label: "Joris Agent", href: "#joris-agent", icon: Bot },
  { label: "Trésorerie", href: "#treasury", icon: TrendingUp },
  { label: "Ventures", href: "#ventures", icon: Building2 },
  { label: "Modes opérationnels", href: "#modes", icon: LayoutGrid },
];

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState("");

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
        background: "rgba(0,0,0,.65)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 540,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,.12)",
          background: "rgba(16,16,18,.97)",
          boxShadow: "0 24px 80px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.04)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Command value={value} onValueChange={setValue}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,.07)",
            }}
          >
            <Search size={15} color="#6f7899" aria-hidden="true" />
            <Command.Input
              autoFocus
              placeholder="Rechercher ou naviguer…"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "#eff1fb",
                fontFamily: "var(--font-sans)",
              }}
            />
            <kbd
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "#505878",
                background: "rgba(255,255,255,.07)",
                border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 4,
                padding: "2px 5px",
              }}
            >
              ESC
            </kbd>
          </div>
          <Command.List style={{ padding: "8px 6px", maxHeight: 320, overflowY: "auto" }}>
            <Command.Empty style={{ padding: "12px 16px", fontSize: 13, color: "#505878", textAlign: "center" }}>
              Aucun résultat.
            </Command.Empty>
            <Command.Group heading="Navigation" style={{ paddingBottom: 4 }}>
              {NAV_ITEMS.map((item) => (
                <Command.Item
                  key={item.href}
                  value={item.label}
                  onSelect={() => {
                    if (item.href.startsWith("#")) {
                      const el = document.getElementById(item.href.slice(1));
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    } else {
                      window.location.href = item.href;
                    }
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    color: "#c4cde8",
                    userSelect: "none",
                  }}
                  className="cmdk-item"
                >
                  <item.icon size={14} color="#6f7899" aria-hidden="true" />
                  {item.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

// ─── Live feed panel ──────────────────────────────────────────────────────────

type LiveEvent = {
  id: string;
  type: string;
  recorded_at: string;
  payload: Record<string, unknown>;
};

type BrowserSupabaseClient = SupabaseClient<MichaelHqDatabase>;

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    "idea.captured": "💡 Idée capturée",
    "daily.direction.generated": "⚡ Direction générée",
  };
  return map[type] ?? type;
}

function LiveFeedPanel() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<BrowserSupabaseClient | null>(null);

  useEffect(() => {
    const client = createBrowserSupabaseClient();
    clientRef.current = client;

    // Load last 10 events
    void client
      .from("events")
      .select("id, type, recorded_at, payload")
      .order("recorded_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setEvents(data as LiveEvent[]);
      });

    // Subscribe to new inserts
    const channel = client
      .channel("cockpit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const newEvent = payload.new as LiveEvent;
          setEvents((prev) => [newEvent, ...prev].slice(0, 50));
        },
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  return (
    <div
      className="cockpit-live-panel"
      style={{
        width: 272,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          borderRadius: 14,
          background: "rgba(20,20,21,.82)",
          border: "1px solid #262626",
          boxShadow: "0 1px 2px rgba(0,0,0,.45)",
        }}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "#8791b7", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Activité temps réel
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 999,
            background: connected ? "rgba(16,185,129,.10)" : "rgba(255,255,255,.06)",
            border: `1px solid ${connected ? "rgba(16,185,129,.35)" : "rgba(255,255,255,.10)"}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: connected ? TOY.mint.core : "#505878",
              animation: connected ? "oria-pulse 2s ease-in-out infinite" : "none",
            }}
          />
          <span style={{ fontSize: 10, fontWeight: 700, color: connected ? TOY.mint.text : "#505878", letterSpacing: "0.08em" }}>
            {connected ? "LIVE" : "—"}
          </span>
        </span>
      </div>

      {/* Events list */}
      <div
        style={{
          flex: 1,
          borderRadius: 14,
          background: "rgba(20,20,21,.82)",
          border: "1px solid #262626",
          boxShadow: "0 1px 2px rgba(0,0,0,.45)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center" }}>
            <CircleDot size={16} color="#303048" style={{ margin: "0 auto 8px" }} />
            <p style={{ fontSize: 12, color: "#505878" }}>En attente d&apos;événements…</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column" }}>
            {events.map((ev, i) => (
              <li
                key={ev.id}
                style={{
                  padding: "10px 14px",
                  borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  animation: i === 0 ? "oria-fadein 0.28s var(--ease) both" : undefined,
                }}
              >
                <p style={{ fontSize: 12, fontWeight: 600, color: "#c4cde8" }}>
                  {eventLabel(ev.type)}
                </p>
                <p style={{ fontSize: 10.5, color: "#505878", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                  {new Date(ev.recorded_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CockpitInteractive({
  ideas,
  loadError,
  todayDirection,
  initialOrder,
}: {
  ideas: IdeaProjection[];
  loadError: boolean;
  todayDirection: DailyDirectionProjection | null;
  initialOrder: string[];
}) {
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [cmdOpen, setCmdOpen] = useState(false);

  // NEXT_PUBLIC_* is inlined by Next and safe for client-side feature gating.
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // ⌘K keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === "Escape") setCmdOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove(order, oldIndex, newIndex);
      setOrder(newOrder);
      void saveCockpitLayout(newOrder);
    },
    [order],
  );

  function renderWidget(id: string, index: number) {
    let content: ReactNode;
    switch (id) {
      case "daily-direction":
        content = (
          <div
            style={{
              position: "relative",
              background: "rgba(20,20,21,.82)",
              border: "1px solid #262626",
              borderRadius: 14,
              boxShadow: "0 1px 2px rgba(0,0,0,.45), 0 10px 30px rgba(0,0,0,.38)",
              overflow: "hidden",
              height: "100%",
            }}
            className="cockpit-widget-card"
          >
            {/* Marigold accent */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${TOY.marigold.core} 0%, rgba(245,158,11,.1) 100%)`, borderRadius: "14px 14px 0 0" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "18px 20px 0" }}>
              <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.35)", flexShrink: 0 }}>
                <Zap size={14} color={TOY.marigold.text} strokeWidth={2} aria-hidden="true" />
              </span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: "#f5f5f5" }}>
                Plan du jour — Joris
              </span>
              <Pill color="marigold">Direction quotidienne</Pill>
            </div>
            <div style={{ padding: "4px 20px 20px" }}>
              <DailyDirectionWidget initialDirection={todayDirection} />
            </div>
          </div>
        );
        break;
      case "idea-intake":
        content = <IdeaIntakeCard />;
        break;
      case "decision-queue":
        content = <DecisionQueueCard ideas={ideas} loadError={loadError} />;
        break;
      case "joris-agent":
        content = <JorisAgentCard ideas={ideas} todayDirection={todayDirection} loadError={loadError} />;
        break;
      case "treasury":
        content = (
          <StubCard
            accent="mint"
            title="Trésorerie"
            icon={TrendingUp}
            pr="À venir · PR-3"
            note="Connexion au ledger financier réel après validation des fondations comptables."
          />
        );
        break;
      case "ventures":
        content = (
          <StubCard
            accent="tangerine"
            title="Ventures"
            icon={Building2}
            pr="À venir · PR-4"
            note="Portefeuille de ventures promu uniquement après preuve de revenu réelle."
          />
        );
        break;
      case "modes":
        content = (
          <StubCard
            accent="grape"
            title="Modes opérationnels"
            icon={LayoutGrid}
            pr="À venir · PR-5"
            note="Cash Sprint, Build Sprint, Validation, Consolidation — activés sur signal réel, pas sur clic arbitraire."
          />
        );
        break;
      default:
        return null;
    }

    return (
      <SortableWidget key={id} id={id} index={index}>
        {content}
      </SortableWidget>
    );
  }

  return (
    <>
      {/* ⌘K search bar */}
      <div style={{ marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            maxWidth: 380,
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.10)",
            background: "rgba(255,255,255,.04)",
            cursor: "text",
            transition: "border-color 0.15s, background 0.15s",
          }}
          className="cmdk-trigger"
        >
          <Search size={13} color="#505878" aria-hidden="true" />
          <span style={{ flex: 1, textAlign: "left", fontSize: 13, color: "#505878", fontFamily: "var(--font-sans)" }}>
            Rechercher…
          </span>
          <kbd style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "#505878", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.10)", borderRadius: 4, padding: "2px 6px" }}>
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Main layout: grid + live panel */}
      <div className="cockpit-interactive-layout" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Widget grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={rectSortingStrategy}>
              <div
                className="cockpit-widget-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 14,
                }}
              >
                {order.map((id, i) => renderWidget(id, i))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Live feed panel */}
        {hasSupabase && <LiveFeedPanel />}
      </div>

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}
