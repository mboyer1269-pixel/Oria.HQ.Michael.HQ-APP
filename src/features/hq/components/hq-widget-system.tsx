import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";

type HqPageShellProps = {
  children: ReactNode;
  size?: "narrow" | "wide";
};

const SHELL_SIZE = {
  narrow: "max-w-5xl",
  wide: "max-w-7xl",
};

export function HqPageShell({ children, size = "wide" }: HqPageShellProps) {
  return (
    <main
      className={`mx-auto flex min-h-screen w-full ${SHELL_SIZE[size]} flex-col gap-5 px-4 py-5 sm:gap-6 md:px-8 md:py-8`}
    >
      {children}
    </main>
  );
}

export function HqPageHeader({
  backHref,
  backLabel = "Michael HQ",
  eyebrow,
  icon: Icon,
  tone = "amber",
  title,
  description,
  children,
}: {
  backHref?: Route;
  backLabel?: string;
  eyebrow: string;
  icon: LucideIcon;
  tone?: "amber" | "emerald" | "sky" | "violet" | "rose" | "neutral";
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  const toneClass = {
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    sky: "border-sky-500/20 bg-sky-500/10 text-sky-300",
    violet: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    rose: "border-rose-500/20 bg-rose-500/10 text-rose-300",
    neutral: "border-neutral-700 bg-neutral-900 text-neutral-300",
  }[tone];

  return (
    <header className="py-2">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </Link>
          ) : null}
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {eyebrow}
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-extrabold leading-[1.02] text-white sm:text-4xl md:text-5xl">
            {title}
          </h1>
          <div className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400 md:text-base">
            {description}
          </div>
        </div>
        {children ? <div className="w-full shrink-0 lg:w-[22rem]">{children}</div> : null}
      </div>
    </header>
  );
}

const WIDGET_TONES = {
  neutral: {
    eyebrow: "text-neutral-500",
    bar: "from-neutral-500/60 via-neutral-500/20 to-transparent",
    iconChip: "border-white/10 bg-white/[0.04] text-neutral-300",
    glow: "",
  },
  emerald: {
    eyebrow: "text-emerald-400/90",
    bar: "from-emerald-400/80 via-emerald-400/25 to-transparent",
    iconChip:
      "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.45)]",
    glow: "bg-emerald-500/[0.05]",
  },
  amber: {
    eyebrow: "text-amber-400/90",
    bar: "from-amber-400/80 via-amber-400/25 to-transparent",
    iconChip:
      "border-amber-500/25 bg-amber-500/[0.08] text-amber-300 shadow-[0_0_18px_-6px_rgba(251,191,36,0.45)]",
    glow: "bg-amber-500/[0.05]",
  },
  sky: {
    eyebrow: "text-sky-400/90",
    bar: "from-sky-400/80 via-sky-400/25 to-transparent",
    iconChip:
      "border-sky-500/25 bg-sky-500/[0.08] text-sky-300 shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]",
    glow: "bg-sky-500/[0.05]",
  },
  violet: {
    eyebrow: "text-violet-400/90",
    bar: "from-violet-400/80 via-violet-400/25 to-transparent",
    iconChip:
      "border-violet-500/25 bg-violet-500/[0.08] text-violet-300 shadow-[0_0_18px_-6px_rgba(167,139,250,0.45)]",
    glow: "bg-violet-500/[0.05]",
  },
  rose: {
    eyebrow: "text-rose-400/90",
    bar: "from-rose-400/80 via-rose-400/25 to-transparent",
    iconChip:
      "border-rose-500/25 bg-rose-500/[0.08] text-rose-300 shadow-[0_0_18px_-6px_rgba(251,113,133,0.45)]",
    glow: "bg-rose-500/[0.05]",
  },
} as const;

export type HqWidgetTone = keyof typeof WIDGET_TONES;

export function HqWidget({
  title,
  eyebrow,
  icon: Icon,
  action,
  children,
  className = "",
  tone = "neutral",
}: {
  title?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Optional accent tone — colors the eyebrow, accent bar and icon chip. */
  tone?: HqWidgetTone;
}) {
  const t = WIDGET_TONES[tone];
  return (
    <section className={`group/widget relative scroll-mt-6 ${className}`}>
      {tone !== "neutral" ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute -inset-x-2 -top-4 h-24 rounded-full blur-3xl ${t.glow}`}
        />
      ) : null}
      {(title || eyebrow || Icon || action) && (
        <div className="relative mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p
                className={`text-[10px] font-extrabold uppercase tracking-[0.22em] ${t.eyebrow}`}
              >
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl">
                {title}
              </h2>
            ) : null}
            <div
              aria-hidden
              className={`mt-2 h-px w-24 bg-gradient-to-r ${t.bar} transition-all duration-500 group-hover/widget:w-40`}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {Icon ? (
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover/widget:scale-105 ${t.iconChip}`}
              >
                <Icon className="h-4 w-4" />
              </span>
            ) : null}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

export function HqWidgetGrid({
  children,
  id,
  className = "",
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const gridClassName = className ? `grid gap-4 ${className}` : "grid gap-4 lg:grid-cols-12";

  return <div id={id} className={gridClassName}>{children}</div>;
}

export function HqSummaryRail({ children }: { children: ReactNode }) {
  return (
    <aside className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] via-black/25 to-black/40 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-white/[0.03] blur-2xl"
      />
      <div className="relative grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </aside>
  );
}

export function HqMetric({
  label,
  value,
  tone = "neutral",
  delta,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";
  /** Optional trend, e.g. { text: "+3 cette sem.", direction: "up" }. */
  delta?: { text: string; direction: "up" | "down" | "flat" };
}) {
  const text = {
    neutral: "text-neutral-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone];
  const dot = {
    neutral: "bg-neutral-500",
    emerald: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
    amber: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]",
    rose: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]",
    sky: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]",
    violet: "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.8)]",
  }[tone];
  const deltaColor =
    delta?.direction === "up"
      ? "text-emerald-400"
      : delta?.direction === "down"
        ? "text-rose-400"
        : "text-neutral-500";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className={`truncate text-xs font-semibold ${text}`}>{label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className="tabular-nums text-sm font-bold text-white">{value}</span>
        {delta ? (
          <span className={`text-[10px] font-semibold ${deltaColor}`}>
            {delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "—"} {delta.text}
          </span>
        ) : null}
      </span>
    </div>
  );
}
