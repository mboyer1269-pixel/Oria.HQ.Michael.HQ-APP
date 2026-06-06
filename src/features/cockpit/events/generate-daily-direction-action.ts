"use server";

import { revalidatePath } from "next/cache";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { requireOwnerAccess } from "@/server/auth/owner";
import { generateDailyDirection } from "@/server/joris/daily-direction-generator";
import {
  appendEvent,
  listDailyDirectionEvents,
  listIdeaCapturedEvents,
} from "./event-client";
import {
  projectTodayDailyDirection,
  type DailyDirectionProjection,
} from "./daily-direction-projection";

export type GenerateDailyDirectionState =
  | { status: "idle" }
  | { status: "success"; projection: DailyDirectionProjection; alreadyExisted: boolean }
  | { status: "forbidden" }
  | { status: "error"; message: string };

/**
 * Server Action: generate (or return existing) daily direction for today.
 *
 * Idempotent: if a direction already exists for today, returns it without
 * calling the LLM again. Never persists a non-validated object.
 */
export async function generateDailyDirectionAction(): Promise<GenerateDailyDirectionState> {
  const access = await requireOwnerAccess("/hq/cockpit");

  if (access.status === "forbidden") {
    return { status: "forbidden" };
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;
  const userId = access.user.id;
  const todayIso = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Idempotency check — return existing direction if already generated today.
  try {
    const existing = await listDailyDirectionEvents({
      workspaceId,
      userId,
      dateIso: todayIso,
      limit: 1,
    });

    const existingProjection = projectTodayDailyDirection(existing, todayIso);
    if (existingProjection) {
      return { status: "success", projection: existingProjection, alreadyExisted: true };
    }
  } catch {
    // If we can't check for existing, proceed to generate (worst case: duplicate).
  }

  // Load real events to feed Joris.
  let ideaEvents: Awaited<ReturnType<typeof listIdeaCapturedEvents>> = [];
  try {
    ideaEvents = await listIdeaCapturedEvents({ workspaceId, userId, limit: 30 });
  } catch {
    // Proceed with empty set — generator handles zero-state honestly.
  }

  // Generate via LLM.
  const result = await generateDailyDirection({ ideaEvents, dateIso: todayIso });

  if (!result.ok) {
    return {
      status: "error",
      message: `Joris n'a pas pu générer la direction : ${result.reason}`,
    };
  }

  // Persist as event.
  let eventId: string;
  try {
    const saved = await appendEvent({
      workspaceId,
      userId,
      streamId: `${workspaceId}:daily-direction`,
      type: "daily.direction.generated",
      payload: result.payload,
    });
    eventId = saved.id;
  } catch {
    return {
      status: "error",
      message: "La direction a été générée mais n'a pas pu être persistée.",
    };
  }

  revalidatePath("/hq/cockpit");

  return {
    status: "success",
    projection: {
      eventId,
      payload: result.payload,
      recordedAt: new Date().toISOString(),
    },
    alreadyExisted: false,
  };
}
