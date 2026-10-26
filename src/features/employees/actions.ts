"use server";

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import type { EmployeeListResult, EmployeeWriteResult } from "@/core/employees/types";
import { requireOwnerAccess } from "@/server/auth/owner";
import { getVentureById, getVenturePersistenceMode } from "@/server/ventures/venture-repository";
import { EMPLOYEE_DIRECTORY_LIVE } from "@/server/employees/flag";
import { createEmployeeStore } from "@/server/employees/store";
import { parseEmployeeCommand, readEmployees, saveEmployee, unavailable } from "@/server/employees/service";

async function resolveScope(ventureId: unknown) {
  const access = await requireOwnerAccess("/hq/ventures");
  if (access.status === "forbidden") return { error: { status: "forbidden", message: "Accès réservé au propriétaire." } } as const;
  if (typeof ventureId !== "string" || !ventureId.trim() || ventureId !== ventureId.trim() || ventureId.length > 160 || /[\u0000-\u001f\u007f]/.test(ventureId)) return { error: { status: "invalid", message: "Business invalide." } } as const;
  const workspace = getDefaultWorkspace({ ownerUserId: access.user.id });
  // Existing single-owner gate is authoritative. Workspace registry is not a multi-tenant membership database.
  if (workspace.ownerUserId !== access.user.id) return { error: { status: "forbidden", message: "Workspace non autorisé." } } as const;
  if (!EMPLOYEE_DIRECTORY_LIVE) return { error: unavailable } as const;
  try {
    if (getVenturePersistenceMode() !== "supabase") return { error: unavailable } as const;
    const venture = await getVentureById(workspace.id, ventureId);
    if (!venture) return { error: { status: "forbidden", message: "Business inaccessible dans ce workspace." } } as const;
    return { scope: { ownerId: access.user.id, workspaceId: workspace.id, ventureId: venture.id } };
  } catch { return { error: unavailable } as const; }
}
export async function readEmployeesAction(ventureId: unknown): Promise<EmployeeListResult> {
  const context = await resolveScope(ventureId);
  if (context.error) return context.error;
  try { return await readEmployees(context.scope, createEmployeeStore()); } catch { return unavailable; }
}
export async function saveEmployeeAction(ventureId: unknown, input: unknown): Promise<EmployeeWriteResult> {
  // Authenticate even malformed requests. No caller-supplied owner/workspace is consumed.
  const context = await resolveScope(ventureId);
  if (context.error?.status === "forbidden") return context.error;
  if (!parseEmployeeCommand(input)) return { status: "invalid", message: "Champs non valides ou non autorisés." };
  if (context.error) return context.error;
  try { return await saveEmployee(context.scope, input, createEmployeeStore()); } catch { return unavailable; }
}
