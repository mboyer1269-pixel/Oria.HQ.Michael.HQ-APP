import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { createJiti } from "jiti";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const jiti = createJiti(import.meta.url, { fsCache: false, jsx: { runtime: "automatic" }, alias: { "@": path.resolve("src") } });
const { AgentVentureWorkbenchWithForm } = await jiti.import("./agent-venture-workbench-with-form.tsx");

test("venture samples require explicit demo mode and carry a demo label", () => {
  const prior = process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
  try {
    for (const flag of [undefined, "0", "1"]) {
      if (flag === undefined) delete process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
      else process.env.NEXT_PUBLIC_ORIA_DEMO_MODE = flag;
      const html = renderToStaticMarkup(createElement(AgentVentureWorkbenchWithForm));
      if (flag === "1") {
        assert.match(html, /Démo — données simulées/);
        assert.match(html, /AI Bookkeeping Assistant/);
      } else {
        assert.match(html, /Aucune donnée/);
        assert.doesNotMatch(html, /AI Bookkeeping Assistant|600,000|67%|200\+ complaints/);
      }
    }
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_ORIA_DEMO_MODE;
    else process.env.NEXT_PUBLIC_ORIA_DEMO_MODE = prior;
  }
});
