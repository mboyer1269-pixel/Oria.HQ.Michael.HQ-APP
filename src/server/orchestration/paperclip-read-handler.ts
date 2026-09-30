import "server-only";
import { NextResponse } from "next/server";
import { resolvePaperclipBinding, type PaperclipSettings } from "./workspace-binding";
import { PaperclipReadError, readPaperclipIssues } from "./paperclip-client";

type Dependencies = {
  authorize: () => Promise<Response | null>;
  workspaceId: () => string;
  settings: () => PaperclipSettings;
  fetcher?: typeof fetch;
};

export function createPaperclipReadHandler(dependencies: Dependencies) {
  return async function read(request: Request) {
    const denied = await dependencies.authorize();
    if (denied) return denied;
    const headers = { "Cache-Control": "private, no-store" };
    if (new URL(request.url).search) {
      return NextResponse.json({ error: "Query parameters are not supported." }, { status: 400, headers });
    }
    const resolved = resolvePaperclipBinding(dependencies.settings(), dependencies.workspaceId());
    if (resolved.status !== "ready") {
      return NextResponse.json({ status: resolved.status }, { status: 503, headers });
    }
    try {
      return NextResponse.json(await readPaperclipIssues(resolved.binding, dependencies.fetcher), { headers });
    } catch (error) {
      const code = error instanceof PaperclipReadError ? error.code : "upstream_unavailable";
      // Never forward upstream bodies, URL, headers, credentials, or thrown error messages.
      return NextResponse.json({ status: code }, { status: code === "timeout" ? 504 : 502, headers });
    }
  };
}
