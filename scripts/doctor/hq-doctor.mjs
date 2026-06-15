#!/usr/bin/env node
// ---------------------------------------------------------------------------
// HQ DOCTOR — P0, le Système Immunitaire (décision CEO 2026-06-11)
// ---------------------------------------------------------------------------
// Un seul verdict, calculé à froid, zéro LLM : « INTÈGRE — GO » ou un
// diagnostic précis. Quatre organes :
//   1. PONTS      — modules orphelins, stubs déclarés vs réels
//   2. DONNÉES    — schéma pipeline.json, fichiers critiques présents/non vides
//   3. CONFIG     — matrice feature → env requis (rapport, ne bloque pas)
//   4. GIT        — index vs disque : détection de suppressions fantômes
//                   massives (le bug du 2026-06-11, codifié en check)
// Règle de construction : toute pièce P2-P11 mergée DOIT ajouter son organe
// ici. Le système immunitaire grandit avec la maison.
// Usage : npm run doctor          (exit 1 si CRITIQUE)
//         npm run doctor -- --json
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const results = []; // { organ, name, level: "ok"|"warn"|"crit", detail }

function check(organ, name, level, detail = "") {
  results.push({ organ, name, level, detail });
}

function fileNonEmpty(path) {
  try {
    return existsSync(path) && statSync(path).size > 0;
  } catch {
    return false;
  }
}

// Marche du FS pure — indépendante de l'index git (leçon du 2026-06-11 :
// l'index peut mentir, le disque est la vérité).
function walkFiles(dir, accumulator = []) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return accumulator;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      walkFiles(full, accumulator);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.includes("test")) {
      accumulator.push(full);
    }
  }
  return accumulator;
}

