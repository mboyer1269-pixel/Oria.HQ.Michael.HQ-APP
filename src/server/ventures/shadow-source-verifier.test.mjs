#!/usr/bin/env node

// src/server/ventures/shadow-source-verifier.test.mjs
//
// External source verification. fetch is injected; nothing here touches the
// network.
//
// The case that motivated this module: on the first real run, two of three
// cited URLs did not resolve — one named the French regulator as the source for
// a Quebec statute — and every evidence gate passed, because the gates only
// checked that a URL was well-formed and distinct.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { checkSourceUrl, verifyEvidenceSources } = await jiti.import(
  path.join(__dirname, "shadow-source-verifier.ts"),
);

const external = (dimension, url) => ({
  dimension,
  value: 7,
  rationale: "because",
  source: { kind: "external", url },
});

/** fetch stub driven by a url → status (or thrown error) map. */
function fetchReturning(map) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, method: init?.method });
    const entry = map[url];
    if (entry instanceof Error) throw entry;
    const status = entry ?? 200;
    return { ok: status >= 200 && status < 300, status };
  };
  impl.calls = calls;
  return impl;
}

test("Source check — a single url (V7)", async (t) => {
  await t.test("200 is reachable", async () => {
    const check = await checkSourceUrl("https://ok.example", {
      fetchImpl: fetchReturning({ "https://ok.example": 200 }),
    });
    assert.equal(check.verdict, "reachable");
  });

  await t.test("404 and 410 are proof of absence", async () => {
    for (const status of [404, 410]) {
      const check = await checkSourceUrl("https://gone.example", {
        fetchImpl: fetchReturning({ "https://gone.example": status }),
      });
      assert.equal(check.verdict, "absent", `${status} must prove absence`);
    }
  });

  await t.test("a refused HEAD retries with GET", async () => {
    // Some servers reject HEAD outright; a 405 says nothing about the page.
    let seen = 0;
    const impl = async (_url, init) => {
      seen += 1;
      return init.method === "HEAD"
        ? { ok: false, status: 405 }
        : { ok: true, status: 200 };
    };

    const check = await checkSourceUrl("https://nohead.example", { fetchImpl: impl });
    assert.equal(check.verdict, "reachable");
    assert.equal(seen, 2, "HEAD then GET");
  });

  await t.test("403, 500 and timeouts are UNVERIFIED, never absent", async () => {
    // A failure of the check is not a failure of the source. Treating a bot
    // filter or a server hiccup as fabrication would discard real evidence.
    for (const entry of [403, 429, 500, 503, new Error("timeout")]) {
      const check = await checkSourceUrl("https://blocked.example", {
        fetchImpl: fetchReturning({ "https://blocked.example": entry }),
      });
      assert.equal(check.verdict, "unverified", `${entry} must not prove absence`);
    }
  });
});

test("Source verification — over an evidence set (V7)", async (t) => {
  await t.test("a dead source is demoted to unsourced", async () => {
    const { evidence, report } = await verifyEvidenceSources(
      [external("marketPain", "https://dead.example")],
      { fetchImpl: fetchReturning({ "https://dead.example": 404 }) },
    );

    assert.equal(evidence[0].source.kind, "none", "the claim of evidence is withdrawn");
    assert.equal(report.demoted.length, 1);
    assert.equal(report.demoted[0].dimension, "marketPain");
  });

  await t.test("the value and rationale survive demotion", async () => {
    // The reasoning may hold even when the citation does not; only the evidence
    // claim is withdrawn.
    const { evidence } = await verifyEvidenceSources(
      [external("risk", "https://dead.example")],
      { fetchImpl: fetchReturning({ "https://dead.example": 404 }) },
    );

    assert.equal(evidence[0].value, 7);
    assert.equal(evidence[0].rationale, "because");
  });

  await t.test("an unverifiable source is left in place", async () => {
    const { evidence, report } = await verifyEvidenceSources(
      [external("revenuePotential", "https://blocked.example")],
      { fetchImpl: fetchReturning({ "https://blocked.example": 403 }) },
    );

    assert.equal(evidence[0].source.kind, "external", "not punished for a failed check");
    assert.equal(report.unverified.length, 1);
    assert.equal(report.demoted.length, 0);
  });

  await t.test("internal and none sources are never checked", async () => {
    const impl = fetchReturning({});
    const { report } = await verifyEvidenceSources(
      [
        { dimension: "a", value: 5, rationale: "r", source: { kind: "internal", ref: "field" } },
        { dimension: "b", value: 5, rationale: "r", source: { kind: "none" } },
      ],
      { fetchImpl: impl },
    );

    assert.equal(impl.calls.length, 0);
    assert.equal(report.checked, 0);
  });

  await t.test("a url cited twice is checked once", async () => {
    const impl = fetchReturning({ "https://same.example": 200 });
    await verifyEvidenceSources(
      [external("a", "https://same.example"), external("b", "https://same.example")],
      { fetchImpl: impl },
    );

    assert.equal(impl.calls.length, 1, "distinct urls only");
  });

  await t.test("the real first-run case: 2 of 3 fabricated", async () => {
    // Reproduces exactly what the first live run produced.
    const { evidence, report } = await verifyEvidenceSources(
      [
        external("revenuePotential", "https://www.stat.gouv.qc.ca/statistiques/economie/pme/caracteristiques.html"),
        external("marketPain", "https://www.cnil.fr/fr/loi-25-quebec-protection-donnees"),
        external("differentiation", "https://www.onetrust.com/solutions/privacy-compliance/"),
      ],
      {
        fetchImpl: fetchReturning({
          "https://www.stat.gouv.qc.ca/statistiques/economie/pme/caracteristiques.html": 404,
          "https://www.cnil.fr/fr/loi-25-quebec-protection-donnees": 404,
          "https://www.onetrust.com/solutions/privacy-compliance/": 200,
        }),
      },
    );

    assert.equal(report.demoted.length, 2);
    assert.equal(report.reachable, 1);
    assert.equal(evidence[0].source.kind, "none");
    assert.equal(evidence[1].source.kind, "none");
    assert.equal(evidence[2].source.kind, "external", "the real one survives");
  });

  await t.test("a throwing fetch degrades to unverified, never to absent", async () => {
    const { evidence, report } = await verifyEvidenceSources(
      [external("a", "https://boom.example")],
      {
        fetchImpl: async () => {
          throw new Error("network down");
        },
      },
    );

    assert.equal(evidence[0].source.kind, "external");
    assert.equal(report.unverified.length, 1);
  });

  await t.test("an empty evidence set is handled", async () => {
    const { evidence, report } = await verifyEvidenceSources([], {});
    assert.deepEqual(evidence, []);
    assert.equal(report.checked, 0);
  });
});
