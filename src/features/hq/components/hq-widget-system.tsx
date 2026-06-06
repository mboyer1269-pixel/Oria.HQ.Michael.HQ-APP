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

export function HqWidget({
  title,
  eyebrow,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`scroll-mt-6 ${className}`}
    >
      {(title || eyebrow || Icon || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-neutral-500">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="mt-1 text-xl font-bold leading-tight text-white sm:text-2xl">
                {title}
              </h2>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {Icon ? (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-neutral-300">
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
    <aside className="rounded-2xl border border-white/[0.07] bg-black/25 p-4">
      {children}
    </aside>
  );
}

export function HqMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const text = {
    neutral: "text-neutral-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone];

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] px-3 py-2">
      <span className={`text-xs font-semibold ${text}`}>{label}</span>
      <span className="tabular-nums text-sm font-bold text-white">{value}</span>
    </div>
  );
}
