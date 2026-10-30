import { z } from "zod";

export const COCKPIT_WIDGET_IDS = ["daily-direction", "idea-intake", "decision-queue", "joris-agent", "treasury", "ventures", "modes"] as const;
export type CockpitWidgetId = typeof COCKPIT_WIDGET_IDS[number];
export const defaultCockpitOrder = (): CockpitWidgetId[] => [...COCKPIT_WIDGET_IDS];
const orderSchema = z.array(z.enum(COCKPIT_WIDGET_IDS)).length(COCKPIT_WIDGET_IDS.length)
  .refine((order) => new Set(order).size === COCKPIT_WIDGET_IDS.length);
export const cockpitRevisionSchema = z.string().max(40).datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value)));
export const cockpitLayoutWriteSchema = z.object({ order: orderSchema, expectedRevision: cockpitRevisionSchema.nullable() }).strict();
export type CockpitLayoutWrite = z.infer<typeof cockpitLayoutWriteSchema>;
export type CockpitLayoutReady = { status: "loaded"; order: CockpitWidgetId[]; revision: string } | { status: "missing"; order: CockpitWidgetId[]; revision: null };
export type CockpitLayoutRead = CockpitLayoutReady | { status: "forbidden" | "unavailable" | "failed" };
export type CockpitLayoutSave =
  | { status: "confirmed"; order: CockpitWidgetId[]; revision: string }
  | { status: "not_attempted"; reason: "forbidden" | "unavailable" | "invalid_request" | "read_failed" }
  | { status: "conflict" }
  | { status: "unconfirmed" };

export function isCockpitLayoutReady(value: CockpitLayoutRead): value is CockpitLayoutReady {
  return value.status === "loaded" || value.status === "missing";
}

/** Preserve legacy read normalization; never turn a read failure into a stored default. */
export function normalizeCockpitOrder(value: unknown[]): CockpitWidgetId[] {
  const known = new Set<string>(COCKPIT_WIDGET_IDS);
  const seen = new Set<string>();
  const order = value.filter((entry): entry is CockpitWidgetId => {
    if (typeof entry !== "string" || !known.has(entry) || seen.has(entry)) return false;
    seen.add(entry); return true;
  });
  return [...order, ...COCKPIT_WIDGET_IDS.filter((entry) => !seen.has(entry))];
}
