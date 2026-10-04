import "server-only";
import { PAPERCLIP_PAGE_LIMIT, parsePaperclipIssues } from "./paperclip-contract";
import { resolvePaperclipBinding, type PaperclipBinding } from "./workspace-binding";

const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 5000;
export class PaperclipReadError extends Error {
  constructor(public readonly code: "upstream_unavailable" | "invalid_response" | "timeout") {
    super(code);
    this.name = "PaperclipReadError";
  }
}

/** One bounded GET; no retries, redirects, execution commands, or client-selected destinations. */
export async function readPaperclipIssues(binding: PaperclipBinding, fetcher: typeof fetch = fetch) {
  if (resolvePaperclipBinding({ ...binding, enabled: true }, binding.workspaceId).status !== "ready") {
    throw new PaperclipReadError("upstream_unavailable");
  }
  const url = new URL(`/api/companies/${binding.companyId}/issues`, binding.baseUrl);
  url.searchParams.set("limit", String(PAPERCLIP_PAGE_LIMIT));
  url.searchParams.set("offset", "0");
  url.searchParams.set("sortField", "updated");
  url.searchParams.set("sortDir", "desc");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher(url, {
      method: "GET", redirect: "error", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", Authorization: `Bearer ${binding.token}` },
    });
    if (!response.ok) throw new PaperclipReadError("upstream_unavailable");
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) {
      throw new PaperclipReadError("invalid_response");
    }
    const declaredBytes = Number(response.headers.get("content-length"));
    if (declaredBytes > MAX_RESPONSE_BYTES) throw new PaperclipReadError("invalid_response");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new PaperclipReadError("invalid_response");
      chunks.push(chunk.value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    let issues;
    try { issues = parsePaperclipIssues(JSON.parse(body), binding.companyId); }
    catch { throw new PaperclipReadError("invalid_response"); }
    return {
      source: "paperclip" as const, workspaceId: binding.workspaceId, issues,
      // A page is not an authoritative total; exactly 50 may or may not have a next page.
      page: { limit: PAPERCLIP_PAGE_LIMIT, offset: 0, mayHaveMore: issues.length === PAPERCLIP_PAGE_LIMIT },
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (controller.signal.aborted) throw new PaperclipReadError("timeout");
    if (error instanceof PaperclipReadError) throw error;
    throw new PaperclipReadError("upstream_unavailable");
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) void reader.cancel().catch(() => undefined);
  }
}
