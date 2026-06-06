"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { appendEvent, getEventPersistenceMode, type EventPersistenceMode } from "./event-client";
import { buildIdeaCapturedPayload } from "./event-record";
import { requireOwnerAccess } from "@/server/auth/owner";

export type CaptureIdeaActionState = {
  status: "idle" | "saved" | "error" | "forbidden";
  message?: string;
  errors?: string[];
  eventId?: string;
  storageMode?: EventPersistenceMode;
  submittedAt?: string;
};

function toValidationErrors(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message);
  }

  return ["L'idée n'a pas pu être validée."];
}

export async function captureIdeaAction(
  _previousState: CaptureIdeaActionState,
  formData: FormData,
): Promise<CaptureIdeaActionState> {
  const access = await requireOwnerAccess("/hq/cockpit");

  if (access.status === "forbidden") {
    return {
      status: "forbidden",
      message: "Accès réservé au propriétaire.",
      submittedAt: new Date().toISOString(),
    };
  }

  let payload;
  try {
    payload = buildIdeaCapturedPayload({
      rawText: String(formData.get("rawText") ?? ""),
    });
  } catch (error) {
    return {
      status: "error",
      message: "L'idée n'a pas été enregistrée.",
      errors: toValidationErrors(error),
      submittedAt: new Date().toISOString(),
    };
  }

  const workspaceId = getDefaultWorkspace({ ownerUserId: access.user.id }).id;

  try {
    const event = await appendEvent({
      workspaceId,
      userId: access.user.id,
      streamId: `${workspaceId}:ideas`,
      type: "idea.captured",
      payload,
    });

    revalidatePath("/hq/cockpit");

    return {
      status: "saved",
      message: "Idée capturée dans le journal d'événements.",
      eventId: event.id,
      storageMode: getEventPersistenceMode(),
      submittedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "error",
      message: "La persistance a échoué. Rien n'a été enregistré.",
      errors: ["Réessaie après avoir vérifié la connexion Supabase."],
      submittedAt: new Date().toISOString(),
    };
  }
}
