/**
 * Who may spend the personal CLI subscriptions (Codex / Claude Code) of this machine (SENT-412-8).
 * Being owner of *a* workspace is not enough: the subscription belongs to one person.
 * ORIA_SUBSCRIPTION_OWNERS = comma-separated user ids; default = MICHAEL_HQ_OWNER_ID. Empty → nobody (fail closed).
 */
export function subscriptionOwnerIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.ORIA_SUBSCRIPTION_OWNERS?.trim() ? env.ORIA_SUBSCRIPTION_OWNERS : env.MICHAEL_HQ_OWNER_ID ?? "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}
export function isSubscriptionOwner(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!userId && subscriptionOwnerIds(env).includes(userId);
}
