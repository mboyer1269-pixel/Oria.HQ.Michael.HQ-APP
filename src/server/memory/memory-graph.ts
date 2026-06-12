// Memory Vault v0.1 — pure graph and chainline contracts.
//
// This module is intentionally pure: no fs, no server-only, no framework
// imports. It can be unit-tested with node --test (via jiti) and its outputs
// are serializable, so server components can pass them to client components.
//
// File-backed entries live under `memory/` at the repo root and are loaded by
// `memory-file-vault.ts` (server-only). See docs/memory-vault/ARCHITECTURE.md.

export type MemoryEntryType =
  | "note"
  | "decision"
  | "source"
  | "sop"
  | "doc"
  | "agent"
  | "venture"
  | "action"
  | "pr"
  | "chainline";

export const MEMORY_ENTRY_TYPES: readonly MemoryEntryType[] = [
  "note",
  "decision",
  "source",
  "sop",
  "doc",
  "agent",
  "venture",
  "action",
  "pr",
  "chainline",
];

/** A parsed `[[...]]` backlink. `targetType` is set when the link uses a `type:` prefix. */
export type MemoryLink = {
  /** Normalized id of the target entry (without type prefix). */
  targetId: string;
  /** Declared type when the link is written as `[[agent:joris]]`. */
  targetType?: MemoryEntryType;
  /** Reference kind for non-entry targets: `ledger:` and `pr:` refs, `next:` markers. */
  refKind?: "ledger" | "pr" | "next";
  /** The raw inner text of the link as written. */
  raw: string;
};

export type MemoryEntry = {
  /** Normalized id, unique within the vault. */
  id: string;
  type: MemoryEntryType;
  title: string;
  status: string;
  project?: string;
  tags: string[];
  confidence?: string;
  sourceRefs: string[];
  /** Outgoing links: frontmatter `links:` plus body backlinks, deduped. */
  links: MemoryLink[];
  body: string;
  createdAt?: string;
  updatedAt?: string;
  /** Repo-relative path for file-backed entries; absent for runtime entries. */
  filePath?: string;
};

export type MemoryNode = {
  id: string;
  type: MemoryEntryType;
  title: string;
  status: string;
  tags: string[];
  /** True when the node only exists as a link target, with no backing entry. */
  missing: boolean;
};

export type MemoryEdgeKind = "link" | "chainline";

export type MemoryEdge = {
  sourceId: string;
  targetId: string;
  kind: MemoryEdgeKind;
};

export type MemoryGraph = {
  nodes: MemoryNode[];
  edges: MemoryEdge[];
  /** Entry ids with no incoming and no outgoing edges. Missing nodes excluded. */
  orphanIds: string[];
  /** targetId -> ids of entries linking to it. */
  backlinks: Record<string, string[]>;
};

export type ChainlineStage =
  | "source"
  | "note"
  | "decision"
  | "action"
  | "ledger"
  | "pr"
  | "next";

export const CHAINLINE_STAGE_ORDER: readonly ChainlineStage[] = [
  "source",
  "note",
  "decision",
  "action",
  "ledger",
  "pr",
  "next",
];

export type ChainlineStep = {
  stage: ChainlineStage;
  /** Normalized target id (entry id, or raw ref for ledger/pr/next markers). */
  targetId: string;
  /** Title of the resolved entry, or the raw link text when unresolved. */
  label: string;
  /** True when the step points at an entry present in the vault. */
  resolved: boolean;
};

export type ChainlinePath = {
  /** Id of the chainline entry that declares this path. */
  id: string;
  title: string;
  steps: ChainlineStep[];
  /** Stages from CHAINLINE_STAGE_ORDER with no step in this path. */
  missingStages: ChainlineStage[];
};

export type DuplicateMemoryGroup = {
  /** The normalized key the entries collide on. */
  key: string;
  reason: "id" | "title";
  entryIds: string[];
};

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a human-written reference into a stable memory id:
 * lowercase, diacritics stripped, non-alphanumerics collapsed to single dashes.
 * `"Décision Mémoire Vault"` -> `"decision-memoire-vault"`.
 */
export function normalizeMemoryId(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TYPE_PREFIXES = new Set<string>(MEMORY_ENTRY_TYPES);
const REF_PREFIXES = new Set(["ledger", "pr", "next"]);

/** Parses one `[[...]]` inner text into a MemoryLink. */
export function parseMemoryLink(raw: string): MemoryLink {
  const trimmed = raw.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex > 0) {
    const prefix = normalizeMemoryId(trimmed.slice(0, colonIndex));
    const rest = trimmed.slice(colonIndex + 1).trim();
    if (REF_PREFIXES.has(prefix)) {
      // `pr` is both an entry type and a ref prefix; ref semantics win for
      // chainline mapping, but the target id stays resolvable as an entry.
      return {
        targetId: normalizeMemoryId(rest),
        refKind: prefix as "ledger" | "pr" | "next",
        ...(prefix === "pr" ? { targetType: "pr" as MemoryEntryType } : {}),
        raw: trimmed,
      };
    }
    if (TYPE_PREFIXES.has(prefix)) {
      return {
        targetId: normalizeMemoryId(rest),
        targetType: prefix as MemoryEntryType,
        raw: trimmed,
      };
    }
  }
  return { targetId: normalizeMemoryId(trimmed), raw: trimmed };
}

