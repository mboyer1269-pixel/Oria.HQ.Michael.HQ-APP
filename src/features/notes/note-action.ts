"use server";

// Owner-gated server actions for CEO Notes (same defense-in-depth pattern as
// venture-asset-action.ts). workspaceId always derived server-side.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  listNotes,
  setNoteArchived,
  upsertNote,
  type CeoNote,
} from "@/server/notes/note-repository";

async function resolveOwnerWorkspaceId(): Promise<string | null> {
  const access = await requireOwnerAccess("/hq/notes");
  if (access.status === "forbidden") return null;
  return getDefaultWorkspace({ ownerUserId: access.user.id }).id;
}

export async function saveNoteAction(input: {
  id?: string;
  title: string;
  body: string;
  pinned?: boolean;
}): Promise<{ status: "saved"; note: CeoNote } | { status: "forbidden" }> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return { status: "saved", note: upsertNote({ ...input, workspaceId }) };
}

export async function archiveNoteAction(input: {
  id: string;
  archived: boolean;
}): Promise<{ status: "saved"; note: CeoNote } | { status: "forbidden" } | { status: "error" }> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  const note = setNoteArchived(workspaceId, input.id, input.archived);
  return note ? { status: "saved", note } : { status: "error" };
}

export async function listNotesAction(): Promise<
  { status: "ok"; notes: CeoNote[] } | { status: "forbidden" }
> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  return { status: "ok", notes: listNotes(workspaceId) };
}
