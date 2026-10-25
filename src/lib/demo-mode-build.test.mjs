import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SENT-B3-3: demo flag pinned at build for server and client bundles", () => {
  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /NEXT_PUBLIC_ORIA_DEMO_MODE: process\.env\.NEXT_PUBLIC_ORIA_DEMO_MODE === "1" \? "1" : "0"/);
  assert.match(readFileSync("src/lib/demo-mode.ts", "utf8"), /process\.env\.NEXT_PUBLIC_ORIA_DEMO_MODE === "1"/);
});