/**
 * Extracts all Obsidian-style `[[...]]` backlinks from markdown.
 * Duplicate targets are kept once (first occurrence wins, order preserved).
 */
export function extractBacklinks(markdown: string): MemoryLink[] {
  const links: MemoryLink[] = [];
  const seen = new Set<string>();
  const pattern = /\[\[([^\[\]]+)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const link = parseMemoryLink(match[1]);
    if (!link.targetId) continue;
    const key = `${link.refKind ?? link.targetType ?? ""}:${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }
  return links;
}

// ---------------------------------------------------------------------------
// Markdown entry parsing (simple frontmatter, no YAML dependency)
// ---------------------------------------------------------------------------

const LIST_KEYS = new Set(["tags", "sourcerefs", "links"]);

function parseListValue(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Parses a memory markdown file into a MemoryEntry.
 *
 * Format: optional `---` frontmatter with `key: value` lines (lists are
 * comma-separated), followed by the markdown body. Body `[[...]]` backlinks
 * and frontmatter `links:` are merged into `entry.links`.
 *
 * Returns null when the file has no usable title (frontmatter `title:` or
 * first `# heading`) — unparseable files must never crash the vault.
 */
export function parseMemoryEntryMarkdown(
  raw: string,
  filePath?: string,
): MemoryEntry | null {
  const meta: Record<string, string> = {};
  let body = raw;

  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (frontmatterMatch) {
    body = raw.slice(frontmatterMatch[0].length);
    for (const line of frontmatterMatch[1].split(/\r?\n/)) {
      const lineMatch = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
      if (!lineMatch) continue;
      meta[lineMatch[1].toLowerCase()] = lineMatch[2].trim();
    }
  }

  const headingMatch = body.match(/^#\s+(.+)$/m);
  const title = meta.title || headingMatch?.[1].trim() || "";
  if (!title) return null;

  const declaredType = meta.type ? normalizeMemoryId(meta.type) : "note";
  const type: MemoryEntryType = TYPE_PREFIXES.has(declaredType)
    ? (declaredType as MemoryEntryType)
    : "note";

  const frontmatterLinks = LIST_KEYS.has("links") && meta.links
    ? parseListValue(meta.links).map(parseMemoryLink)
    : [];
  const bodyLinks = extractBacklinks(body);

  const links: MemoryLink[] = [];
  const seen = new Set<string>();
  for (const link of [...frontmatterLinks, ...bodyLinks]) {
    if (!link.targetId) continue;
    const key = `${link.refKind ?? link.targetType ?? ""}:${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  return {
    id: normalizeMemoryId(meta.id || title),
    type,
    title,
    status: meta.status || "active",
    project: meta.project || undefined,
    tags: meta.tags ? parseListValue(meta.tags) : [],
    confidence: meta.confidence || undefined,
    sourceRefs: meta.sourcerefs ? parseListValue(meta.sourcerefs) : [],
    links,
    body: body.trim(),
    createdAt: meta.createdat || undefined,
    updatedAt: meta.updatedat || undefined,
    filePath,
  };
}

// ---------------------------------------------------------------------------
// Graph building
// ---------------------------------------------------------------------------

/**
 * Builds the memory graph from parsed entries.
 *
 * - One node per entry; link targets without a backing entry become
 *   `missing: true` nodes so broken links stay visible.
 * - Edges are deduped on (source, target, kind). Self-links are dropped.
 * - Chainline entries produce `kind: "chainline"` edges; everything else
 *   produces `kind: "link"`.
 */
export function buildMemoryGraph(entries: MemoryEntry[]): MemoryGraph {
  const nodesById = new Map<string, MemoryNode>();
  for (const entry of entries) {
    if (nodesById.has(entry.id)) continue;
    nodesById.set(entry.id, {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      status: entry.status,
      tags: entry.tags,
      missing: false,
    });
  }

  const edges: MemoryEdge[] = [];
  const edgeKeys = new Set<string>();
  const backlinks: Record<string, string[]> = {};

  for (const entry of entries) {
    const kind: MemoryEdgeKind = entry.type === "chainline" ? "chainline" : "link";
    for (const link of entry.links) {
      if (link.targetId === entry.id) continue;
      if (!nodesById.has(link.targetId)) {
        nodesById.set(link.targetId, {
          id: link.targetId,
          type: link.targetType ?? (link.refKind === "ledger" ? "source" : link.refKind === "pr" ? "pr" : "note"),
          title: link.raw,
          status: "missing",
          tags: [],
          missing: true,
        });
      }
      const edgeKey = `${entry.id}->${link.targetId}:${kind}`;
      if (edgeKeys.has(edgeKey)) continue;
      edgeKeys.add(edgeKey);
      edges.push({ sourceId: entry.id, targetId: link.targetId, kind });
      if (!backlinks[link.targetId]) backlinks[link.targetId] = [];
      if (!backlinks[link.targetId].includes(entry.id)) {
        backlinks[link.targetId].push(entry.id);
      }
    }
  }

  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.sourceId);
    connected.add(edge.targetId);
  }

  const orphanIds = entries
    .map((entry) => entry.id)
    .filter((id) => !connected.has(id));

  return {
    nodes: [...nodesById.values()],
    edges,
    orphanIds,
    backlinks,
  };
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Detects entries colliding on normalized id, or on normalized title within
 * the same type. Groups with a single entry are not reported.
 */
export function detectDuplicateMemory(entries: MemoryEntry[]): DuplicateMemoryGroup[] {
  const byId = new Map<string, string[]>();
  const byTitle = new Map<string, string[]>();

  entries.forEach((entry, index) => {
    // Index disambiguates raw positions when ids themselves collide.
    const ref = `${entry.id}#${index}`;
    const idGroup = byId.get(entry.id) ?? [];
    idGroup.push(ref);
    byId.set(entry.id, idGroup);

    const titleKey = `${entry.type}:${normalizeMemoryId(entry.title)}`;
    const titleGroup = byTitle.get(titleKey) ?? [];
    titleGroup.push(ref);
    byTitle.set(titleKey, titleGroup);
  });

  const groups: DuplicateMemoryGroup[] = [];
  const reportedRefs = new Set<string>();

  for (const [key, refs] of byId) {
    if (refs.length < 2) continue;
    groups.push({ key, reason: "id", entryIds: refs.map((r) => r.split("#")[0]) });
    refs.forEach((r) => reportedRefs.add(r));
  }

  for (const [key, refs] of byTitle) {
    if (refs.length < 2) continue;
    // Skip title groups fully covered by an id collision report.
    if (refs.every((r) => reportedRefs.has(r))) continue;
    groups.push({ key, reason: "title", entryIds: refs.map((r) => r.split("#")[0]) });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Chainline
// ---------------------------------------------------------------------------

/** Maps a link to its chainline stage. `null` when the target has no stage semantics. */
export function chainlineStageForLink(
  link: MemoryLink,
  entryTypeById: Map<string, MemoryEntryType>,
): ChainlineStage | null {
  if (link.refKind) return link.refKind;
  const type = link.targetType ?? entryTypeById.get(link.targetId);
  switch (type) {
    case "source":
    case "doc":
      return "source";
    case "note":
    case "sop":
      return "note";
    case "decision":
      return "decision";
    case "action":
      return "action";
    case "pr":
      return "pr";
    default:
      return null;
  }
}

/**
 * Builds chainline paths from `type: chainline` entries.
 *
 * Steps follow the link order declared in the chainline entry; each step is
 * mapped to a stage (source → note → decision → action → ledger → pr → next).
 * Links with no stage semantics (agents, ventures) are skipped — they are
 * context, not chain steps.
 */
export function buildChainlineGraph(entries: MemoryEntry[]): ChainlinePath[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const entryTypeById = new Map(entries.map((entry) => [entry.id, entry.type]));

  return entries
    .filter((entry) => entry.type === "chainline")
    .map((entry) => {
      const steps: ChainlineStep[] = [];
      for (const link of entry.links) {
        const stage = chainlineStageForLink(link, entryTypeById);
        if (!stage) continue;
        const target = entryById.get(link.targetId);
        steps.push({
          stage,
          targetId: link.targetId,
          label: target?.title ?? link.raw,
          resolved: Boolean(target),
        });
      }
      const presentStages = new Set(steps.map((step) => step.stage));
      return {
        id: entry.id,
        title: entry.title,
        steps,
        missingStages: CHAINLINE_STAGE_ORDER.filter((stage) => !presentStages.has(stage)),
      };
    });
}

/** Returns the chainline paths that include the given entry id. */
export function chainlinesForEntry(
  entryId: string,
  chainlines: ChainlinePath[],
): ChainlinePath[] {
  return chainlines.filter(
    (path) => path.id === entryId || path.steps.some((step) => step.targetId === entryId),
  );
}
