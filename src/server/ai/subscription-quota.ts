import "server-only";
/**
 * Subscription quota / usage meter for Claude Code and Codex, from LOCAL logs only.
 *
 * Concept (not code) from FounderOS lib/usage.ts (MIT, © FounderOS contributors): Claude Code transcripts under
 * ~/.claude/projects/**\/*.jsonl carry per-message `usage` blocks; Codex session logs under ~/.codex/sessions carry
 * `token_count` events whose `rate_limits` hold the plan's OFFICIAL used_percent (5-hour + weekly windows).
 * Rewritten for Oria; no FounderOS code is copied.
 *
 * Hard rules: zero network, never reads credential files (only *.jsonl under the two log roots; ~/.codex/auth.json
 * and ~/.claude/.credentials.json are outside those roots and never opened), tolerant of missing/corrupt files
 * (bad lines/files are skipped and counted). Paths: ORIA_CLAUDE_PROJECTS_DIR / ORIA_CODEX_SESSIONS_DIR or opts.
 * Claude Code logs expose no official quota gauge → Claude `remainingPercent` is null ("not reported"), never guessed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type QuotaWindow = { usedPercent: number; remainingPercent: number; windowMinutes: number; resetsAt: string | null };
export type ProviderQuota = {
  provider: "claude-code" | "codex"; source: "local_logs"; available: boolean;
  tokens: { last5h: number; last7d: number }; // burn = input + output + cache writes (cache reads excluded)
  primary: QuotaWindow | null; secondary: QuotaWindow | null; // official gauges when the provider logged them
  remainingPercent: number | null; observedAt: string | null; filesRead: number; skipped: number;
};
export type QuotaOptions = { claudeDir?: string; codexDir?: string; now?: number; env?: NodeJS.ProcessEnv; maxFiles?: number; maxFileBytes?: number };

const H5 = 5 * 3_600_000, D7 = 7 * 86_400_000;
const pos = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
export const claudeProjectsDir = (env: NodeJS.ProcessEnv = process.env) => env.ORIA_CLAUDE_PROJECTS_DIR || join(homedir(), ".claude", "projects");
export const codexSessionsDir = (env: NodeJS.ProcessEnv = process.env) => env.ORIA_CODEX_SESSIONS_DIR || join(homedir(), ".codex", "sessions");

/** *.jsonl files under root (no symlink follow), most recently modified first, bounded. */
function jsonlFiles(root: string, sinceMs: number, maxFiles: number): string[] {
  const out: { p: string; m: number }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) { try { const m = statSync(p).mtimeMs; if (m >= sinceMs) out.push({ p, m }); } catch { /* vanished */ } }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.m - a.m).slice(0, maxFiles).map(f => f.p);
}
function lines(file: string, maxBytes: number): string[] | null {
  try { if (statSync(file).size > maxBytes) return null; return readFileSync(file, "utf8").split("\n"); } catch { return null; }
}
function window(w: unknown): QuotaWindow | null {
  const o = w as { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown } | null | undefined;
  if (!o || typeof o.used_percent !== "number" || !Number.isFinite(o.used_percent)) return null;
  const used = Math.min(100, Math.max(0, o.used_percent));
  return { usedPercent: used, remainingPercent: Math.round((100 - used) * 10) / 10, windowMinutes: typeof o.window_minutes === "number" ? o.window_minutes : 0,
    resetsAt: typeof o.resets_at === "number" ? new Date(o.resets_at * 1000).toISOString() : typeof o.resets_at === "string" ? o.resets_at : null };
}
const minRemaining = (...ws: (QuotaWindow | null)[]) => { const r = ws.filter(Boolean).map(w => w!.remainingPercent); return r.length ? Math.min(...r) : null; };

