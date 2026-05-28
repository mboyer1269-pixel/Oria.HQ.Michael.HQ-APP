import {
  CheckCircle2,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";

export function AgenticFactoryStatus() {
  const statusItems = [
    {
      label: "Factory configured",
      description: "Delivery loop logic in place",
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    },
    {
      label: "Skills available",
      description: "Agents equipped with specialized SKILL.md",
      icon: <Sparkles className="h-5 w-5 text-amber-400" />,
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    },
    {
      label: "Human approval required",
      description: "Gatekeeper PR blocks active",
      icon: <ShieldAlert className="h-5 w-5 text-violet-400" />,
      badge: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    },
    {
      label: "Runtime protected",
      description: "In-process mock execution only",
      icon: <LockKeyhole className="h-5 w-5 text-blue-400" />,
      badge: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    },
    {
      label: "Production blocked",
      description: "VPS execution and writes suspended",
      icon: <XCircle className="h-5 w-5 text-red-400" />,
      badge: "border-red-500/20 bg-red-500/10 text-red-300",
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
          Static Configuration View
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
            <div className={`mt-4 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${item.badge}`}>
              Active
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
