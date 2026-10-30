import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { fsCache: false });
const { moveWidgetOrder, getWidgetLabel, cockpitReorderAnnouncements } = await jiti.import("./cockpit-reorder.ts");
const order = ["treasury", "ventures", "modes"];
const event = (id, over = null) => ({ active: { id }, over: over === null ? null : { id: over } });

test("changed drops move once without mutating the user's initial order", () => {
  assert.deepEqual(moveWidgetOrder(order, "treasury", "ventures"), ["ventures", "treasury", "modes"]);
  assert.deepEqual(moveWidgetOrder(order, "modes", "treasury"), ["modes", "treasury", "ventures"]);
  assert.deepEqual(order, ["treasury", "ventures", "modes"]);
});
test("cancelled, unchanged and invalid targets produce no persistable order", () => {
  for (const [from, to] of [["treasury", null], ["treasury", "treasury"], ["unknown", "treasury"], ["treasury", "unknown"]]) {
    assert.equal(moveWidgetOrder(order, from, to), null);
  }
});
test("repeated moves operate on the latest order, preserving membership", () => {
  const first = moveWidgetOrder(order, "treasury", "ventures");
  const second = moveWidgetOrder(first, "treasury", "modes");
  assert.deepEqual(second, ["ventures", "modes", "treasury"]);
  assert.deepEqual([...second].sort(), [...order].sort());
});
test("all seven widgets have stable specific French accessible labels", () => {
  const labels = ["daily-direction", "idea-intake", "decision-queue", "joris-agent", ...order].map(getWidgetLabel);
  assert.equal(new Set(labels).size, 7);
  assert.ok(labels.every(x => x !== "Widget"));
});
test("pickup, destination, drop and cancellation announcements are specific and honest", () => {
  const a = cockpitReorderAnnouncements(() => order);
  assert.match(a.onDragStart(event("treasury")), /Trésorerie saisi, position 1 sur 3/);
  assert.match(a.onDragOver(event("treasury", "modes")), /position proposée 3 sur 3/);
  assert.match(a.onDragEnd(event("treasury", "modes")), /Trésorerie déplacé, position 3 sur 3/);
  assert.match(a.onDragEnd(event("treasury", "modes")), /sauvegarde non confirmée/);
  assert.match(a.onDragCancel(event("treasury", "modes")), /annulé\. Ordre inchangé/);
  assert.match(a.onDragEnd(event("treasury")), /Ordre inchangé/);
  assert.match(a.onDragEnd(event("treasury", "treasury")), /Ordre inchangé/);
  assert.match(a.onDragOver(event("treasury")), /hors de la grille/);
});
test("announcements read the captured drag snapshot rather than a stale initialized order", () => {
  let snapshot = order;
  const a = cockpitReorderAnnouncements(() => snapshot);
  snapshot = ["ventures", "modes", "treasury"];
  assert.match(a.onDragStart(event("treasury")), /position 3 sur 3/);
  assert.match(a.onDragEnd(event("treasury", "ventures")), /position 1 sur 3/);
});
const source = readFileSync(new URL("./cockpit-interactive.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");
test("component wires keyboard coordinates and the actual focusable activator", () => {
  assert.match(source, /useSensor\(KeyboardSensor, \{ coordinateGetter: sortableKeyboardCoordinates \}\)/);
  assert.match(source, /ref=\{setActivatorNodeRef\}/);
  assert.match(source, /restoreFocus: true/);
  assert.match(source, /aria-label=\{`Déplacer \$\{getWidgetLabel\(id\)\}`\}/);
  assert.match(source, /onDragStart=\{\(\) => \{ setDragStartOrder\(\[\.\.\.order\]/);
  assert.doesNotMatch(source, /onDragCancel=\{handleDragEnd\}/);
});
test("pending requests block another drag without removing the handle's focus target", () => {
  assert.match(source, /useSortable\(\{ id, disabled: pending \}\)/);
  assert.match(source, /aria-disabled=\{pending\}/);
  const button = source.slice(source.indexOf("{/* Drag handle */}"), source.indexOf("// ─── ⌘K Command palette"));
  assert.doesNotMatch(button, /\sdisabled=|tabIndex=\{-1\}/);
  const callback = source.slice(source.indexOf("const handleDragEnd"), source.indexOf("function renderWidget"));
  assert.match(callback, /if \(savePending\.current\) return/);
  assert.match(callback, /if \(!newOrder\) return/);
  assert.equal((callback.match(/saveCockpitLayout\(next.request\)/g) ?? []).length, 1);
  assert.ok(callback.indexOf('savePending.current = true') < callback.indexOf('saveCockpitLayout(next.request)'));
  assert.match(callback, /\.finally\(\(\) => \{ savePending\.current = false/);
});
test("typed persistence never treats a transport failure as known no-effect", () => {
  assert.match(source, /settleLayoutSave\(current, result\)/);
  assert.match(source, /settleLayoutSave\(current, \{ status: "unconfirmed" \}\)/);
  assert.match(source, /pending=\{!canSaveCockpitLayout\(layout\)\}/);
  assert.match(source, /settleLayoutReload\(current, \{ status: "failed" \}\)/);
  assert.match(source, /onClick=\{reloadLayout\}/);
  assert.match(source, /aria-disabled=\{layout.status === "reloading"\}/);
  assert.match(source, /minHeight: 44, marginTop: 8, padding: "10px 14px"/);
  assert.match(css, /\.cockpit-layout-reload:focus-visible \{ outline: 2px solid var\(--marigold\)/);
});
test("mobile target and keyboard visibility use existing tokens without obscuring headers", () => {
  assert.match(source, /width: 44,\s+height: 44/);
  assert.equal((source.match(/18px 64px 0 20px/g) ?? []).length, 2);
  assert.match(css, /\.cockpit-drag-handle:focus-visible \{ opacity: 1; outline: 2px solid var\(--marigold\)/);
  assert.match(css, /@media \(hover: none\) \{ \.cockpit-drag-handle \{ opacity: 1/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\).*transition: none/);
});

// Browser QA proved the old fill-mode animation overrode dnd-kit transforms and opacity.
test("sortable wrapper leaves transform and drag opacity entirely to dnd-kit", () => {
  const wrapper = source.slice(source.indexOf("function SortableWidget"), source.indexOf("// ─── ⌘K Command palette"));
  assert.match(wrapper, /transform: CSS\.Transform\.toString\(transform\)/);
  assert.match(wrapper, /opacity: isDragging \? 0\.45 : 1/);
  assert.doesNotMatch(wrapper, /animation:|animationDelay:|oria-fadein/);
});

test("pickup reads the current order before React commits the next drag snapshot", () => {
  const oldSnapshot = ["treasury", "ventures", "modes"];
  const current = ["ventures", "modes", "treasury"];
  const a = cockpitReorderAnnouncements(() => oldSnapshot, () => current);
  assert.match(a.onDragStart(event("treasury")), /position 3 sur 3/);
});
