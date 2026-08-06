import type { WorkspaceId } from "@/core/types";

// ---------------------------------------------------------------------------
// Workspace membership — the tenancy access contract.
//
// Pure domain layer: no I/O, no env, no Date.now(). It answers two questions
// and nothing else:
//   1. Which workspace is a given user allowed to act in right now?
//   2. What is that user allowed to do inside it?
//
// Every function here is FAIL-CLOSED. An unknown workspace, an unknown role, a
// non-active membership or an empty membership list all resolve to "no access"
// — never to a default workspace and never to a silent fallback. Tenancy
// isolation is only as strong as its least defensive branch.
//
// Persistence (workspaces / workspace_members) is drafted in migration 0026 and
// stays gated until its own mandate; the design note lives in
// docs/TENANCY_DESIGN.md.
// ---------------------------------------------------------------------------

/**
 * Roles a user can hold in a workspace, ordered from most to least privileged.
 *
 * `owner` is deliberately singular per workspace: the governance model requires
 * one accountable human for irreversible actions (humanOnTheLoop). An `admin`
 * runs the workspace day to day but never inherits the approval seal.
 */
export type WorkspaceRole = "owner" | "admin" | "operator" | "viewer";

/** Lifecycle of a membership. Only `active` ever grants access. */
export type WorkspaceMembershipStatus = "active" | "invited" | "revoked";

export type WorkspaceMembership = {
  workspaceId: WorkspaceId;
  /** Supabase auth.users.id of the member. */
  userId: string;
  role: WorkspaceRole;
  status: WorkspaceMembershipStatus;
};

/**
 * Capabilities gate what a member may do. They are coarse on purpose: fine
 * grained action autonomy already lives in the permission rules
 * (src/server/permissions) and the autonomy tiers. This layer answers "is this
 * human allowed to ask at all", not "does this action need confirmation".
 */
export type WorkspaceCapability =
  /** Read the cockpit, ledger, missions and agent state. */
  | "workspace.read"
  /** Rename the workspace, change its modes and configuration. */
  | "workspace.manage"
  /** Invite, promote, demote or revoke members. */
  | "members.manage"
  /** Create and edit missions, drafts and outbound queues. */
  | "missions.write"
  /** Ask an agent to prepare work (never to execute it). */
  | "agents.run"
  /** Approve an execution intent — the single trigger of a real-world action. */
  | "execution.approve";

const ROLE_CAPABILITIES: Record<WorkspaceRole, readonly WorkspaceCapability[]> = {
  owner: [
    "workspace.read",
    "workspace.manage",
    "members.manage",
    "missions.write",
    "agents.run",
    "execution.approve",
  ],
  admin: ["workspace.read", "workspace.manage", "members.manage", "missions.write", "agents.run"],
  operator: ["workspace.read", "missions.write", "agents.run"],
  viewer: ["workspace.read"],
};

/** Capabilities granted by a role. Unknown roles grant nothing. */
export function capabilitiesForRole(role: WorkspaceRole): readonly WorkspaceCapability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}

/**
 * Whether a role grants a capability.
 *
 * `execution.approve` is owner-only by design: approving an execution intent is
 * the one action that turns agent output into a real-world side effect, and the
 * governance model binds it to the single accountable human.
 */
export function roleGrants(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return capabilitiesForRole(role).includes(capability);
}

/** The active membership of a user in a workspace, or null when there is none. */
export function findActiveMembership(
  memberships: readonly WorkspaceMembership[],
  userId: string,
  workspaceId: WorkspaceId,
): WorkspaceMembership | null {
  return (
    memberships.find(
      (membership) =>
        membership.userId === userId &&
        membership.workspaceId === workspaceId &&
        membership.status === "active",
    ) ?? null
  );
}

/** Active memberships of a user, in the order they were provided. */
export function activeMembershipsOf(
  memberships: readonly WorkspaceMembership[],
  userId: string,
): WorkspaceMembership[] {
  return memberships.filter(
    (membership) => membership.userId === userId && membership.status === "active",
  );
}

/** Whether the user holds an active membership in the workspace. */
export function hasWorkspaceAccess(
  memberships: readonly WorkspaceMembership[],
  userId: string,
  workspaceId: WorkspaceId,
): boolean {
  return findActiveMembership(memberships, userId, workspaceId) !== null;
}

/** Whether the user may perform a capability in the workspace. */
export function memberCan(
  memberships: readonly WorkspaceMembership[],
  userId: string,
  workspaceId: WorkspaceId,
  capability: WorkspaceCapability,
): boolean {
  const membership = findActiveMembership(memberships, userId, workspaceId);
  if (membership === null) return false;
  return roleGrants(membership.role, capability);
}

export type WorkspaceResolution =
  | { ok: true; workspaceId: WorkspaceId; role: WorkspaceRole }
  | { ok: false; reason: "no_membership" | "not_a_member" };

/**
 * Resolve which workspace a user acts in for this request.
 *
 * - A `requestedWorkspaceId` is honoured only when the user is an active member
 *   of it; otherwise the resolution FAILS (`not_a_member`) instead of silently
 *   falling back to another workspace. Falling back would turn a wrong URL into
 *   a cross-tenant read.
 * - Without a request, the first active membership wins. Callers that need a
 *   stable choice across requests should persist a last-used workspace and pass
 *   it in explicitly.
 */
export function resolveActiveWorkspace(
  memberships: readonly WorkspaceMembership[],
  userId: string,
  requestedWorkspaceId?: WorkspaceId,
): WorkspaceResolution {
  if (requestedWorkspaceId !== undefined) {
    const requested = findActiveMembership(memberships, userId, requestedWorkspaceId);
    if (requested === null) return { ok: false, reason: "not_a_member" };
    return { ok: true, workspaceId: requested.workspaceId, role: requested.role };
  }

  const [first] = activeMembershipsOf(memberships, userId);
  if (first === undefined) return { ok: false, reason: "no_membership" };
  return { ok: true, workspaceId: first.workspaceId, role: first.role };
}

/**
 * The membership set a brand-new workspace starts with: its creator as sole
 * owner. Pure — the caller persists it.
 */
export function seedOwnerMembership(
  workspaceId: WorkspaceId,
  ownerUserId: string,
): WorkspaceMembership {
  return { workspaceId, userId: ownerUserId, role: "owner", status: "active" };
}
