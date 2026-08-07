// ⚠️ SUPERSEDED — not rendered anywhere, and not a candidate for wiring as-is.
//
// Written 2026-06-01/05, before the current cockpit landed on 2026-06-06
// (founder-zero-state.tsx + cockpit-interactive.tsx). Kept for reference on an
// explicit CEO decision, not because it is pending work.
//
// A complete, careful widget schema with zero consumers. A second widget system
// (hq-widget-system.tsx) is proposed in PR #298. Neither is wired — do not build
// on this one until that is resolved.
//
// Before reviving any of this: what it displays was written against a system
// that has since moved. Check every claim against reality first — a panel that
// misreports the system is worse than a missing one.

import { z } from "zod";
import { eventTypeSchema } from "@/features/cockpit/events/event-record";

const nonEmptyTextSchema = (max: number) =>
  z.string().trim().min(1, "Champ obligatoire.").max(max, `Maximum ${max} caractères.`);

export const widgetManifestSchema = z
  .object({
    id: nonEmptyTextSchema(80).regex(/^[a-z0-9][a-z0-9-]*$/, "Identifiant widget invalide."),
    title: nonEmptyTextSchema(80),
    description: nonEmptyTextSchema(240),
    renderKind: z.enum(["stub_card", "idea_intake", "decision_queue"]),
    dataTruth: z.enum(["real_events", "derived_from_events", "stub"]),
    source: z
      .object({
        kind: z.enum(["events", "stub"]),
        table: nonEmptyTextSchema(80).optional(),
        eventTypes: z.array(eventTypeSchema).default([]),
        description: nonEmptyTextSchema(180),
      })
      .strict(),
    lifecycleStatus: z.enum(["active", "coming_soon", "retired"]),
    createdBy: z.enum(["system", "owner"]),
    constraints: z
      .object({
        noGeneratedCode: z.literal(true),
        noRuntimeExecution: z.literal(true),
        noJorisWidgetCreation: z.literal(true),
        allowedEventTypes: z.array(eventTypeSchema).default([]),
      })
      .strict(),
    layout: z
      .object({
        region: z.enum(["primary", "queue", "stubs"]),
        order: z.number().int().nonnegative(),
        minColumnSpan: z.number().int().min(1).max(2).default(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.source.kind === "stub" && manifest.dataTruth !== "stub") {
      ctx.addIssue({
        code: "custom",
        path: ["dataTruth"],
        message: "Un widget stub doit déclarer dataTruth=stub.",
      });
    }

    if (manifest.source.kind === "events" && manifest.source.table !== "events") {
      ctx.addIssue({
        code: "custom",
        path: ["source", "table"],
        message: "Les widgets event-sourced doivent lire la table events.",
      });
    }
  });

export type WidgetManifest = z.infer<typeof widgetManifestSchema>;

export function parseWidgetManifest(input: unknown): WidgetManifest {
  return widgetManifestSchema.parse(input);
}

export function validateWidgetManifest(input: unknown) {
  return widgetManifestSchema.safeParse(input);
}
