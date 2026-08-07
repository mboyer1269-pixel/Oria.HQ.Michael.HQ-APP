#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const migrationPath = path.join(projectRoot, "db/migrations/0030_pgvector_semantic_memory.sql");
const sql = readFileSync(migrationPath, "utf-8");
const executableSql = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("0030 pgvector semantic memory migration", () => {
  it("enables pgvector extension", () => {
    assert.match(executableSql, /create extension if not exists vector/i);
  });

  it("creates agent_semantic_memory_embeddings", () => {
    assert.match(executableSql, /agent_semantic_memory_embeddings/i);
    assert.match(executableSql, /vector\(1536\)/i);
  });

  it("enforces partition uniqueness per workspace", () => {
    assert.match(executableSql, /unique\s*\(\s*workspace_id\s*,\s*context_partition\s*,\s*memory_id\s*\)/i);
  });

  it("declares 8 restrictive block policies", () => {
    const count = (executableSql.match(/agent_semantic_memory_embeddings_block_/g) || []).length;
    assert.equal(count, 8);
  });
});
