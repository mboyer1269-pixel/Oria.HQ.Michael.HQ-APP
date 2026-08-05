#!/usr/bin/env node

// src/features/cockpit/actions/cockpit-layout-owner-gate.test.mjs
//
// V7 Phase 0 — contract guard on the cockpit layout server actions.
//
// getCockpitLayout previously took a caller-supplied `userId` and read the row
// through the service-role client, which bypasses RLS. Exported server actions
// are independently invocable, so the calling page's auth check guaranteed
// nothing about the action itself. The user id must be derived server-side.
//
// This test pins the shape (no caller-supplied identity) rather than the
// implementation, so a regression to the old signature fails here.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Cockpit layout owner gate (V7 Phase 0)", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "cockpit-layout.ts"));

  await t.test("getCockpitLayout accepts no caller-supplied identity", () => {
    assert.equal(
      typeof mod.getCockpitLayout,
      "function",
      "getCockpitLayout must stay exported",
    );
    assert.equal(
      mod.getCockpitLayout.length,
      0,
      "getCockpitLayout must take no parameters — the owner id is derived " +
        "server-side, never accepted from the caller",
    );
  });

  await t.test("saveCockpitLayout takes only the order, never an identity", () => {
    assert.equal(typeof mod.saveCockpitLayout, "function");
    assert.equal(
      mod.saveCockpitLayout.length,
      1,
      "saveCockpitLayout takes the widget order only",
    );
  });

  await t.test("each exported action calls the owner gate itself", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(__dirname, "cockpit-layout.ts"), "utf8"),
    );

    /** Body of one exported action, up to the next top-level export. */
    function bodyOf(name) {
      const start = source.indexOf(`export async function ${name}(`);
      assert.ok(start >= 0, `${name} must be an exported async function`);
      const rest = source.slice(start + 1);
      const nextExport = rest.indexOf("\nexport ");
      return nextExport === -1 ? rest : rest.slice(0, nextExport);
    }

    // Scoped per action: a gate call elsewhere in the file must not satisfy the
    // contract for an action that lacks one.
    for (const name of ["getCockpitLayout", "saveCockpitLayout"]) {
      assert.match(
        bodyOf(name),
        /requireOwnerAccess\(/,
        `${name} must call requireOwnerAccess itself rather than trusting its caller`,
      );
    }
  });
});
