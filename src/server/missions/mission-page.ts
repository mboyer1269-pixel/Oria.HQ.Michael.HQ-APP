import type { Mission, MissionStatus } from "@/core/types";
import { summarizeMissions, type MissionSummary } from "@/features/missions/summary";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { listMissionsForWorkspace } from "./mission-repository";
import { mapMissionRow } from "./mission-row";
import { evaluateMissionApproval } from "./approval-service";
import type { ListMissionsInput } from "./types";

export const MISSION_PAGE_SIZE = 25;
const statuses: MissionStatus[] = ["draft", "queued", "running", "needs_approval", "completed", "failed", "cancelled"];
export type MissionPageFilter = { page: number; q: string; status: MissionStatus | "all" | "review" };
export function parseMissionPageFilter(params: Record<string, string | string[] | undefined>): MissionPageFilter {
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  return {
    page: Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 1000000 ? rawPage : 1,
    q: typeof params.q === "string" ? params.q.trim().slice(0, 200) : "",
    status: typeof params.status === "string" && (params.status === "review" || statuses.includes(params.status as MissionStatus)) ? params.status as MissionPageFilter["status"] : "all",
  };
}
export function missionPageHref(filter: MissionPageFilter, page = filter.page) {
  const params = new URLSearchParams({ page: String(page) });
  if (filter.q) params.set("q", filter.q);
  if (filter.status !== "all") params.set("status", filter.status);
  return `/hq/missions?${params}`;
}
export function paginateLocalMissions(missions: Mission[], filter: MissionPageFilter) {
  const q = filter.q.toLocaleLowerCase("fr");
  const filtered = missions.filter((m) => (filter.status === "all" || (filter.status === "review" ? evaluateMissionApproval(m).required : m.status === filter.status))
    && (!q || m.title.toLocaleLowerCase("fr").includes(q) || m.objective.toLocaleLowerCase("fr").includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { missions: filtered.slice((filter.page - 1) * MISSION_PAGE_SIZE, filter.page * MISSION_PAGE_SIZE), filteredTotal: filtered.length,
    summary: summarizeMissions(missions), reviewTotal: missions.filter((m) => evaluateMissionApproval(m).required).length };
}
const REVIEW_FILTER = "requires_approval.eq.true,risk_level.eq.high,autonomy_level.gte.4,status.eq.needs_approval";
// Quoted PostgREST values protect OR syntax; regex metacharacters are literal.
export function missionSearchFilter(q: string) {
  const literal = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = JSON.stringify(literal);
  return `title.imatch.${quoted},objective.imatch.${quoted}`;
}

/** Dedicated UI query. Existing execution/repository list contracts are unchanged. */
export async function listMissionPage(input: ListMissionsInput, filter: MissionPageFilter,
  client = createOptionalSupabaseAdminClient()): Promise<{ missions: Mission[]; filteredTotal: number; summary: MissionSummary; reviewTotal: number; source: "supabase" | "local" | "mock"; pageNumber: number }> {
  if (!client) {
    const local = await listMissionsForWorkspace(input);
    return { ...paginateLocalMissions(local.missions, filter), source: local.source, pageNumber: filter.page };
  }
  function scoped(head = false) {
    let query = client!.from("missions").select("*", { count: "exact", head }).eq("workspace_id", input.workspaceId);
    if (input.modeId !== undefined) query = query.eq("mode_id", input.modeId);
    return query;
  }
  let pageQuery = scoped();
  if (filter.status === "review" && filter.q) pageQuery = pageQuery.or(`and(or(${REVIEW_FILTER}),or(${missionSearchFilter(filter.q)}))`);
  else {
    if (filter.status === "review") pageQuery = pageQuery.or(REVIEW_FILTER);
    if (filter.q) pageQuery = pageQuery.or(missionSearchFilter(filter.q));
  }
  if (filter.status !== "all" && filter.status !== "review") pageQuery = pageQuery.eq("status", filter.status);
  const [page, counts, review] = await Promise.all([
    pageQuery.order("created_at", { ascending: false }).order("id", { ascending: true })
      .range((filter.page - 1) * MISSION_PAGE_SIZE, filter.page * MISSION_PAGE_SIZE - 1),
    Promise.all(statuses.map((status) => scoped(true).eq("status", status))),
    scoped(true).or(REVIEW_FILTER),
  ]);
  if (page.error?.code === "PGRST103" && filter.page > 1) {
    return listMissionPage(input, { ...filter, page: 1 }, client);
  }
  if ([page, ...counts, review].some((result) => result.error || result.count === null)) throw new Error("Mission listing unavailable.");
  const summary = summarizeMissions([]) as MissionSummary;
  statuses.forEach((status, index) => { summary[status] = counts[index].count!; summary.total += counts[index].count!; });
  return { missions: (page.data ?? []).map(mapMissionRow), filteredTotal: page.count!, summary, reviewTotal: review.count!, source: "supabase" as const, pageNumber: filter.page };
}
