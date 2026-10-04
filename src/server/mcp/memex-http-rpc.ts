import "server-only";
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export class MemexHttpError extends Error {
  constructor(public readonly code: "unavailable" | "invalid_response" | "timeout" | "closed" | "scope_denied") { super(`Memex HTTP ${code}`); }
}
/** Internal bounded wire protocol; callers must enforce their own fixed capability corridor. */
export function createMemexHttpRpc(endpoint: string, handle: string, fetcher: typeof fetch = fetch) {
  let closed = false;
  let sequence = 0;
  const active = new Set<AbortController>();
  async function rpc(method: "tools/list" | "tools/call", params: Record<string, unknown> = {}): Promise<unknown> {
    if (closed) throw new MemexHttpError("closed");
    const controller = new AbortController(); active.add(controller);
    const id = ++sequence;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 5000);
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new MemexHttpError(timedOut ? "timeout" : "closed")), { once: true }));
    try {
      return await Promise.race([aborted, (async () => {
        const response = await fetcher(endpoint, { method: "POST", signal: controller.signal, redirect: "error", cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${handle}` },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });
        if (!response.ok) throw new MemexHttpError("unavailable");
        if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("application/json")
          || Number(response.headers.get("content-length")) > 512 * 1024) throw new MemexHttpError("invalid_response");
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let bytes = 0;
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 512 * 1024) throw new MemexHttpError("invalid_response");
          chunks.push(part.value);
        }
        let body: unknown;
        try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw new MemexHttpError("invalid_response"); }
        if (!object(body) || body.jsonrpc !== "2.0" || body.id !== id || "error" in body || !("result" in body)) throw new MemexHttpError("invalid_response");
        return body.result;
      })()]);
    } catch (error) {
      if (error instanceof MemexHttpError) throw error;
      throw new MemexHttpError(timedOut ? "timeout" : closed ? "closed" : "unavailable");
    } finally {
      clearTimeout(timer); active.delete(controller); controller.abort();
      if (reader) void reader.cancel().catch(() => {});
    }
  }
  return { rpc, async close() { closed = true; for (const controller of active) controller.abort(); active.clear(); } };
}
