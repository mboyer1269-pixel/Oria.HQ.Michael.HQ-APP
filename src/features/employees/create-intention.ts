import type { EmployeeFields, EmployeeScope } from "@/core/employees/types";
import { EMPLOYEE_FIELD_KEYS, isValidEmployeeField } from "../../core/employees/field-rules";

/** Browser recovery only. The server/database, never this record, enforce idempotency. */
export type CreateIntention = { version: 1; createdAt: number; creationKey: string; fields: EmployeeFields };
export type IntentionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function intentionStorageKey(scope: EmployeeScope): string {
  return `oria:employee-create:v1:${JSON.stringify([scope.ownerId, scope.workspaceId, scope.ventureId])}`;
}
export function validIntention(value: unknown): value is CreateIntention {
  if (!value || typeof value !== "object") return false;
  const row = value as CreateIntention;
  if (!Number.isSafeInteger(row.createdAt) || row.createdAt < 0 || row.version !== 1 || typeof row.creationKey !== "string" || !uuid.test(row.creationKey) || !row.fields || typeof row.fields !== "object") return false;
  if (Object.keys(row).sort().join() !== "createdAt,creationKey,fields,version" || Object.keys(row.fields).sort().join() !== [...EMPLOYEE_FIELD_KEYS].sort().join()) return false;
  return EMPLOYEE_FIELD_KEYS.every((key) => isValidEmployeeField(key, row.fields[key]));
}
export function readIntention(storage: IntentionStorage, scope: EmployeeScope): CreateIntention | null {
  const raw = storage.getItem(intentionStorageKey(scope));
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!validIntention(value) || value.createdAt > Date.now()) throw new Error("Invalid recovery record");
  return value;
}
/** Advisory age only: an old intention retains its original key and payload for recovery. */
export function isIntentionStale(intention: CreateIntention, now: number): boolean {
  return now - intention.createdAt > 24 * 60 * 60 * 1000;
}
export function retainIntention(storage: IntentionStorage, scope: EmployeeScope, intention: CreateIntention): void {
  if (!validIntention(intention)) throw new Error("Invalid recovery record");
  const serialized = JSON.stringify(intention);
  const key = intentionStorageKey(scope);
  const existing = storage.getItem(key);
  if (existing !== null && existing !== serialized) throw new Error("A different intention is unresolved");
  storage.setItem(key, serialized);
  if (storage.getItem(key) !== serialized) throw new Error("Recovery record not acknowledged");
}
export function clearIntention(storage: IntentionStorage, scope: EmployeeScope): void {
  const key = intentionStorageKey(scope);
  storage.removeItem(key);
  if (storage.getItem(key) !== null) throw new Error("Recovery record not removed");
}
