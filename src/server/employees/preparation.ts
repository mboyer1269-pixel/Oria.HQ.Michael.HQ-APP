import "server-only";
import type { EmployeePreparation } from "@/core/employees/preparation";
import type { EmployeeStore } from "@/core/employees/types";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { EMPLOYEE_DIRECTORY_LIVE } from "./flag";
import { createEmployeeStore } from "./store";
import { readEmployees } from "./service";
import { getVentureById, getVenturePersistenceMode } from "@/server/ventures/venture-repository";

export type PreparationContext = { workspaceId: string; actorId: string };
/** Caller supplies the authenticated actor, never ownership from the payload. */
export function createEmployeePreparationVerifier(deps: {
  enabled?: () => boolean;
  workspace?: typeof getDefaultWorkspace;
  durable?: () => boolean;
  venture?: typeof getVentureById;
  store?: () => EmployeeStore | null;
} = {}) {
  return async (reference: EmployeePreparation, context: PreparationContext): Promise<"ready" | "disabled" | "unavailable" | "conflict"> => {
    if (!(deps.enabled ?? (() => EMPLOYEE_DIRECTORY_LIVE))()) return "disabled";
    try {
      const workspace = (deps.workspace ?? getDefaultWorkspace)({ ownerUserId: context.actorId });
      if (workspace.id !== context.workspaceId || workspace.ownerUserId !== context.actorId) return "conflict";
      if (!(deps.durable ?? (() => getVenturePersistenceMode() === "supabase"))()) return "unavailable";
      if (!await (deps.venture ?? getVentureById)(context.workspaceId, reference.ventureId)) return "conflict";
      const result = await readEmployees({ ownerId: context.actorId, workspaceId: context.workspaceId, ventureId: reference.ventureId }, (deps.store ?? createEmployeeStore)());
      if (result.status !== "ready") return "unavailable";
      const employee = result.employees.find(row => row.id === reference.employeeId);
      return employee?.state === "draft" && employee.revision === reference.revision ? "ready" : "conflict";
    } catch { return "unavailable"; }
  };
}
export const verifyEmployeePreparation = createEmployeePreparationVerifier();
