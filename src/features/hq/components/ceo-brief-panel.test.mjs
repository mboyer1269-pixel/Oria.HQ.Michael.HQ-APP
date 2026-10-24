import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

globalThis.React = React;
const jiti = createJiti(import.meta.url, {
  jsx: true,
  alias: { "@": path.join(process.cwd(), "src") },
});
const { CeoBriefPanel } = await jiti.import("./ceo-brief-panel.tsx");

// Illustrative rendering fixtures only; no API, database, or production evidence.
function renderDocuments(documents) {
  const html = renderToStaticMarkup(React.createElement(CeoBriefPanel, {
    brief: {
      generatedAt: "2026-10-24T12:00:00.000Z",
      headline: "Brief illustratif de test",
      focusLine: "Données illustratives uniquement.",
      agenda: { upcomingCount: 0, items: [] },
      leads: { newCount: 0, items: [] },
      documents: { source: "local_fixture", byHat: {}, recentFilenames: [], ...documents },
    },
  }));
  const card = html.match(/<article\b[^>]*>(?:(?!<\/article>)[\s\S])*?<h3[^>]*>Documents<\/h3>[\s\S]*?<\/article>/)?.[0];
  assert.ok(card, "the real component renders its Documents card");
  assert.match(card, /Source : fixture locale de démonstration/);
  assert.match(card, /pas de données de production/);
  return card;
}

test("available empty fixture renders a confirmed zero and empty state", () => {
  const card = renderDocuments({ status: "available", reason: null, totalCount: 0 });
  assert.match(card, /<span[^>]*>0<\/span>/);
  assert.match(card, /Aucun document dans cette source locale\./);
  assert.doesNotMatch(card, /Indisponible|Ouvrir le coffre/);
});

test("available populated fixture renders count, illustrative filenames, hats and link", () => {
  const card = renderDocuments({
    status: "available", reason: null, totalCount: 2,
    byHat: { "Exemple illustratif": 2 },
    recentFilenames: ["exemple-illustratif-a.pdf", "exemple-illustratif-b.pdf"],
  });
  assert.match(card, /<span[^>]*>2<\/span>/);
  assert.match(card, /exemple-illustratif-a\.pdf/);
  assert.match(card, /exemple-illustratif-b\.pdf/);
  assert.match(card, /Exemple illustratif \(2\)/);
  assert.match(card, /href="\/dashboard\/documents"/);
  assert.match(card, /Ouvrir le coffre/);
  assert.doesNotMatch(card, /Indisponible|Aucun document dans cette source locale|Le coffre est vide/);
});

for (const reason of ["disabled", "missing", "read_error", "invalid_data"]) {
  test(`unavailable ${reason} fixture renders null count safely without claiming absence`, () => {
    const card = renderDocuments({ status: "unavailable", reason, totalCount: null });
    assert.match(card, /<span[^>]*>Indisponible<\/span>/);
    assert.match(card, /La source documentaire n&#x27;a pas pu être lue ou validée/);
    assert.match(card, /L&#x27;absence de documents n&#x27;est pas confirmée/);
    assert.doesNotMatch(card, /<span[^>]*>0<\/span>|Aucun document dans cette source locale|Le coffre est vide|Ouvrir le coffre|>null</);
  });
}

test("unavailable status suppresses residual illustrative filenames and counts", () => {
  const card = renderDocuments({
    status: "unavailable", reason: "invalid_data", totalCount: null,
    byHat: { "Exemple résiduel": 7 },
    recentFilenames: ["exemple-residuel.pdf"],
  });
  assert.match(card, /Indisponible/);
  assert.doesNotMatch(card, /Exemple résiduel|exemple-residuel|Ouvrir le coffre|Aucun document dans cette source locale|Le coffre est vide/);
});
