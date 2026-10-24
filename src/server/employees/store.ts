import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { EmployeeFields, EmployeeProfile, EmployeeScope, EmployeeStore } from "@/core/employees/types";
import type { EmployeeProfileInsert, EmployeeProfileRow } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

const columns = "id,creation_key,creation_payload_hash,owner_id,workspace_id,venture_id,display_name,specialty,instructions,assignment_role,assignment_context,state,revision";
const limits = { displayName: 80, specialty: 120, instructions: 4000, assignmentRole: 120, assignmentContext: 2000 } as const;
function fail(): never { throw new Error("Employee directory persistence unavailable."); }
function validFields(fields: EmployeeFields): void {
  for (const [key, max] of Object.entries(limits)) {
    const value = fields[key as keyof EmployeeFields];
    const controls = key === "instructions" || key === "assignmentContext" ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u : /[\u0000-\u001f\u007f]/u;
    if (typeof value !== "string" || value !== value.trim() || !value || [...value].length > max || controls.test(value)) fail();
  }
}
function fieldsToRow(fields: EmployeeFields) {
  validFields(fields);
  return { display_name: fields.displayName, specialty: fields.specialty, instructions: fields.instructions,
    assignment_role: fields.assignmentRole, assignment_context: fields.assignmentContext };
}
function fromRow(row: EmployeeProfileRow, scope: EmployeeScope): EmployeeProfile {
  if (!row || row.owner_id !== scope.ownerId || row.workspace_id !== scope.workspaceId || row.venture_id !== scope.ventureId ||
    !/^emp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(row.id) ||
    !["draft", "archived"].includes(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 1) fail();
  const result: EmployeeProfile = { id: row.id, ownerId: row.owner_id, workspaceId: row.workspace_id, ventureId: row.venture_id,
    displayName: row.display_name, specialty: row.specialty, instructions: row.instructions,
    assignmentRole: row.assignment_role, assignmentContext: row.assignment_context, state: row.state, revision: row.revision };
  validFields(result);
  return result;
}

/** Uses the same server-only transport as the venture repository. No memory fallback.
 * Caller MUST derive scope from authenticated owner and verify venture membership.
 * Composite DB FK independently enforces venture/workspace pairing. */
export function createEmployeeStore(): EmployeeStore | null {
  const db = createOptionalSupabaseAdminClient();
  if (!db) return null;
  return {
    async list(scope) {
      const { data, error } = await db.from("employee_profiles").select(columns)
        .eq("owner_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("venture_id", scope.ventureId).order("id");
      if (error || !Array.isArray(data)) fail();
      return data.map(row => fromRow(row, scope));
    },
    async create(scope, fields, creationKey) {
      validFields(fields);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(creationKey)) fail();
      const payloadHash = createHash("sha256").update(JSON.stringify([
        fields.displayName, fields.specialty, fields.instructions, fields.assignmentRole, fields.assignmentContext,
      ])).digest("hex");
      const row: EmployeeProfileInsert = { ...fieldsToRow(fields), id: `emp_${randomUUID()}`,
        creation_key: creationKey, creation_payload_hash: payloadHash, owner_id: scope.ownerId,
        workspace_id: scope.workspaceId, venture_id: scope.ventureId, state: "draft", revision: 1 };
      // Unique creation_key serializes identical concurrent intentions in PostgreSQL.
      // Never upsert: a replay must not overwrite an edited or archived profile.
      const { data, error } = await db.from("employee_profiles").insert(row).select(columns).single();
      if (error?.code === "23505") {
        const replay = await db.from("employee_profiles").select(columns).eq("creation_key", creationKey)
          .eq("owner_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("venture_id", scope.ventureId).maybeSingle();
        if (replay.error) fail();
        // No row in this scope, or different initial content: generic conflict only.
        if (!replay.data || replay.data.creation_key !== creationKey || replay.data.creation_payload_hash !== payloadHash) return null;
        return fromRow(replay.data, scope);
      }
      if (error || !data) fail();
      const result = fromRow(data, scope);
      if (data.creation_key !== creationKey || data.creation_payload_hash !== payloadHash ||
        result.id !== row.id || result.state !== "draft" || result.revision !== 1 ||
        Object.keys(limits).some(key => result[key as keyof EmployeeFields] !== fields[key as keyof EmployeeFields])) fail();
      return result;
    },
    async change(scope, command) {
      const update = command.operation === "archive" ? { state: "archived" as const, revision: command.revision + 1 }
        : { ...fieldsToRow(command), revision: command.revision + 1 };
      const { data, error } = await db.from("employee_profiles").update(update)
        .eq("owner_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("venture_id", scope.ventureId)
        .eq("id", command.id).eq("revision", command.revision).eq("state", "draft").select(columns).maybeSingle();
      if (error) fail();
      if (!data) return null; // conflict or not in this scope, no existence disclosure
      const result = fromRow(data, scope);
      if (result.id !== command.id || result.revision !== command.revision + 1 ||
        result.state !== (command.operation === "archive" ? "archived" : "draft") ||
        (command.operation === "edit" && Object.keys(limits).some(key => result[key as keyof EmployeeFields] !== command[key as keyof EmployeeFields]))) fail();
      return result;
    },
  };
}
