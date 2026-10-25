import "server-only";
import { findWorkspaceConfigBySlug, createWorkspaceConfig } from "@/core/workspaces/registry";

export type AuthzContext = { userId: string; workspaceId: string; role: "owner" | "member" };
/**
 * `emailVerified` must be true for `email` to match a membership (SENT-410-1):
 * an unconfirmed Supabase email (open sign-up, OAuth without verified email) must
 * never grant a role. Callers derive it from `user.email_confirmed_at`.
 */
export type Identity = { userId: string; email?: string; emailVerified?: boolean };
type Membership = { userId?: string; email?: string; workspaceId: string; role: AuthzContext["role"] };

export class WorkspaceAccessError extends Error {
  constructor(public readonly code: "UNKNOWN_WORKSPACE" | "NOT_A_MEMBER" | "INVALID_CONFIG", workspaceId: string) {
    super(`${code}: ${workspaceId}`);
    this.name = "WorkspaceAccessError";
  }
}

function parseConfiguredMembers(): Membership[] {
  let raw: unknown;
  try {
    raw = JSON.parse(process.env.ORIA_WORKSPACE_MEMBERS || "[]");
  } catch {
    throw new WorkspaceAccessError("INVALID_CONFIG", "ORIA_WORKSPACE_MEMBERS");
  }
  if (!Array.isArray(raw) || raw.some((m) => !m || typeof m.workspaceId !== "string" || !m.workspaceId.trim() ||
    (m.role !== "owner" && m.role !== "member") ||
    (!m.userId && !m.email) || (m.userId !== undefined && typeof m.userId !== "string") ||
    (m.email !== undefined && typeof m.email !== "string"))) {
    throw new WorkspaceAccessError("INVALID_CONFIG", "ORIA_WORKSPACE_MEMBERS");
  }
  return [...raw];
}

let reportedInvalidConfig: string | undefined;

/** True when ORIA_WORKSPACE_MEMBERS is set but unusable (diagnostics/health only). */
export function hasInvalidMembershipConfig(): boolean {
  try { parseConfiguredMembers(); return false; } catch { return true; }
}

/**
 * A malformed ORIA_WORKSPACE_MEMBERS drops every configured membership (fail
 * closed for those users) but keeps the legacy owner declared by
 * MICHAEL_HQ_OWNER_ID/EMAIL, so a typo is not a 500 on every route.
 */
export function configuredMemberships(): Membership[] {
  let members: Membership[];
  try {
    members = parseConfiguredMembers();
  } catch {
    const raw = process.env.ORIA_WORKSPACE_MEMBERS ?? "";
    if (reportedInvalidConfig !== raw) {
      reportedInvalidConfig = raw;
      console.error("[authz] ORIA_WORKSPACE_MEMBERS is invalid; configured memberships ignored (legacy owner only).");
    }
    members = [];
  }
  const userId = process.env.MICHAEL_HQ_OWNER_ID?.trim();
  const email = process.env.MICHAEL_HQ_OWNER_EMAIL?.trim();
  if (userId || email) members.push({ userId, email, workspaceId: "michael-hq", role: "owner" });
  return members;
}

export function membershipsForUser(user: Identity): Membership[] {
  return configuredMemberships().filter((m) =>
    (m.userId && m.userId === user.userId) ||
    (m.email && user.email && user.emailVerified === true &&
      m.email.trim().toLowerCase() === user.email.trim().toLowerCase()));
}

/** Membership config also declares minimal workspaces; richer registered configs take precedence. */
export function getAuthorizedWorkspaceConfig(workspaceId: string) {
  const registered = findWorkspaceConfigBySlug(workspaceId);
  if (registered) return registered;
  if (configuredMemberships().some((m) => m.workspaceId === workspaceId)) return createWorkspaceConfig(workspaceId);
  throw new WorkspaceAccessError("UNKNOWN_WORKSPACE", workspaceId);
}

/** Default is the first configured membership (legacy appended), otherwise the user's personal space. */
export function resolveAuthzContext(user: Identity, requestedWorkspaceId?: string): AuthzContext {
  if (!user.userId?.trim()) throw new WorkspaceAccessError("NOT_A_MEMBER", requestedWorkspaceId ?? "");
  const personalId = `personal:${user.userId}`;
  const memberships = membershipsForUser(user);
  const workspaceId = requestedWorkspaceId ?? memberships[0]?.workspaceId ?? personalId;
  getAuthorizedWorkspaceConfig(workspaceId);
  if (workspaceId.startsWith("personal:")) {
    if (workspaceId !== personalId) throw new WorkspaceAccessError("NOT_A_MEMBER", workspaceId);
    // Personal spaces need no company, but an arbitrary self-signed-up account is not
    // admitted unless it is a configured member somewhere or open personal spaces are enabled.
    if (memberships.length === 0 && process.env.ORIA_OPEN_PERSONAL_SPACES !== "true") {
      throw new WorkspaceAccessError("NOT_A_MEMBER", workspaceId);
    }
    return { userId: user.userId, workspaceId, role: "owner" };
  }
  const membership = memberships.find((m) => m.workspaceId === workspaceId && m.role === "owner") ?? memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) throw new WorkspaceAccessError("NOT_A_MEMBER", workspaceId);
  return { userId: user.userId, workspaceId, role: membership.role };
}

export function assertWorkspaceAccess(ctx: AuthzContext, workspaceId: string): void {
  if (ctx.workspaceId !== workspaceId) throw new WorkspaceAccessError("NOT_A_MEMBER", workspaceId);
}
