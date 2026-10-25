// Imported only through test aliases; production modules never read these globals.
export async function createServerSupabaseClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.authzTestUser ?? null }, error: null }) } };
}
export function createOptionalSupabaseAdminClient() { return globalThis.authzTestDb ?? null; }
export function hasSupabaseAdminConfig() { return Boolean(globalThis.authzTestDb); }
