import "server-only";
import { paperclipCompanyIdSchema } from "./paperclip-contract";

export type PaperclipSettings = {
  enabled: boolean;
  baseUrl?: string;
  token?: string;
  workspaceId?: string;
  companyId?: string;
};
export type PaperclipBinding = { baseUrl: string; token: string; companyId: string; workspaceId: string };
export type BindingResult = { status: "disabled" | "unconfigured" | "workspace_unbound" }
  | { status: "ready"; binding: PaperclipBinding };

/** Only a server-owned origin is accepted; never a request URL or query parameter. */
export function resolvePaperclipBinding(settings: PaperclipSettings, activeWorkspaceId: string): BindingResult {
  if (!settings.enabled) return { status: "disabled" };
  const companyId = paperclipCompanyIdSchema.safeParse(settings.companyId);
  if (!settings.baseUrl || !settings.token || !settings.workspaceId || !companyId.success) {
    return { status: "unconfigured" };
  }
  // No whitespace/control characters can be injected into the Authorization header.
  if (!/^[A-Za-z0-9._~-]{20,4096}$/.test(settings.token)) return { status: "unconfigured" };
  let url: URL;
  try { url = new URL(settings.baseUrl); } catch { return { status: "unconfigured" }; }
  const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    return { status: "unconfigured" };
  }
  if (settings.workspaceId !== activeWorkspaceId) return { status: "workspace_unbound" };
  return { status: "ready", binding: {
    baseUrl: url.origin, token: settings.token, companyId: companyId.data, workspaceId: activeWorkspaceId,
  } };
}
