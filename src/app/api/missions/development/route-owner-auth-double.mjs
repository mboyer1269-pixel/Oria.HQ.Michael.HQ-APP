// Synthetic session double for the development route boundary test.
// This is not a Supabase project, not an OAuth session, and not a secret.

let result = { user: null, error: null };

export function setAuthResult(next) {
  result = next;
}

export async function createServerSupabaseClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: result.user }, error: result.error };
      },
    },
  };
}
