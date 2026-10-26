import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { MemoryEntry } from "./memory-graph";
import { normalizeMemoryId, parseMemoryEntryMarkdown } from "./memory-graph";
import type { MemoryVaultEntry } from "./memory-vault-types";
import { DEFAULT_WORKSPACE_SLUG } from "@/core/workspaces/registry";

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

/**
 * Workspace owning a file entry: frontmatter `workspace:` when present,
 * otherwise the repo's default workspace (legacy entries predate scoping).
 */
export function fileEntryWorkspaceId(raw: string): string {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const line = fm?.[1].match(/^workspace\s*:\s*(.+)$/im);
  const value = line?.[1].trim();
  return value ? value : DEFAULT_WORKSPACE_SLUG;
}

/**
 * Loads file-backed memory entries from `memory/` that belong to `workspaceId`.
 * Entries of any other workspace are never returned.
 * Returns [] when the directory is absent or unreadable.
 */
export async function loadFileVaultEntries(workspaceId: string): Promise<MemoryEntry[]> {
  if (!workspaceId?.trim()) return [];
  const root = path.join(process.cwd(), MEMORY_DIR);
  let files: string[];
  try {
    files = await collectMarkdownFiles(root);
  } catch {
    return [];
  }

  const entries: MemoryEntry[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, "utf8");
      if (fileEntryWorkspaceId(raw) !== workspaceId) continue;
      const relativePath = path.relative(process.cwd(), file).split(path.sep).join("/");
      const entry = parseMemoryEntryMarkdown(raw, relativePath);
      if (entry) entries.push(entry);
    } catch {
      // Skip unreadable files; never fail the whole vault.
    }
  }
  return entries;
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
