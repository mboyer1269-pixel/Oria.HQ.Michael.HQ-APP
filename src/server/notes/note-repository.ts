// src/server/notes/note-repository.ts
//
// CEO Notes — in-memory, workspace-scoped store (v1, same persistence model
// as the Send Desk store; Supabase dual-mode is a later, mandate-gated step).
// Soft-archive only: notes are never hard-deleted.

import { randomUUID } from "node:crypto";

export type CeoNote = {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

type NoteRepositoryGlobals = typeof globalThis & {
  __ceoNotes?: Map<string, CeoNote>;
};

function getStore(): Map<string, CeoNote> {
  const globals = globalThis as NoteRepositoryGlobals;
  if (!globals.__ceoNotes) globals.__ceoNotes = new Map();
  return globals.__ceoNotes;
}

export function upsertNote(input: {
  workspaceId: string;
  id?: string;
  title: string;
  body: string;
  pinned?: boolean;
}): CeoNote {
  const store = getStore();
  const now = new Date().toISOString();
  if (input.id) {
    const existing = store.get(input.id);
    if (existing && existing.workspaceId === input.workspaceId) {
      const updated: CeoNote = {
        ...existing,
        title: input.title,
        body: input.body,
        pinned: input.pinned ?? existing.pinned,
        updatedAt: now,
      };
      store.set(updated.id, updated);
      return updated;
    }
  }
  const note: CeoNote = {
    id: `note_${randomUUID()}`,
    workspaceId: input.workspaceId,
    title: input.title,
    body: input.body,
    pinned: input.pinned ?? false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  store.set(note.id, note);
  return note;
}

export function setNoteArchived(workspaceId: string, id: string, archived: boolean): CeoNote | null {
  const store = getStore();
  const note = store.get(id);
  if (!note || note.workspaceId !== workspaceId) return null;
  const updated = { ...note, archived, updatedAt: new Date().toISOString() };
  store.set(id, updated);
  return updated;
}

export function listNotes(workspaceId: string, includeArchived = false): CeoNote[] {
  return [...getStore().values()]
    .filter((note) => note.workspaceId === workspaceId && (includeArchived || !note.archived))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}

export function resetNoteRepositoryForTests(): void {
  (globalThis as NoteRepositoryGlobals).__ceoNotes = undefined;
}