let SRC_FILES = null;
function grepRepo(pattern) {
  if (!SRC_FILES) SRC_FILES = walkFiles(join(ROOT, "src"));
  const matches = [];
  for (const file of SRC_FILES) {
    try {
      if (readFileSync(file, "utf-8").includes(pattern)) matches.push(file);
    } catch {
      // fichier illisible = le montage est malade ; l'organe DONNÉES le dira
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// ORGANE 1 — PONTS : producteurs critiques et leurs consommateurs attendus
// ---------------------------------------------------------------------------
const BRIDGES = [
  { module: "outbound-send-store", minConsumers: 3 },
  { module: "outbound-send-service", minConsumers: 1 },
  { module: "loi96-target-store", minConsumers: 1 },
  { module: "loi96-pipeline-action", minConsumers: 1 },
  { module: "venture-asset-repository", minConsumers: 2 },
  { module: "note-repository", minConsumers: 1 },
  { module: "model-router", minConsumers: 2 },
  { module: "cost-ladder", minConsumers: 1 },
  { module: "memory-graph", minConsumers: 2 },
  { module: "agent-learning-loop", minConsumers: 1 },
];

for (const bridge of BRIDGES) {
  const consumers = grepRepo(bridge.module).filter(
    (file) => !file.includes(`/${bridge.module}.`),
  );
  if (consumers.length >= bridge.minConsumers) {
    check("PONTS", bridge.module, "ok", `${consumers.length} consommateur(s)`);
  } else {
    check(
      "PONTS",
      bridge.module,
      "crit",
      `ORPHELIN ou sous-connecté (${consumers.length}/${bridge.minConsumers} consommateurs)`,
    );
  }
}

// Stubs connus — on les TOLÈRE mais on les NOMME (dette visible, jamais oubliée).
const KNOWN_STUBS = [
  "src/app/api/cron/ceo-brief/route.ts",
  "src/app/api/cron/market-scout/route.ts",
];
for (const stub of KNOWN_STUBS) {
  if (existsSync(join(ROOT, stub))) {
    const content = readFileSync(join(ROOT, stub), "utf-8");
    if (content.includes("501")) {
      check("PONTS", stub, "warn", "stub 501 — réveil prévu en P7");
    } else {
      check("PONTS", stub, "ok", "n'est plus un stub");
    }
  }
}

// hermes-prep-tick : orphelin connu jusqu'au branchement complet P1+
const prepTickConsumers = grepRepo("hermes-prep-tick").filter(
  (file) => !file.includes("hermes-prep-tick."),
);
check(
  "PONTS",
  "hermes-prep-tick",
  prepTickConsumers.length > 0 ? "ok" : "warn",
  prepTickConsumers.length > 0
    ? `${prepTickConsumers.length} consommateur(s)`
    : "orphelin connu — branchement prévu (roadmap P1+)",
);

// ---------------------------------------------------------------------------
// ORGANE 2 — DONNÉES : fichiers critiques + schéma pipeline.json
// ---------------------------------------------------------------------------
const CRITICAL_FILES = [
  "ventures/loi96/pipeline.json",
  "ventures/loi96/PLAN_DE_VENTE.md",
  "ventures/loi96/SIMULATION_RESULTATS.md",
  "docs/roadmap/HQ_COMPLETION_ROADMAP_2026-06.md",
  "docs/REVENUE_EXECUTION_LANE.md",
  "AGENTS.md",
];
for (const file of CRITICAL_FILES) {
  if (fileNonEmpty(join(ROOT, file))) {
    check("DONNÉES", file, "ok");
  } else {
    check("DONNÉES", file, "crit", "MANQUANT ou VIDE — données de venture en danger");
  }
}

// Schéma minimal de pipeline.json (sans dépendance externe)
try {
  const pipeline = JSON.parse(
    readFileSync(join(ROOT, "ventures/loi96/pipeline.json"), "utf-8"),
  );
  const shapeOk =
    Array.isArray(pipeline.targets) &&
    pipeline.targets.length > 0 &&
    pipeline.targets.every(
      (target) =>
        typeof target.domain === "string" &&
        typeof target.name === "string" &&
        typeof target.status === "string",
    ) &&
    Array.isArray(pipeline.killMetrics) &&
    pipeline.killMetrics.length > 0;
  check(
    "DONNÉES",
    "pipeline.json schéma",
    shapeOk ? "ok" : "crit",
    shapeOk ? `${pipeline.targets.length} cibles` : "structure invalide",
  );
} catch (error) {
  check("DONNÉES", "pipeline.json schéma", "crit", `illisible: ${error.message}`);
}

// ---------------------------------------------------------------------------
// ORGANE 3 — CONFIG : matrice feature → prérequis (rapport, ne bloque pas)
// ---------------------------------------------------------------------------
const ENV_MATRIX = [
  { feature: "Send Desk (envoi réel)", vars: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] },
  { feature: "Persistance Supabase", vars: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] },
  { feature: "SMS Twilio (P6)", vars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"] },
];
for (const entry of ENV_MATRIX) {
  const missing = entry.vars.filter((name) => !process.env[name]);
  check(
    "CONFIG",
    entry.feature,
    missing.length === 0 ? "ok" : "warn",
    missing.length === 0 ? "prêt" : `manque: ${missing.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// ORGANE 4 — GIT : suppressions fantômes en staging (bug du 2026-06-11)
// ---------------------------------------------------------------------------
try {
  const staged = execSync("git diff --cached --name-status", {
    cwd: ROOT,
    encoding: "utf-8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const deletions = staged.filter((line) => line.startsWith("D")).length;
  if (deletions > 20) {
    check(
      "GIT",
      "suppressions en staging",
      "crit",
      `${deletions} suppressions staged — index probablement empoisonné. NE PAS COMMIT. git reset, vérifier le disque.`,
    );
  } else {
    check("GIT", "suppressions en staging", "ok", `${deletions} suppression(s)`);
  }
} catch {
  check("GIT", "suppressions en staging", "warn", "lecture git impossible");
}

// ---------------------------------------------------------------------------
// ORGANE 5 — MÉMOIRE : intégrité du Memory Vault fichiers (memory/)
// Doublons = crit (une leçon par fichier). Liens cassés, chainlines
// incomplètes et orphelins = warn (dette visible, jamais oubliée).
// ---------------------------------------------------------------------------
try {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": join(ROOT, "src"),
      "server-only": join(ROOT, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const memoryGraph = await jiti.import(
    join(ROOT, "src/server/memory/memory-graph.ts"),
  );

  const memoryRoot = join(ROOT, "memory");
  if (!existsSync(memoryRoot)) {
    check("MÉMOIRE", "memory/", "warn", "vault fichiers absente");
  } else {
    const entries = [];
    const walkVault = (dir) => {
      for (const dirent of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, dirent.name);
        if (dirent.isDirectory()) walkVault(full);
        else if (
          dirent.name.endsWith(".md") &&
          !["readme.md", "index.md"].includes(dirent.name.toLowerCase())
        ) {
          const entry = memoryGraph.parseMemoryEntryMarkdown(
            readFileSync(full, "utf-8"),
            full,
          );
          if (entry) entries.push(entry);
          else check("MÉMOIRE", dirent.name, "warn", "fichier non parsable (titre manquant)");
        }
      }
    };
    walkVault(memoryRoot);
    check("MÉMOIRE", "entrées vault", "ok", `${entries.length} entrée(s)`);

    const duplicates = memoryGraph.detectDuplicateMemory(entries);
    check(
      "MÉMOIRE",
      "doublons",
      duplicates.length === 0 ? "ok" : "crit",
      duplicates.length === 0
        ? "aucun"
        : `${duplicates.length} collision(s): ${duplicates.map((d) => d.key).join(", ")}`,
    );

    // Liens cassés : cibles d'entrée inexistantes (les refs ledger/pr/next
    // non résolues sont attendues — travail en cours, pas une erreur).
    const knownIds = new Set(entries.map((e) => e.id));
    const broken = [];
    for (const entry of entries) {
      for (const link of entry.links) {
        if (link.refKind) continue;
        if (!knownIds.has(link.targetId)) broken.push(`${entry.id} → ${link.raw}`);
      }
    }
    check(
      "MÉMOIRE",
      "liens internes",
      broken.length === 0 ? "ok" : "warn",
      broken.length === 0 ? "tous résolus" : `${broken.length} cassé(s): ${broken.slice(0, 3).join(" · ")}`,
    );

    const chainlines = memoryGraph.buildChainlineGraph(entries);
    const incomplete = chainlines.filter((c) => c.missingStages.length > 0);
    check(
      "MÉMOIRE",
      "chainlines",
      incomplete.length === 0 ? "ok" : "warn",
      `${chainlines.length} chainline(s)` +
        (incomplete.length > 0
          ? `, ${incomplete.length} incomplète(s): ${incomplete.map((c) => c.id).join(", ")}`
          : ""),
    );

    const graph = memoryGraph.buildMemoryGraph(entries);
    check(
      "MÉMOIRE",
      "orphelins",
      graph.orphanIds.length === 0 ? "ok" : "warn",
      graph.orphanIds.length === 0
        ? "aucune entrée isolée"
        : `${graph.orphanIds.length} entrée(s) sans lien: ${graph.orphanIds.slice(0, 3).join(", ")}`,
    );
  }
} catch (error) {
  check("MÉMOIRE", "analyse vault", "warn", `analyse impossible: ${error.message}`);
}

// ---------------------------------------------------------------------------
// ORGANE 6 — ROUTAGE : Cost Ladder (P4). Le snapshot free-models doit parser,
// et l'invariant de plancher (client_audit = premium obligatoire) doit tenir —
// c'est le levier profit, il ne se rétrograde jamais.
// ---------------------------------------------------------------------------
try {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": join(ROOT, "src"),
      "server-only": join(ROOT, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  const ladder = await jiti.import(join(ROOT, "src/server/ai/cost-ladder.ts"));

  const snapshotPath = join(ROOT, "config/openrouter.free-models.json");
  if (!existsSync(snapshotPath)) {
    check(
      "ROUTAGE",
      "free-models snapshot",
      "warn",
      "absent — étage gratuit désactivé (repli économie)",
    );
  } else {
    const catalog = ladder.parseFreeModelCatalogText(
      readFileSync(snapshotPath, "utf-8"),
    );
    const eligible = ladder.eligibleFreeModels(catalog);
    check(
      "ROUTAGE",
      "free-models snapshot",
      "ok",
      `${catalog.length} modèle(s), ${eligible.length} éligible(s) (enabled+recommended)`,
    );
  }

  const floorOk =
    ladder.TASK_CLASS_HARD_FLOOR.client_audit === "premium" &&
    ladder.TASK_CLASS_TARGET.client_audit === "premium";
  check(
    "ROUTAGE",
    "plancher client_audit",
    floorOk ? "ok" : "crit",
    floorOk
      ? "premium obligatoire"
      : "PLANCHER CASSÉ — l'audit client devient rétrogradable",
  );

  // Observability B0: the in-memory cost snapshot must be readable and labelled
  // as estimated/in-memory (no persistence, no live runtime dependency).
  const snapshot = ladder.getCostLadderSnapshot();
  const snapshotOk =
    !!snapshot &&
    snapshot.basis === "estimated/in-memory only" &&
    typeof snapshot.totalEvents === "number";
  check(
    "ROUTAGE",
    "cost ladder snapshot",
    snapshotOk ? "ok" : "warn",
    snapshotOk
      ? `lisible — ${snapshot.totalEvents} event(s) observé(s), coûts estimés/in-memory (aucune persistance)`
      : "snapshot illisible ou non étiqueté estimé/in-memory",
  );
} catch (error) {
  check("ROUTAGE", "cost ladder", "warn", `analyse impossible: ${error.message}`);
}

// ---------------------------------------------------------------------------
// VERDICT
// ---------------------------------------------------------------------------
const crits = results.filter((r) => r.level === "crit");
const warns = results.filter((r) => r.level === "warn");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ verdict: crits.length === 0 ? "GO" : "CRITIQUE", results }, null, 2));
} else {
  console.log("\n══════════ HQ DOCTOR — Système Immunitaire ══════════\n");
  let lastOrgan = "";
  for (const r of results) {
    if (r.organ !== lastOrgan) {
      console.log(`  ${r.organ}`);
      lastOrgan = r.organ;
    }
    const icon = r.level === "ok" ? "✅" : r.level === "warn" ? "⚠️ " : "🛑";
    console.log(`    ${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log("\n──────────────────────────────────────────────────────");
  if (crits.length === 0) {
    console.log(`  VERDICT : INTÈGRE — GO  (${warns.length} avertissement(s) nommé(s))`);
  } else {
    console.log(`  VERDICT : 🛑 CRITIQUE — ${crits.length} organe(s) en échec :`);
    for (const c of crits) console.log(`    • [${c.organ}] ${c.name} — ${c.detail}`);
  }
  console.log("──────────────────────────────────────────────────────\n");
}

process.exit(crits.length === 0 ? 0 : 1);
