import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false });
const { AgentCard } = await jiti.import("./agent-card.tsx");
const { agentRegistry } = await jiti.import("../seed.ts");
const render = agent => renderToStaticMarkup(createElement(AgentCard, { agent }));

test("agent summary keeps name, short role, configured state and primary disclosure only", () => {
  for (const agent of agentRegistry) {
    const html = render(agent); const summary = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1];
    assert.ok(summary.includes(agent.name)); assert.match(summary, /Profil (activé|en attente|verrouillé|planifié)/);
    assert.match(summary, /Voir le profil/); assert.doesNotMatch(summary, /<button|<a\b|aria-expanded|title=/);
    assert.ok(!summary.includes(agent.description)); assert.doesNotMatch(html, /<details[^>]*\sopen(?:\s|=|>)/);
    assert.match(html, /min-h-11/); assert.match(html, /focus-visible:outline/);
  }
});
test("profile details preserve description and static constraints, never invent a live agent", () => {
  const agent = { ...agentRegistry[0], description: "Description complète test", constraints: ["Restriction test"], lore: "Histoire test" };
  const html = render(agent); const details = html.slice(html.indexOf("</summary>"));
  for (const text of [agent.description, agent.constraints[0], agent.lore, "aucune connexion ni exécution en cours confirmée"]) assert.ok(details.includes(text));
  assert.doesNotMatch(html, /animate-|oria-pulse|En ligne|Agent actif/);
});
test("locked warning remains outside the collapsed profile and source text is escaped", () => {
  const html = render({ ...agentRegistry[0], name: "<script>test</script>", status: "locked" });
  assert.match(html.slice(html.indexOf("</details>")), /Profil verrouillé : aucune exécution autorisée/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
});
