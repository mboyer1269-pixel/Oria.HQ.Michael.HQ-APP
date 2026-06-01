import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Cockpit UI primitives. Server-compatible, presentational only.
// The Tooltip is pure CSS (Tailwind named group) so it reveals on hover — no
// click, no client JS. No state, no I/O.
// ---------------------------------------------------------------------------

type TooltipAlign = "center" | "left" | "right";

const ALIGN: Record<TooltipAlign, string> = {
  center: "left-1/2 -translate-x-1/2",
  left: "left-0",
  right: "right-0",
};

export function Tooltip({
  children,
  title,
  detail,
  meta,
  align = "center",
  className = "",
}: {
  children: ReactNode;
  title: string;
  detail: string;
  meta?: ReactNode;
  align?: TooltipAlign;
  className?: string;
}) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-[calc(100%+10px)] z-50 w-60 translate-y-1 rounded-xl border border-violet-500/40 bg-[#171b32]/95 p-3 text-left opacity-0 shadow-[0_24px_60px_-16px_rgba(0,0,0,.85)] backdrop-blur-md transition duration-150 group-hover/tip:translate-y-0 group-hover/tip:opacity-100 ${ALIGN[align]}`}
      >
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em] text-violet-300">
          {title}
        </span>
        <span className="mt-1.5 block text-xs leading-relaxed text-[#98a1c4]">{detail}</span>
        {meta ? (
          <span className="mt-2 block border-t border-white/10 pt-2 text-[11px] text-[#646c8e]">
            {meta}
          </span>
        ) : null}
      </span>
    </span>
  );
}

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
