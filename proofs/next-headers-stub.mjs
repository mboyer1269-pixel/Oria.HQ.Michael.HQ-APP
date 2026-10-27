// Proof-only stand-in for next/headers outside a Next request scope:
// an empty cookie jar means "no authenticated browser session".
const empty = { getAll: () => [], get: () => undefined, has: () => false, set: () => {}, delete: () => {} };
export async function cookies() { return empty; }
export async function headers() { return new Headers(); }
