// Test-only Supabase auth transport. Real owner membership/actor guards are NOT
// replaced. No cookies, remote auth, credentials or production authorization claim.
let user = null;
export function setSyntheticAuthUser(value) { user = value === null ? null : structuredClone(value); }
export async function createServerSupabaseClient() {
  return { auth: { getUser: async () => ({ data: { user: user === null ? null : structuredClone(user) }, error: null }) } };
}
