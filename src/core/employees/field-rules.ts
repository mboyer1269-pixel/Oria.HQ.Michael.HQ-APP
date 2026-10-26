import type { EmployeeFields } from "@/core/employees/types";
import { isValidDisplayText, normalizeDisplayText, type DisplayTextOptions } from "../text/display-text-rule";

/** Per-field display-text rules (mirrored by the CHECKs in 0035_employee_profiles.sql). */
export const EMPLOYEE_FIELD_RULES: Readonly<Record<keyof EmployeeFields, DisplayTextOptions>> = {
  displayName: { maxLength: 80 },
  specialty: { maxLength: 120 },
  instructions: { maxLength: 4000, multiline: true },
  assignmentRole: { maxLength: 120 },
  assignmentContext: { maxLength: 2000, multiline: true },
};

export const EMPLOYEE_FIELD_KEYS = Object.keys(EMPLOYEE_FIELD_RULES) as (keyof EmployeeFields)[];

export function isValidEmployeeField(key: keyof EmployeeFields, value: unknown): value is string {
  return isValidDisplayText(value, EMPLOYEE_FIELD_RULES[key]);
}

export function normalizeEmployeeField(key: keyof EmployeeFields, value: unknown): string | null {
  return normalizeDisplayText(value, EMPLOYEE_FIELD_RULES[key]);
}
