// src/features/cockpit/components/founder-zero-state.tsx
//
// Cockpit principal — design ORIA v3.
// Deux colonnes, widgets sombres avec accents colorés, données réelles.
// Pas de données inventées : treasury/ventures/modes sont des stubs honnêtes.

import type { ReactNode } from "react";
import { CircleDot } from "lucide-react";
import { CockpitInteractive } from "@/features/cockpit/components/cockpit-interactive";
import type { IdeaProjection } from "@/features/cockpit/events/idea-projection";
import type { EventPersistenceMode } from "@/features/cockpit/events/event-client";
import type { DailyDirectionProjection } from "@/features/cockpit/events/daily-direction-projection";

// ─── Design tokens ───────────────────────────────────────────────────────────

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

function Eyebrow({
  color = "#a3a3a3",
  dot,
  children,
}: {
  color?: string;
  dot?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
      {dot && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: dot,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color,
        }}
      >
        {children}
      </span>
    </div>
  );
}

function Pill({
  color,
  children,
}: {
  color: ToyName;
  children: ReactNode;
}) {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
});

function formatTodayLong(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : dateFormatter.format(d);
}

// ─── CEO Brief header ─────────────────────────────────────────────────────────

function CeoBriefHeader({
  todayIso,
  todayDirection,
  ideasCount,
}: {
  todayIso: string;
  todayDirection: DailyDirectionProjection | null;
  ideasCount: number;
}) {
  const dateLabel = formatTodayLong(todayIso);

  // Derive a one-liner summary for the header from the direction
  let jorissLine: string;
  if (todayDirection) {
    const outcomes = todayDirection.payload.outcomes;
    jorissLine =
      outcomes.length > 0
        ? outcomes[0].text
        : "Plan du jour disponible — consulte le widget direction ci-dessous.";
  } else if (ideasCount > 0) {
    jorissLine = `${ideasCount} idée${ideasCount > 1 ? "s" : ""} capturée${ideasCount > 1 ? "s" : ""} — Joris génère le plan du jour.`;
  } else {
    jorissLine = "Joris attend ta première idée pour construire ton plan du jour.";
  }

  return (
    <div
      style={{
        paddingBottom: 28,
        borderBottom: "1px solid #1f1f1f",
        marginBottom: 4,
        animation: "oria-fadein .4s var(--ease) both",
      }}
    >
      <Eyebrow dot={TOY.marigold.core} color="#a3a3a3">
        CEO Brief · {dateLabel}
      </Eyebrow>

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(28px, 4vw, 40px)",
          fontWeight: 800,
          color: "#f5f5f5",
          margin: "8px 0 10px",
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
        }}
      >
        Bonjour, Michael.
      </h1>

      <p
        style={{
          fontSize: 14,
          color: "#a3a3a3",
          lineHeight: 1.7,
          maxWidth: 640,
          margin: "0 0 16px",
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color: TOY.grape.text,
          }}
        >
          Joris :{" "}
        </span>
        {jorissLine}
      </p>

      {/* Quick status pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Pill color={todayDirection ? "mint" : "tangerine"}>
          {todayDirection ? "Direction générée" : "Direction en attente"}
        </Pill>
        <Pill color="sky">{ideasCount} idée{ideasCount !== 1 ? "s" : ""}</Pill>
        <Pill color="grape">Joris · PR-2</Pill>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function FounderZeroStateCockpit({
  ideas,
  loadError,
  storageMode,
  todayDirection,
  todayIso,
  initialOrder,
}: {
  ideas: IdeaProjection[];
  loadError: boolean;
  storageMode: EventPersistenceMode;
  todayDirection: DailyDirectionProjection | null;
  todayIso: string;
  initialOrder: string[];
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── CEO Brief Header ── */}
      <CeoBriefHeader
        todayIso={todayIso}
        todayDirection={todayDirection}
        ideasCount={ideas.length}
      />

      {/* ── Interactive widget grid (dnd-kit, ⌘K, live feed) ── */}
      <CockpitInteractive
        ideas={ideas}
        loadError={loadError}
        todayDirection={todayDirection}
        initialOrder={initialOrder}
      />

      {/* ── System footer ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingTop: 12,
          borderTop: "1px solid #1f1f1f",
        }}
      >
        <CircleDot size={11} color={TOY.mint.core} aria-hidden="true" />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "#5a5a5a",
          }}
        >
          workspace actif · events append-only · source {storageMode} · human-on-the-loop · PR-2
        </span>
      </div>
    </div>
  );
}
