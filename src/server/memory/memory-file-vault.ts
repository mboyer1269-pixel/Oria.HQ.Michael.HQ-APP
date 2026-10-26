import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { MemoryEntry } from "./memory-graph";
import { normalizeMemoryId, parseMemoryEntryMarkdown } from "./memory-graph";
import type { MemoryVaultEntry } from "./memory-vault-types";

// ---------------------------------------------------------------------------
// FILE-BACKED MEMORY VAULT (v0.1)
// ---------------------------------------------------------------------------
// Markdown entries live under `memory/` at the repo root. This loader reads
// them at request time and parses them with the pure parser in memory-graph.ts.
//
// Failure policy: the vault must never take down /hq/memory. Any fs error
// (missing directory, deployment bundle without the files, permission issues)
// degrades to an empty file vault; runtime repository entries still render.
// ---------------------------------------------------------------------------

const MEMORY_DIR = "memory";

/** Files that document the vault itself and are not entries. */
const NON_ENTRY_FILES = new Set(["readme.md", "index.md"]);

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const collected: string[] = [];
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      collected.push(...(await collectMarkdownFiles(fullPath)));
    } else if (
      dirent.isFile() &&
      dirent.name.toLowerCase().endsWith(".md") &&
      !NON_ENTRY_FILES.has(dirent.name.toLowerCase())
    ) {
      collected.push(fullPath);
    }
  }
  return collected;
}

/** Workspace slug format: lowercase slug, or `personal:<userId>` personal spaces. */
const WORKSPACE_SLUG_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?|personal:[A-Za-z0-9_-]{1,128})$/;

export type FileEntryWorkspace =
  | { status: "declared"; workspaceId: string }
  | { status: "missing" | "empty" | "invalid" | "duplicate" };

/**
 * Workspace owning a file entry.
 *
 * Canonical key: the workspace slug, which is exactly `ctx.workspace.id`
 * (workspace-context.ts sets `id: config.slug`; registry.ts getDefaultWorkspace
 * sets `id: ACTIVE_WORKSPACE_CONFIG.slug`). Comparison is exact and
 * case-sensitive; no normalization.
 *
 * Fail-closed: no frontmatter / no `workspace:` key, an empty value, a value
 * that is not a valid slug, or more than one `workspace:` key all mean the file
 * belongs to no workspace. Only horizontal whitespace (`[ \t]`) is allowed
 * around the colon, so an empty value can never swallow the next line.
 */
export function classifyFileEntryWorkspace(raw: string): FileEntryWorkspace {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return { status: "missing" };
  const values = fm[1]
    .split(/\r?\n/)
    .map((line) => line.match(/^workspace[ \t]*:[ \t]*(.*?)[ \t]*$/i))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
  if (values.length === 0) return { status: "missing" };
  if (values.length > 1) return { status: "duplicate" };
  const value = values[0];
  if (!value) return { status: "empty" };
  if (!WORKSPACE_SLUG_RE.test(value)) return { status: "invalid" };
  return { status: "declared", workspaceId: value };
}

/** Declared workspace slug of a file entry, or null when excluded (fail-closed). */
export function fileEntryWorkspaceId(raw: string): string | null {
  const result = classifyFileEntryWorkspace(raw);
  return result.status === "declared" ? result.workspaceId : null;
}

export type ScopedFileVault = {
  entries: MemoryEntry[];
  /** Files excluded from every workspace (missing/empty/invalid/duplicate workspace). */
  excludedCount: number;
};

/**
 * Loads file-backed memory entries from `memory/` that belong to `workspaceId`,
 * plus the count of files excluded for lack of a valid workspace declaration.
 * Entries of any other workspace are never returned.
 * Returns an empty result when the directory is absent or unreadable.
 */
export async function loadScopedFileVault(workspaceId: string): Promise<ScopedFileVault> {
  if (!workspaceId?.trim()) return { entries: [], excludedCount: 0 };
  const root = path.join(process.cwd(), MEMORY_DIR);
  let files: string[];
  try {
    files = await collectMarkdownFiles(root);
  } catch {
    return { entries: [], excludedCount: 0 };
  }

  const entries: MemoryEntry[] = [];
  let excludedCount = 0;
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      const owner = classifyFileEntryWorkspace(raw);
      if (owner.status !== "declared") {
        excludedCount += 1;
        // File name only — never content or title.
        console.warn(`[memory-file-vault] excluded (workspace ${owner.status}): ${path.basename(file)}`);
        continue;
      }
      if (owner.workspaceId !== workspaceId) continue;
      const relativePath = path.relative(process.cwd(), file).split(path.sep).join("/");
      const entry = parseMemoryEntryMarkdown(raw, relativePath);
      if (entry) entries.push(entry);
    } catch {
      // Skip unreadable files; never fail the whole vault.
    }
  }
  return { entries, excludedCount };
}

/** Entries only — see loadScopedFileVault. */
export async function loadFileVaultEntries(workspaceId: string): Promise<MemoryEntry[]> {
  return (await loadScopedFileVault(workspaceId)).entries;
}

/**
 * Adapts a runtime MemoryVaultEntry (in-memory repository) into the graph
 * MemoryEntry shape so repository entries and file entries share one graph.
 * `doc` maps to itself (both type unions include it).
 */
export function adaptVaultEntryToMemoryEntry(entry: MemoryVaultEntry): MemoryEntry {
  return {
    id: normalizeMemoryId(entry.title),
    type: entry.type,
    title: entry.title,
    status: entry.trustLevel,
    tags: entry.tags,
    sourceRefs: entry.sourceRef ? [entry.sourceRef] : [],
    links: [],
    body: entry.content,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Merges file-backed entries with runtime repository entries.
 * File entries win on id collision — files are the curated, durable layer.
 */
export function mergeMemoryEntries(
  fileEntries: MemoryEntry[],
  runtimeEntries: MemoryEntry[],
): MemoryEntry[] {
  const fileIds = new Set(fileEntries.map((entry) => entry.id));
  return [
    ...fileEntries,
    ...runtimeEntries.filter((entry) => !fileIds.has(entry.id)),
  ];
}
