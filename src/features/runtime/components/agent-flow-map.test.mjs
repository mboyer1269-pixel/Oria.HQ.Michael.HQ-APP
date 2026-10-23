import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, fsCache: false,
  alias: { "@": path.join(process.cwd(), "src") } });
const { AgentFlowMap } = await jiti.import("./agent-flow-map.tsx");
const data = {
  agents: [{ id: "fixture-agent", label: "Fixture", eventCount: 1 }],
  decisions: 0, actions: 1, results: 0, surfaces: { sendDesk: 0, calendar: 0, missions: 1 },
  recentEvents: [{ id: "fixture-event", agentId: "fixture-agent", actionType: "mission.fixture",
    summary: "Synthetic event", createdAt: "2026-10-23T01:39:00.000Z" }],
};
const render = value => renderToStaticMarkup(createElement(AgentFlowMap, { data: value }));

test("server and browser time zones produce identical event markup", () => {
  const previous = process.env.TZ;
  try {
    const pages = ["UTC", "America/Toronto", "Asia/Tokyo"].map(timeZone => {
      process.env.TZ = timeZone;
      return render(data);
    });
    assert.equal(pages[0], pages[1], "UTC server and Toronto browser must hydrate the same text");
    assert.equal(pages[0], pages[2], "UTC server and Tokyo browser must hydrate the same text");
    assert.match(pages[0], /01:39 UTC/);
    assert.match(pages[0], /Synthetic event/);
    assert.match(pages[0], /<button/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("offset timestamps normalize to UTC and invalid or unzoned dates do not invent a local time", () => {
  const withDate = createdAt => render({ ...data, recentEvents: [{ ...data.recentEvents[0], createdAt }] });
  assert.match(withDate("2026-10-22T21:39:00-04:00"), /01:39 UTC/);
  for (const timestamp of ["not-a-date", "", "2026-10-23T01:39:00"]) {
    const html = withDate(timestamp);
    assert.match(html, /Heure inconnue/);
    assert.doesNotMatch(html, /Invalid Date|NaN/);
    assert.match(html, /Synthetic event/);
  }
});
