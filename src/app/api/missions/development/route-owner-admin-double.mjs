// Captures the privileged write the real development service would send.
// No network client is constructed.

const writes = [];
let last = null;

function table() {
  return {
    upsert(row) {
      writes.push(row);
      last = row;
      return Promise.resolve({ error: null });
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    single() {
      return Promise.resolve({ data: last, error: last ? null : { message: "missing" } });
    },
  };
}

export function resetWrites() {
  writes.length = 0;
  last = null;
}

export function writtenRows() {
  return writes;
}

export function createOptionalSupabaseAdminClient() {
  return { from() { return table(); } };
}

export function createSupabaseAdminClient() {
  return createOptionalSupabaseAdminClient();
}

export function hasSupabaseAdminConfig() {
  return true;
}
