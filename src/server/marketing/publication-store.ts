// src/server/marketing/publication-store.ts
//
// In-memory SocialPublication store (per workspace). Not durable — same
// pattern as the lead bank / listing store until a durable mandate.

import type { SocialPublication } from "@/features/marketing/social-publication";

type PublicationStoreGlobals = typeof globalThis & {
  __oriaSocialPublicationStore?: Map<string, Map<string, SocialPublication>>;
};

function getRoot(): Map<string, Map<string, SocialPublication>> {
  const globals = globalThis as PublicationStoreGlobals;
  if (!globals.__oriaSocialPublicationStore) {
    globals.__oriaSocialPublicationStore = new Map();
  }
  return globals.__oriaSocialPublicationStore;
}

function workspaceMap(workspaceId: string): Map<string, SocialPublication> {
  const root = getRoot();
  let map = root.get(workspaceId);
  if (!map) {
    map = new Map();
    root.set(workspaceId, map);
  }
  return map;
}

export function listSocialPublications(workspaceId: string): SocialPublication[] {
  return [...workspaceMap(workspaceId).values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

export function getSocialPublication(
  workspaceId: string,
  publicationId: string,
): SocialPublication | null {
  return workspaceMap(workspaceId).get(publicationId) ?? null;
}

export function saveSocialPublication(publication: SocialPublication): SocialPublication {
  workspaceMap(publication.workspaceId).set(publication.publicationId, publication);
  return publication;
}

export function markPublicationPublishedManual(
  workspaceId: string,
  publicationId: string,
  nowIso: string,
): SocialPublication | null {
  const existing = getSocialPublication(workspaceId, publicationId);
  if (!existing) return null;
  const next: SocialPublication = {
    ...existing,
    status: "published_manual",
    publishedAt: nowIso,
    updatedAt: nowIso,
  };
  return saveSocialPublication(next);
}

export function clearSocialPublicationStore(): void {
  getRoot().clear();
}
