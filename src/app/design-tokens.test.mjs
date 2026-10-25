// Garde-fou design system (DESIGN.md §3) : taille minimale 12 px et
// textes atténués à contraste suffisant (WCAG 2.2 AA 1.4.3).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const BANNED = [
  [/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/, "taille < 12 px"],
  [/\btext-neutral-(?:500|600|700|800|900)\b/, "texte neutral sombre (contraste insuffisant sur fond sombre)"],
  [/text-\[#(?:646c8e|6f7899|5d6688|5a6080|505878|3a4061|98a1c4|8791b7)\]/i, "hex atténué à faible contraste"],
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

test("aucune classe interdite par le design system dans src/**/*.tsx", () => {
  const hits = [];
  for (const file of walk(root)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const [re, why] of BANNED) if (re.test(line)) hits.push(`${path.relative(root, file)}:${i + 1} ${why}`);
    });
  }
  assert.deepEqual(hits, [], hits.slice(0, 20).join("\n"));
});
