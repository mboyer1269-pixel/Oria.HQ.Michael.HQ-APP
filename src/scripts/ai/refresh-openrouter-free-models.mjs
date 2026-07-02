#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const outputPath = path.join(projectRoot, "config", "openrouter.free-models.json");
const modelsUrl =
  "https://openrouter.ai/api/v1/models?max_price=0&output_modalities=text&sort=context-high-to-low";

function tryParseJson(text) {
  try {
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return undefined;
  }
}

async function readExistingCatalog() {
  try {
    return tryParseJson(await readFile(outputPath, "utf-8"));
  } catch {
    return undefined;
  }
}

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { buildOpenRouterFreeModelSnapshot } = await jiti.import(
  path.join(projectRoot, "src/server/ai/openrouter-model-catalog.ts"),
);

const headers = { accept: "application/json" };
if (process.env.OPENROUTER_API_KEY) {
  headers.authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
}

const response = await fetch(modelsUrl, { headers });
if (!response.ok) {
  throw new Error(`OpenRouter models refresh failed with HTTP ${response.status}`);
}

const apiResponse = await response.json();
const snapshot = buildOpenRouterFreeModelSnapshot(apiResponse, {
  nowIso: new Date().toISOString(),
  existingCatalog: await readExistingCatalog(),
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");

console.log(
  `Refreshed ${snapshot.models.length} OpenRouter free model(s) at ${path.relative(
    projectRoot,
    outputPath,
  )}. Existing enabled/recommended flags were preserved.`,
);
