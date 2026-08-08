import assert from "node:assert/strict";
import { test } from "node:test";

const { normalizeMarketReport } = await import("./validation-report-normalize.ts");

test("normalizeMarketReport accepts valid TAM/SAM/SOM JSON", () => {
  const report = normalizeMarketReport(
    {
      title: "AI scheduling SaaS",
      projectBrief: "Calendar automation for SMBs",
      marketSizing: {
        tamUsd: 10_000_000_000,
        samUsd: 500_000_000,
        somUsd: 5_000_000,
        currency: "USD",
        rationale: "SMB scheduling software spend.",
      },
      acquisitionChannels: [
        { channel: "LinkedIn outbound", fit: "high", notes: "Founders" },
        { channel: "Product Hunt", fit: "medium", notes: "Launch" },
      ],
      demandVerdict: "proceed",
      evidenceSummary: "Beachhead SMBs with 5-50 employees.",
    },
    "fallback brief",
  );
  assert.ok(report);
  assert.equal(report.demandVerdict, "proceed");
  assert.equal(report.marketSizing.somUsd, 5_000_000);
  assert.equal(report.acquisitionChannels.length, 2);
});

test("normalizeMarketReport rejects SOM > SAM", () => {
  const report = normalizeMarketReport(
    {
      title: "Bad",
      marketSizing: {
        tamUsd: 100,
        samUsd: 10,
        somUsd: 50,
        currency: "USD",
        rationale: "broken",
      },
      acquisitionChannels: [
        { channel: "a", fit: "high", notes: "n" },
        { channel: "b", fit: "low", notes: "n" },
      ],
      demandVerdict: "kill",
      evidenceSummary: "x",
    },
    "brief",
  );
  assert.equal(report, null);
});
