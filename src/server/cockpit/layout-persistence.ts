import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MichaelHqDatabase } from "@/server/db/types";
import { cockpitLayoutWriteSchema, cockpitRevisionSchema, defaultCockpitOrder, isCockpitLayoutReady, normalizeCockpitOrder, type CockpitLayoutRead, type CockpitLayoutSave } from "@/features/cockpit/cockpit-layout-contract";

type Client = SupabaseClient<MichaelHqDatabase>;
const columns = "user_id,widget_order,updated_at";

/** Internal repository, called only AFTER the existing server action owner gate. */
export function createCockpitLayoutPersistence(client: Client | null, userId: string, now = () => Date.now()) {
  async function read(): Promise<CockpitLayoutRead> {
    if (!client) return { status: "unavailable" };
    try {
      const { data, error, status, count } = await client.from("cockpit_layout").select(columns, { count: "exact" }).eq("user_id", userId).abortSignal(AbortSignal.timeout(5000)).retry(false);
      // maybeSingle conflates [] with an empty/malformed ACK. Even status200 can
      // be SDK-normalized from404+[]; count is populated only on actual HTTP success.
      if (error || status !== 200 || !Array.isArray(data) || count !== data.length || data.length > 1) return { status: "failed" };
      if (data.length === 0) return { status: "missing", order: defaultCockpitOrder(), revision: null };
      const row = data[0];
      if (!row || row.user_id !== userId || !Array.isArray(row.widget_order) || !cockpitRevisionSchema.safeParse(row.updated_at).success) return { status: "failed" };
      return { status: "loaded", order: normalizeCockpitOrder(row.widget_order), revision: row.updated_at };
    } catch { return { status: "failed" }; }
  }

  async function save(input: unknown): Promise<CockpitLayoutSave> {
    const parsed = cockpitLayoutWriteSchema.safeParse(input);
    if (!parsed.success) return { status: "not_attempted", reason: "invalid_request" };
    if (!client) return { status: "not_attempted", reason: "unavailable" };
    const baseline = await read();
    if (!isCockpitLayoutReady(baseline)) return { status: "not_attempted", reason: "read_failed" };
    const { order, expectedRevision } = parsed.data;
    if (baseline.revision !== expectedRevision) return { status: "conflict" };
    let updatedAt: string;
    try {
      // Strictly later even for clock skew or a microsecond Postgres timestamp.
      updatedAt = new Date(Math.max(now(), expectedRevision === null ? 0 : Date.parse(expectedRevision) + 1)).toISOString();
    } catch { return { status: "not_attempted", reason: "invalid_request" }; }
    try {
      // No blind upsert; no automatic retry. Unique INSERT or atomic revision UPDATE.
      const query = expectedRevision === null
        ? client.from("cockpit_layout").insert({ user_id: userId, widget_order: order, updated_at: updatedAt }, { count: "exact" })
        : client.from("cockpit_layout").update({ widget_order: order, updated_at: updatedAt }, { count: "exact" }).eq("user_id", userId).eq("updated_at", expectedRevision);
      const { data, error, status, count } = await query.select(columns).abortSignal(AbortSignal.timeout(5000)).retry(false);
      if (error) {
        if (expectedRevision === null && status === 409 && error.code === "23505") return { status: "conflict" };
        return { status: "unconfirmed" };
      }
      if (status !== (expectedRevision === null ? 201 : 200) || !Array.isArray(data) || count !== data.length) return { status: "unconfirmed" };
      if (data.length === 0 && expectedRevision !== null) return { status: "conflict" };
      if (data.length !== 1) return { status: "unconfirmed" };
      const row = data[0];
      if (!row || row.user_id !== userId || JSON.stringify(row.widget_order) !== JSON.stringify(order) ||
        !cockpitRevisionSchema.safeParse(row.updated_at).success || Date.parse(row.updated_at) !== Date.parse(updatedAt)) return { status: "unconfirmed" };
      // ACK at this write, not a guarantee against later writers or storage loss.
      return { status: "confirmed", order, revision: row.updated_at };
    } catch { return { status: "unconfirmed" }; }
  }
  return { read, save };
}
