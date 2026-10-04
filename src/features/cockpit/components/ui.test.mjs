#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(__dirname, "tooltip.tsx"), "utf8");

test("Tooltip keeps the accessible trigger-panel contract in one component", () => {
  assert.match(source, /const tooltipId = useId\(\)/, "each instance needs a React-stable id");
  assert.match(
    source,
    /"aria-describedby": describedBy/,
    "the id must be attached to the actual trigger",
  );
  assert.match(source, /id=\{tooltipId\}[\s\S]{0,80}role="tooltip"/);
  assert.match(source, /hidden=\{!isOpen\}/, "inactive content must leave the a11y tree");
  assert.match(source, /aria-hidden=\{!isOpen\}/);
  assert.match(source, /onFocus\(event\)[\s\S]{0,160}setFocused\(true\)/);
  assert.match(source, /event\.key === "Escape"[\s\S]{0,80}setDismissed\(true\)/);
  assert.match(source, /focus-visible:outline-2/, "keyboard triggers need a visible focus ring");
  assert.match(
    source,
    /return \(\s*<div className=\{`relative inline-flex/,
    "the wrapper must accept both inline and block-level triggers",
  );
  assert.match(
    source,
    /tabIndex: isInteractive \? children\.props\.tabIndex : 0/,
    "only visual triggers receive a tab stop, together with focus and Escape handlers",
  );
  assert.doesNotMatch(
    source,
    /<span[\s\S]{0,120}tabIndex=\{0\}/,
    "the presentational wrapper must not become an unhandled tab stop",
  );
});
