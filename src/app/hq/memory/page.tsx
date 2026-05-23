import type { Route } from "next";
import Link from "next/link";
import { ArrowLeft, BrainCircuit } from "lucide-react";
import { AgentLeaderboard } from "@/features/memory/components/agent-leaderboard";
import { DailyLogCard } from "@/features/memory/components/daily-log-card";
import { MemorySubjectCard } from "@/features/memory/components/memory-subject-card";
import { MoneyboardPanel } from "@/features/memory/components/moneyboard-panel";
import { VentureProgressPanel } from "@/features/memory/components/venture-progress-panel";
import {
  agentLeaderboard,
  memorySubjects,
  moneyboard,
  recentDailyLogs,
  ventureProgress,
} from "@/features/memory/seed";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { requireOwnerAccess } from "@/server/auth/owner";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const access = await requireOwnerAccess("/hq/memory");

  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-10">
      <header className="flex flex-col gap-4">
        <Link
          href={"/hq" as Route}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Michael HQ
        </Link>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          <BrainCircuit className="h-3.5 w-3.5" />
          Memory Wiki
        </div>
        <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl">
          Mémoire opérationnelle &amp; scoreboard de holding
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-neutral-400">
          Ce qui a été décidé, construit, produit par chaque agent, ce qui avance, ce que ça coûte et ce que ça
          rapporte. Lecture seule — données illustratives jusqu&apos;au branchement du Memory Log Contract.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Memory Subjects</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {memorySubjects.map((subject) => (
            <MemorySubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Daily Logs</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {recentDailyLogs.map((log) => (
            <DailyLogCard key={log.date} log={log} />
          ))}
        </div>
      </section>

      <MoneyboardPanel data={moneyboard} />

      <AgentLeaderboard scores={agentLeaderboard} />

      <VentureProgressPanel ventures={ventureProgress} />
    </main>
  );
}
