import { z } from "zod";

/** Historical provenance only; never an execution assignment or permission. */
export const employeePreparationSchema = z.object({
  version: z.literal(1),
  employeeId: z.string().regex(/^emp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  revision: z.number().int().min(1).max(2147483646),
  ventureId: z.string().min(1).max(160).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)),
}).strict();
export type EmployeePreparation = z.infer<typeof employeePreparationSchema>;
export function employeePreparationHref(value: EmployeePreparation): `/hq/missions?${string}` {
  const params = new URLSearchParams({ employee: value.employeeId, revision: String(value.revision), venture: value.ventureId });
  return `/hq/missions?${params}#development-mission`;
}
export function parseEmployeePreparationParams(params: Record<string, string | string[] | undefined>): EmployeePreparation | null | "invalid" {
  if ([params.employee, params.revision, params.venture].every(value => value === undefined)) return null;
  if (typeof params.revision !== "string" || !/^[1-9][0-9]*$/.test(params.revision)) return "invalid";
  const parsed = employeePreparationSchema.safeParse({ version: 1, employeeId: params.employee, revision: Number(params.revision), ventureId: params.venture });
  return parsed.success ? parsed.data : "invalid";
}