export function readClaudeQuota(opts: QuotaOptions = {}): ProviderQuota {
  const now = opts.now ?? Date.now();
  const files = jsonlFiles(opts.claudeDir ?? claudeProjectsDir(opts.env), now - D7, opts.maxFiles ?? 2000);
  let last5h = 0, last7d = 0, skipped = 0, read = 0, latest = 0;
  for (const f of files) {
    const ls = lines(f, opts.maxFileBytes ?? 50_000_000); if (!ls) { skipped++; continue; } read++;
    for (const l of ls) {
      if (!l.includes('"usage"')) continue;
      let d; try { d = JSON.parse(l); } catch { skipped++; continue; }
      const u = d?.message?.usage; const t = Date.parse(d?.timestamp);
      if (d?.type !== "assistant" || !u || !Number.isFinite(t) || t > now) continue;
      const burn = pos(u.input_tokens) + pos(u.output_tokens) + pos(u.cache_creation_input_tokens);
      if (now - t <= D7) last7d += burn;
      if (now - t <= H5) last5h += burn;
      latest = Math.max(latest, t);
    }
  }
  return { provider: "claude-code", source: "local_logs", available: read > 0, tokens: { last5h, last7d }, primary: null, secondary: null, remainingPercent: null,
    observedAt: latest ? new Date(latest).toISOString() : null, filesRead: read, skipped };
}

export function readCodexQuota(opts: QuotaOptions = {}): ProviderQuota {
  const now = opts.now ?? Date.now();
  const files = jsonlFiles(opts.codexDir ?? codexSessionsDir(opts.env), now - D7, opts.maxFiles ?? 2000);
  let last5h = 0, last7d = 0, skipped = 0, read = 0, latest = 0;
  let gauge: { t: number; primary: QuotaWindow | null; secondary: QuotaWindow | null } | null = null;
  for (const f of files) {
    const ls = lines(f, opts.maxFileBytes ?? 50_000_000); if (!ls) { skipped++; continue; } read++;
    let prev = 0; // token_count is cumulative per session → count deltas
    for (const l of ls) {
      if (!l.includes("token_count")) continue;
      let d; try { d = JSON.parse(l); } catch { skipped++; continue; }
      const p = d?.payload; const t = Date.parse(d?.timestamp);
      if (d?.type !== "event_msg" || p?.type !== "token_count" || !Number.isFinite(t) || t > now) continue;
      const tot = p.info?.total_token_usage;
      if (tot) {
        const cum = pos(tot.input_tokens) - pos(tot.cached_input_tokens) + pos(tot.output_tokens);
        const delta = Math.max(0, cum - prev); prev = Math.max(prev, cum);
        if (now - t <= D7) last7d += delta;
        if (now - t <= H5) last5h += delta;
      }
      const rl = p.rate_limits;
      if (rl && (!gauge || t > gauge.t)) { const primary = window(rl.primary), secondary = window(rl.secondary); if (primary || secondary) gauge = { t, primary, secondary }; }
      latest = Math.max(latest, t);
    }
  }
  return { provider: "codex", source: "local_logs", available: read > 0, tokens: { last5h, last7d }, primary: gauge?.primary ?? null, secondary: gauge?.secondary ?? null,
    remainingPercent: gauge ? minRemaining(gauge.primary, gauge.secondary) : null, observedAt: latest ? new Date(latest).toISOString() : null, filesRead: read, skipped };
}

/** Server function: remaining subscription usage for both CLIs. Never throws, never touches the network. */
export function readSubscriptionQuota(opts: QuotaOptions = {}): { generatedAt: string; providers: ProviderQuota[] } {
  const safe = (f: () => ProviderQuota, provider: ProviderQuota["provider"]): ProviderQuota => {
    try { return f(); } catch { return { provider, source: "local_logs", available: false, tokens: { last5h: 0, last7d: 0 }, primary: null, secondary: null, remainingPercent: null, observedAt: null, filesRead: 0, skipped: 0 }; }
  };
  return { generatedAt: new Date(opts.now ?? Date.now()).toISOString(), providers: [safe(() => readClaudeQuota(opts), "claude-code"), safe(() => readCodexQuota(opts), "codex")] };
}
