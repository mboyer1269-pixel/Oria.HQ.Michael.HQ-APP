// src/server/marketing/facebook-page-publisher.ts
//
// Facebook Page auto-publisher — official Meta Graph API only.
// Auto-publish requires FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN
// (a Page access token with pages_manage_posts). Without them the
// publisher agent stays in prepare/simulated mode.
//
// Marketplace has NO public write API (dealer vehicle feeds retired by Meta):
// this adapter deliberately covers the Page feed only. No cookies, no UI bot.

import "server-only";

export type PagePublishInput = {
  message: string;
  linkUrl?: string;
  photoUrls: string[];
};

export type PagePublishOutcome =
  | { ok: true; postId: string; postUrl?: string }
  | { ok: false; error: string; retryable: boolean };

export type FacebookPagePublisherPort = {
  publishPost(input: PagePublishInput): Promise<PagePublishOutcome>;
};

export type FacebookPagePublisherConfig = {
  pageId: string;
  accessToken: string;
  graphApiVersion?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_GRAPH_VERSION = "v21.0";
const MAX_ATTACHED_PHOTOS = 4;
const FETCH_TIMEOUT_MS = 20_000;

type GraphJson = Record<string, unknown> & {
  id?: string;
  error?: { message?: string; code?: number };
};

async function graphPost(
  url: string,
  body: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; json: GraphJson } | { ok: false; error: string; retryable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as GraphJson;
    if (!res.ok || json.error) {
      const message = json.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `Graph API: ${message}`, retryable: res.status >= 500 };
    }
    return { ok: true, json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Graph API request failed",
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a Page publisher bound to a Page token.
 * Multi-photo flow: upload photos unpublished → attach to a single feed post.
 * Falls back to a text/link post when photo uploads fail.
 */
export function createFacebookPagePublisher(
  config: FacebookPagePublisherConfig,
): FacebookPagePublisherPort {
  const version = config.graphApiVersion ?? DEFAULT_GRAPH_VERSION;
  const base = `https://graph.facebook.com/${version}`;
  const fetchImpl = config.fetchImpl ?? fetch;

  async function uploadUnpublishedPhoto(photoUrl: string): Promise<string | null> {
    const params = new URLSearchParams({
      url: photoUrl,
      published: "false",
      access_token: config.accessToken,
    });
    const result = await graphPost(`${base}/${config.pageId}/photos`, params, fetchImpl);
    if (!result.ok || typeof result.json.id !== "string") return null;
    return result.json.id;
  }

  return {
    async publishPost(input: PagePublishInput): Promise<PagePublishOutcome> {
      const photoIds: string[] = [];
      for (const photoUrl of input.photoUrls.slice(0, MAX_ATTACHED_PHOTOS)) {
        const id = await uploadUnpublishedPhoto(photoUrl);
        if (id) photoIds.push(id);
      }

      const params = new URLSearchParams({
        message: input.message,
        access_token: config.accessToken,
      });
      if (input.linkUrl && photoIds.length === 0) {
        params.set("link", input.linkUrl);
      }
      photoIds.forEach((id, index) => {
        params.set(`attached_media[${index}]`, JSON.stringify({ media_fbid: id }));
      });

      const result = await graphPost(`${base}/${config.pageId}/feed`, params, fetchImpl);
      if (!result.ok) return result;
      const postId = typeof result.json.id === "string" ? result.json.id : "";
      if (!postId) {
        return { ok: false, error: "Graph API: missing post id in response", retryable: false };
      }
      return {
        ok: true,
        postId,
        postUrl: `https://www.facebook.com/${postId}`,
      };
    },
  };
}

export type FacebookPagePublisherEnv = {
  FACEBOOK_PAGE_ID?: string;
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  FACEBOOK_GRAPH_API_VERSION?: string;
};

/**
 * Wire the publisher from server env. Returns null when the Page credentials
 * are absent — callers then run in simulated / assisted-manual mode.
 */
export function createFacebookPagePublisherFromEnv(
  env: FacebookPagePublisherEnv = process.env as FacebookPagePublisherEnv,
  fetchImpl?: typeof fetch,
): FacebookPagePublisherPort | null {
  const pageId = env.FACEBOOK_PAGE_ID?.trim();
  const accessToken = env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !accessToken) return null;
  return createFacebookPagePublisher({
    pageId,
    accessToken,
    graphApiVersion: env.FACEBOOK_GRAPH_API_VERSION?.trim() || undefined,
    fetchImpl,
  });
}
