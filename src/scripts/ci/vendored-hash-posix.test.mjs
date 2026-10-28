import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { toPosixRel } from "./vendored-hash.mjs";

test("toPosixRel normalizes win32 separators to forward slashes", () => {
  assert.equal(
    toPosixRel("C:\\r", "C:\\r\\.agents\\skills\\supabase\\SKILL.md", path.win32),
    ".agents/skills/supabase/SKILL.md",
  );
});

test("toPosixRel leaves posix relative paths unchanged", () => {
  assert.equal(
    toPosixRel("/r", "/r/.agents/skills/supabase/SKILL.md", path.posix),
    ".agents/skills/supabase/SKILL.md",
  );
});
