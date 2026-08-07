import type { ReactNode } from "react";

export { Tooltip } from "./tooltip";

// ---------------------------------------------------------------------------
// Cockpit UI primitives.
// ---------------------------------------------------------------------------

const TONE: Record<string, string> = {
  critical: "border-rose-500/30 bg-rose-500/12 text-rose-300",
  high: "border-orange-500/30 bg-orange-500/12 text-orange-300",
  medium: "border-amber-500/25 bg-amber-500/12 text-amber-300",
  low: "border-white/10 bg-white/5 text-[#98a1c4]",
  ok: "border-emerald-500/30 bg-emerald-500/12 text-emerald-300",
  info: "border-cyan-500/28 bg-cyan-500/10 text-cyan-300",
  violet: "border-violet-500/30 bg-violet-500/12 text-violet-200",
};

export function Tag({
  tone = "info",
  children,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[20px] border border-white/[0.06] bg-[#141a2c]/60 p-[18px] shadow-[0_18px_44px_-22px_rgba(0,0,0,.72)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">{children}</p>
  );
}
