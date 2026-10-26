import type { EmployeeCommand, EmployeeFields, EmployeeListResult, EmployeeProfile, EmployeeScope, EmployeeStore, EmployeeWriteResult } from "@/core/employees/types";

const limits = { displayName: 80, specialty: 120, instructions: 4000, assignmentRole: 120, assignmentContext: 2000 } as const;
const fieldKeys = Object.keys(limits) as (keyof EmployeeFields)[];
export const employeeIdPattern = /^emp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const unavailable = { status: "unavailable", message: "Équipe indisponible : la persistance durable n’est pas qualifiée. Aucune sauvegarde confirmée." } as const;
const invalid = { status: "invalid", message: "Nom, mandat ou identifiant invalide. Aucun champ d’exécution n’est accepté." } as const;

function fields(input: Record<string, unknown>): EmployeeFields | null {
  const result = {} as EmployeeFields;
  for (const key of fieldKeys) {
    const value = input[key];
    if (typeof value !== "string") return null;
    const normalized = value.trim();
    if (!normalized || [...normalized].length > limits[key] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) return null;
    if ((key === "displayName" || key === "specialty" || key === "assignmentRole") && /[\r\n\t]/.test(normalized)) return null;
    result[key] = normalized;
  }
  return result;
}
export function parseEmployeeCommand(input: unknown): EmployeeCommand | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const op = value.operation;
  if (op === "create" && (typeof value.creationKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.creationKey))) return null;
  if (op !== "create" && op !== "edit" && op !== "archive") return null;
  const keys = op === "create" ? ["operation", "creationKey", ...fieldKeys] : op === "edit" ? ["operation", "id", "revision", ...fieldKeys] : ["operation", "id", "revision"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) return null;
  if (op !== "create" && (typeof value.id !== "string" || !employeeIdPattern.test(value.id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || Number(value.revision) >= 2147483647)) return null;
  if (op === "archive") return { operation: op, id: value.id as string, revision: value.revision as number };
  const parsed = fields(value);
  if (!parsed) return null;
  return op === "create" ? { operation: op, creationKey: value.creationKey as string, ...parsed } : { operation: op, id: value.id as string, revision: value.revision as number, ...parsed };
}
function checked(row: EmployeeProfile, scope: EmployeeScope): EmployeeProfile {
  const clean = fields(row);
  if (!clean || !employeeIdPattern.test(row.id) || row.ownerId !== scope.ownerId || row.workspaceId !== scope.workspaceId || row.ventureId !== scope.ventureId || !["draft", "archived"].includes(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 1) throw Error("Invalid employee response");
  return { ...clean, id: row.id, ...scope, state: row.state, revision: row.revision };
}
export async function readEmployees(scope: EmployeeScope, store: EmployeeStore | null): Promise<EmployeeListResult> {
  if (!store) return unavailable;
  try {
    const employees = (await store.list(scope)).map(row => checked(row, scope));
    if (new Set(employees.map(row => row.id)).size !== employees.length) throw Error("Duplicate identity");
    return { status: "ready", employees };
  } catch { return unavailable; }
}
export async function saveEmployee(scope: EmployeeScope, input: unknown, store: EmployeeStore | null): Promise<EmployeeWriteResult> {
  const command = parseEmployeeCommand(input);
  if (!command) return invalid;
  if (!store) return unavailable;
  try {
    const row = command.operation === "create" ? await store.create(scope, fields(command)!, command.creationKey) : await store.change(scope, command);
    if (!row) return { status: "conflict", message: "Intention incompatible, profil absent, archivé ou modifié ailleurs. Rechargez l’équipe avant de recommencer." };
    const employee = checked(row, scope);
    if (command.operation !== "create" && (employee.id !== command.id || employee.revision !== command.revision + 1)) throw Error("Unconfirmed update");
    // A create replay may return the current edited/archived profile. The store
    // verifies the immutable original payload fingerprint and full scope first.
    if (command.operation !== "create" && employee.state !== (command.operation === "archive" ? "archived" : "draft")) throw Error("Unconfirmed state");
    if (command.operation === "edit" && fieldKeys.some(k => employee[k] !== command[k])) throw Error("Unconfirmed fields");
    return { status: "saved", employee };
  } catch { return unavailable; }
}
