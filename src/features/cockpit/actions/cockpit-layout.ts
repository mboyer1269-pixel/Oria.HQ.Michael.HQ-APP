"use server";

// src/features/cockpit/actions/cockpit-layout.ts
//
// Server actions for persisting the cockpit widget order to Supabase.
// Layout is stored per-user in the cockpit_layout table (JSONB widget_order).

import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { requireOwnerAccess } from "@/server/auth/owner";

const DEFAULT_ORDER: string[] = [
  "daily-direction",
  "idea-intake",
  "decision-queue",
  "joris-agent",
  "treasury",
  "ventures",
  "modes",
];

function normalizeWidgetOrder(order: unknown): string[] {
  if (!Array.isArray(order)) return [...DEFAULT_ORDER];

  const known = new Set(DEFAULT_ORDER);
  const seen = new Set<string>();
  const validStoredOrder = order.filter((entry): entry is string => {
    if (typeof entry !== "string") return false;
    if (!known.has(entry)) return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
    return true;
  });

  return [
    ...validStoredOrder,
    ...DEFAULT_ORDER.filter((entry) => !seen.has(entry)),
  ];
}

export async function getCockpitLayout(userId: string): Promise<string[]> {
  try {
    const db = createOptionalSupabaseAdminClient();
    if (!db) return [...DEFAULT_ORDER];

    const { data, error } = await db
      .from("cockpit_layout")
      .select("widget_order")
      .eq("user_id", userId)
      .single();

    if (error || !data?.widget_order) return [...DEFAULT_ORDER];

    return normalizeWidgetOrder(data.widget_order);
  } catch {
    return [...DEFAULT_ORDER];
  }
}

export async function saveCockpitLayout(order: string[]): Promise<void> {
  const access = await requireOwnerAccess("/hq/cockpit");
  if (access.status === "forbidden") return;

  try {
    const db = createOptionalSupabaseAdminClient();
    if (!db) return;

    await db.from("cockpit_layout").upsert(
      {
        user_id: access.user.id,
        widget_order: normalizeWidgetOrder(order),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    // Non-fatal — layout falls back to default on next load
  }
}
