import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false });
const { AgentCharterPanel } = await jiti.import("./agent-charter-panel.tsx");
const { agentRegistry } = await jiti.import("../seed.ts");
const { charterRegistry } = await jiti.import("../charter-seed.ts");
const { buildCharterHealthReport } = await jiti.import("../agent-charter.ts");
const health = buildCharterHealthReport(agentRegistry, charterRegistry);
const render = (charters, report) => renderToStaticMarkup(createElement(AgentCharterPanel, { charters, health: report }));

test("documented workflows and KPI are behind native charter disclosures, not presented as live work", () => {
  const html = render(charterRegistry, health); const summaries = [...html.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)];
  assert.equal(summaries.length, health.rows.length); assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/);
  for (const [, summary] of summaries) { assert.match(summary, /Voir la charte/); assert.match(summary, /parcours documenté/); assert.doesNotMatch(summary, /<button|<a\b|aria-expanded/); }
  assert.match(html, /chartes documentées/); assert.doesNotMatch(html, /opérationnels|animate-|oria-pulse/);
  assert.match(html, /Déclencheur/); assert.match(html, /Sortie/); assert.match(html, /Ensuite/);
});
test("incomplete charter gaps and absent charters stay visible without opening a disclosure", () => {
  const row = { ...health.rows[0], verdict: "thin", topGap: "Validation manquante" };
  const html = render([charterRegistry.find(c => c.agentId === row.agentId)], { ...health, rows: [row] });
  assert.match(html.slice(0, html.indexOf("<details")), /Validation manquante/);
  const absent = render([], { ...health, rows: [row] }); assert.match(absent, /aucune charte/); assert.doesNotMatch(absent, /<details/);
});
