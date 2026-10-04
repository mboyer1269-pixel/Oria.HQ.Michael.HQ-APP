/**
 * Preuve réelle d'admission de mission de développement via CLI contre PostgreSQL & PostgREST.
 *
 * Ce harnais est conçu pour s'exécuter contre un vrai moteur PostgreSQL et une vraie passerelle PostgREST
 * (orchestrés via Docker ou processus locaux dédiés par proofs/run-intake-real-db.sh).
 *
 * Il n'utilise AUCUN mock ni simulateur en mémoire.
 * Il invoque le vrai CLI (src/scripts/development-mission.mjs) via des processus séparés,
 * avec des configurations protégées (0o600 dans répertoire 0o700) et des variables d'environnement purgées.
 *
 * Épreuves couvertes :
 * 1. Admission nominale initiale : statut 'saved', missionStatus 'draft', executionRequested false.
 * 2. Concurrence simultanée sur payload divergent : deux processus CLI lancés simultanément sur le même requestId
 *    avec des contenus différents (exactement un gagne avec statut 'saved' / code 0, l'autre échoue avec 'conflict' / code 3).
 * 3. Refus de workspace falsifié (code 3, invalid_request) et étanchéité inter-workspace (lookup = not_found).
 * 4. Perte réelle de réponse après commit HTTP : coupure socket après confirmation 201 par PostgREST (outcome_unknown),
 *    suivi d'un lookup CLI prouvant la récupération sans doublon en base, corroboré par retry idempotent.
 * 5. Vérification après redémarrage (persistence check) par un client neuf si le flag --verify-restart est fourni.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const ROOT = process.env.HQ_ROOT || process.cwd();
const CLI_PATH = path.join(ROOT, "src/scripts/development-mission.mjs");
const WINNER_STATE_FILE =
  process.env.WINNER_STATE_FILE ||
  path.join(ROOT, "proofs/.last-winner-state.json");

// PostgREST URL : port dynamique depuis l'environnement POSTGREST_DIRECT_URL ou argv
const targetPostgrestUrl =
  process.env.POSTGREST_DIRECT_URL ||
  process.argv.find((arg) => arg.startsWith("http")) ||
  "http://127.0.0.1:3000";

/**
 * Calcul du hash de payload identique à celui calculé par le service de développement.
 */
function computePayloadHash(req, context) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        req.title,
        req.objective,
        req.scope,
        req.acceptanceCriteria,
        context.modeId,
        context.actorId,
      ])
    )
    .digest("hex");
}

/**
 * Lecture directe de la ligne persistée en base via PostgREST, scopée à workspace_id et id.
 */
async function fetchPersistedMission(workspaceId, missionId) {
  const url = `${targetPostgrestUrl}/missions?id=eq.${encodeURIComponent(missionId)}&workspace_id=eq.${encodeURIComponent(workspaceId)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Erreur lecture PostgREST pour mission ${missionId}: HTTP ${res.status}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

let dropNextPostResponse = false;
let droppedResponseCount = 0;

// Passerelle proxy locale relayant /rest/v1 vers la racine PostgREST direct
// Permet également l'injection d'une rupture réseau post-commit contrôlée
const gateway = createServer(async (req, res) => {
  try {
    if (!req.url.startsWith("/rest/v1/")) {
      res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.authorization;
    delete headers.apikey;
    delete headers.host;
    delete headers["content-length"];

    const forwardUrl = targetPostgrestUrl + req.url.slice("/rest/v1".length);
    const response = await fetch(forwardUrl, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    const resBody = Buffer.from(await response.arrayBuffer());

    // Simulation de rupture réseau post-commit : PostgREST a validé l'insertion en base (201/200),
    // mais le socket vers le client est brutalement réinitialisé avant que la réponse ne lui parvienne.
    if (dropNextPostResponse && req.method === "POST" && (response.status === 201 || response.status === 200)) {
      dropNextPostResponse = false;
      droppedResponseCount++;
      req.socket.destroy();
      return;
    }

    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(resBody);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "bad_gateway", detail: String(err) }));
  }
});

await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
const gatewayPort = gateway.address().port;
const supabaseUrl = `http://127.0.0.1:${gatewayPort}`;

// Configuration protégée (permissions 0o600 dans répertoire 0o700)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oria-intake-real-db-"));
fs.chmodSync(tempDir, 0o700);

const CONTEXT_A = { workspaceId: "synthetic-ws-a", modeId: "hq", actorId: "operator-synthetic" };
const configFileA = path.join(tempDir, "config-a.json");
fs.writeFileSync(configFileA, JSON.stringify({ context: CONTEXT_A }), { mode: 0o600 });

const CONTEXT_B = { workspaceId: "synthetic-ws-b", modeId: "hq", actorId: "operator-synthetic" };
const configFileB = path.join(tempDir, "config-b.json");
fs.writeFileSync(configFileB, JSON.stringify({ context: CONTEXT_B }), { mode: 0o600 });

function execCli(configFile, requestPayload) {
  return new Promise((resolve, reject) => {
    // Environnement minimal autorisé : liste blanche stricte, aucun secret/clé/token hérité
    const cleanEnv = {
      PATH: process.env.PATH || "",
      LANG: process.env.LANG || "en_US.UTF-8",
      HOME: tempDir,
      TMPDIR: tempDir,
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: "synthetic-disposable-qualification-key",
      MISSION_DURABLE_DRAFTS: "1",
      HQ_ROOT: ROOT,
    };

    const child = spawn(process.execPath, [CLI_PATH, configFile], {
      env: cleanEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      let parsed = null;
      try { parsed = JSON.parse(stdout.trim()); } catch {}
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), parsed });
    });

    child.stdin.write(JSON.stringify(requestPayload));
    child.stdin.end();
  });
}

const REQUEST_1 = {
  requestId: "11111111-1111-4111-8111-111111111111",
  title: "Mission 1 : Surveillance et intégrité snapshot",
  objective: "Écrire un module de vérification d'intégrité avec tests unitaires sans écriture prod.",
  scope: "src/features/monitoring/snapshot-monitor.ts",
  acceptanceCriteria: "Tests unitaires 100% passés, preuve scellée au ledger.",
};

const CONCURRENT_REQ_ID = "22222222-2222-4222-8222-222222222222";
const PAYLOAD_2A = {
  requestId: CONCURRENT_REQ_ID,
  title: "Mission 2A : Audit de conformité des flux d'admission",
  objective: "Auditer l'ensemble des flux d'admission en base réelle.",
  scope: "src/features/audit/flow.ts",
  acceptanceCriteria: "Zéro anomalie de schéma constatée.",
};
const PAYLOAD_2B = {
  requestId: CONCURRENT_REQ_ID,
  title: "Mission 2B : Titre divergent concurrentiel simultané",
  objective: "Tentative d'écrasement simultanée avec un payload divergeant.",
  scope: "src/features/divergent/hack.ts",
  acceptanceCriteria: "Doit être rejeté en conflit.",
};

const SAME_REQ = {
  requestId: "44444444-4444-4444-8444-444444444444",
  title: "Mission 4 : Concurrence simultanée sur payload identique",
  objective: "Prouver l'idempotence et la déduplication parfaite sous concurrence réelle.",
  scope: "src/features/concurrency/idempotence.ts",
  acceptanceCriteria: "Exactement 1 mission enregistrée, deux retours saved identiques.",
};

const LOST_REQ = {
  requestId: "33333333-3333-4333-8333-333333333333",
  title: "Mission 3 : Résilience coupure réseau post-commit",
  objective: "Prouver la recouvrabilité après rupture de flux réseau post-commit.",
  scope: "src/features/network/recovery.ts",
  acceptanceCriteria: "Recouvrable à l'identique par lookup sans duplicata.",
};

const isRestartVerification = process.argv.includes("--verify-restart");

try {
  if (isRestartVerification) {
    console.log("=== VÉRIFICATION DE LA PERSISTANCE APRÈS REDÉMARRAGE (CLIENT NEUF) ===");

    assert.ok(fs.existsSync(WINNER_STATE_FILE), `Fichier d'état du gagnant introuvable (${WINNER_STATE_FILE})`);
    const recordedWinner = JSON.parse(fs.readFileSync(WINNER_STATE_FILE, "utf8"));

    // Lookup 1 : Mission initiale (Reçu CLI runtime + vérification PostgREST/SQL)
    const rPersist1 = await execCli(configFileA, { operation: "lookup", requestId: REQUEST_1.requestId });
    assert.equal(rPersist1.code, 0, `Lookup 1 après redémarrage a échoué (code ${rPersist1.code})`);
    assert.equal(rPersist1.parsed?.status, "saved");
    assert.equal(rPersist1.parsed?.missionStatus, "draft");
    assert.equal(rPersist1.parsed?.title, REQUEST_1.title);
    assert.equal(rPersist1.parsed?.executionRequested, false);

    const row1 = await fetchPersistedMission(CONTEXT_A.workspaceId, rPersist1.parsed?.missionId);
    assert.ok(row1, "Mission 1 physique persistante après redémarrage");
    assert.equal(row1.title, REQUEST_1.title);
    assert.equal(row1.objective, REQUEST_1.objective);
    assert.equal(row1.input?.development?.scope, REQUEST_1.scope);
    assert.equal(row1.input?.development?.acceptanceCriteria, REQUEST_1.acceptanceCriteria);
    assert.equal(row1.input?.development?.payloadHash, computePayloadHash(REQUEST_1, CONTEXT_A));

    // Lookup 2 : Mission concurrente (reliée STRICTEMENT au gagnant enregistré avant redémarrage)
    const rPersist2 = await execCli(configFileA, { operation: "lookup", requestId: CONCURRENT_REQ_ID });
    assert.equal(rPersist2.code, 0, `Lookup 2 après redémarrage a échoué (code ${rPersist2.code})`);
    assert.equal(rPersist2.parsed?.status, "saved");
    assert.equal(rPersist2.parsed?.missionStatus, "draft");
    assert.equal(rPersist2.parsed?.executionRequested, false);
    assert.equal(rPersist2.parsed?.missionId, recordedWinner.missionId, "Le missionId conservé doit être exactement celui du gagnant enregistré");
    assert.equal(rPersist2.parsed?.title, recordedWinner.payload.title, "Le titre conservé doit être exactement celui du gagnant enregistré");

    const row2 = await fetchPersistedMission(CONTEXT_A.workspaceId, recordedWinner.missionId);
    assert.ok(row2, "Mission concurrente physique persistante après redémarrage");
    assert.equal(row2.title, recordedWinner.payload.title);
    assert.equal(row2.objective, recordedWinner.payload.objective);
    assert.equal(row2.input?.development?.scope, recordedWinner.payload.scope);
    assert.equal(row2.input?.development?.acceptanceCriteria, recordedWinner.payload.acceptanceCriteria);
    assert.equal(row2.input?.development?.payloadHash, recordedWinner.payloadHash);

    // Lookup 2-bis : Mission concurrence payload identique
    const rPersistSame = await execCli(configFileA, { operation: "lookup", requestId: SAME_REQ.requestId });
    assert.equal(rPersistSame.code, 0, `Lookup même payload après redémarrage a échoué (code ${rPersistSame.code})`);
    assert.equal(rPersistSame.parsed?.status, "saved");
    assert.equal(rPersistSame.parsed?.missionStatus, "draft");
    assert.equal(rPersistSame.parsed?.title, SAME_REQ.title);
    assert.equal(rPersistSame.parsed?.executionRequested, false);

    const rowSame = await fetchPersistedMission(CONTEXT_A.workspaceId, rPersistSame.parsed?.missionId);
    assert.ok(rowSame, "Mission même payload physique persistante après redémarrage");
    assert.equal(rowSame.title, SAME_REQ.title);
    assert.equal(rowSame.objective, SAME_REQ.objective);
    assert.equal(rowSame.input?.development?.scope, SAME_REQ.scope);
    assert.equal(rowSame.input?.development?.acceptanceCriteria, SAME_REQ.acceptanceCriteria);
    assert.equal(rowSame.input?.development?.payloadHash, computePayloadHash(SAME_REQ, CONTEXT_A));

    // Lookup 3 : Mission issue de la coupure réseau post-commit
    const rPersist3 = await execCli(configFileA, { operation: "lookup", requestId: LOST_REQ.requestId });
    assert.equal(rPersist3.code, 0, `Lookup 3 après redémarrage a échoué (code ${rPersist3.code})`);
    assert.equal(rPersist3.parsed?.status, "saved");
    assert.equal(rPersist3.parsed?.missionStatus, "draft");
    assert.equal(rPersist3.parsed?.title, LOST_REQ.title);
    assert.equal(rPersist3.parsed?.executionRequested, false);

    const row3 = await fetchPersistedMission(CONTEXT_A.workspaceId, rPersist3.parsed?.missionId);
    assert.ok(row3, "Mission coupure réseau physique persistante après redémarrage");
    assert.equal(row3.title, LOST_REQ.title);
    assert.equal(row3.objective, LOST_REQ.objective);
    assert.equal(row3.input?.development?.scope, LOST_REQ.scope);
    assert.equal(row3.input?.development?.acceptanceCriteria, LOST_REQ.acceptanceCriteria);
    assert.equal(row3.input?.development?.payloadHash, computePayloadHash(LOST_REQ, CONTEXT_A));

    // Nettoyage de l'état enregistré
    try {
      if (fs.existsSync(WINNER_STATE_FILE)) {
        fs.unlinkSync(WINNER_STATE_FILE);
      }
    } catch {}

    console.log("✔ Succès : Les 4 missions créées avant redémarrage sont intactes avec leur contenu exact (vérifié via PostgREST/SQL) et immédiatement lisibles par un client neuf.");
  } else {
    console.log("=== EXÉCUTION DU HARNAIS RÉEL CLI → VRAI SERVICE → POSTGRESQL/POSTGREST ===");

    // ── 1. Admission nominale initiale ──
    const r1 = await execCli(configFileA, { operation: "create", request: REQUEST_1 });
    assert.equal(r1.code, 0, `Échec admission initiale : ${r1.stderr}`);
    assert.equal(r1.parsed?.status, "saved");
    assert.equal(r1.parsed?.missionStatus, "draft");
    assert.equal(r1.parsed?.title, REQUEST_1.title);
    assert.equal(r1.parsed?.executionRequested, false);

    const row1 = await fetchPersistedMission(CONTEXT_A.workspaceId, r1.parsed?.missionId);
    assert.ok(row1, "Mission 1 physique persistée dans PostgREST");
    assert.equal(row1.title, REQUEST_1.title);
    assert.equal(row1.objective, REQUEST_1.objective);
    assert.equal(row1.input?.development?.scope, REQUEST_1.scope);
    assert.equal(row1.input?.development?.acceptanceCriteria, REQUEST_1.acceptanceCriteria);
    assert.equal(row1.input?.development?.payloadHash, computePayloadHash(REQUEST_1, CONTEXT_A));
    console.log("✔ Preuve 1 : Admission initiale réussie en base réelle (status=saved, draft, executionRequested=false, contenu PostgREST validé)");

    // ── 2. Concurrence sur payload divergent (Deux processus CLI simultanés) ──
    // Deux requêtes simultanées avec le même requestId mais des contenus divergents.
    // Exactement un doit s'enregistrer (code 0, saved), l'autre doit échouer en conflit (code 3, conflict).
    const [procA, procB] = await Promise.all([
      execCli(configFileA, { operation: "create", request: PAYLOAD_2A }),
      execCli(configFileA, { operation: "create", request: PAYLOAD_2B }),
    ]);
    const codes = [procA.code, procB.code].sort();
    assert.deepEqual(codes, [0, 3], `Concurrence divergente : exactement un gagnant (0) et un conflit (3) attendus, obtenu ${JSON.stringify(codes)}`);
    const winner = procA.code === 0 ? procA : procB;
    const loser = procA.code === 3 ? procA : procB;
    const winnerKey = procA.code === 0 ? "2A" : "2B";
    const winnerPayload = procA.code === 0 ? PAYLOAD_2A : PAYLOAD_2B;
    const loserPayload = procA.code === 0 ? PAYLOAD_2B : PAYLOAD_2A;
    const winnerHash = computePayloadHash(winnerPayload, CONTEXT_A);

    assert.equal(winner.parsed?.status, "saved");
    assert.equal(winner.parsed?.missionStatus, "draft");
    assert.equal(winner.parsed?.executionRequested, false);
    assert.equal(winner.parsed?.title, winnerPayload.title);
    assert.equal(loser.parsed?.status, "conflict");

    // Enregistrer le gagnant exact dans un fichier d'état pour vérification post-restart
    fs.writeFileSync(
      WINNER_STATE_FILE,
      JSON.stringify(
        {
          requestId: CONCURRENT_REQ_ID,
          missionId: winner.parsed?.missionId,
          winnerKey,
          payload: winnerPayload,
          payloadHash: winnerHash,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );

    // Vérification par lookup CLI : contrat de reçu DevelopmentReceipt respecté
    const rLookupWinner = await execCli(configFileA, { operation: "lookup", requestId: CONCURRENT_REQ_ID });
    assert.equal(rLookupWinner.code, 0);
    assert.equal(rLookupWinner.parsed?.status, "saved");
    assert.equal(rLookupWinner.parsed?.missionId, winner.parsed?.missionId);
    assert.equal(rLookupWinner.parsed?.title, winnerPayload.title);
    assert.notEqual(rLookupWinner.parsed?.title, loserPayload.title);
    assert.equal(rLookupWinner.parsed?.executionRequested, false);

    // Vérification approfondie des champs persistés en base physique via PostgREST
    const persistedWinner = await fetchPersistedMission(CONTEXT_A.workspaceId, winner.parsed?.missionId);
    assert.ok(persistedWinner, "La mission gagnante doit être présente dans la table physique missions");
    assert.equal(persistedWinner.title, winnerPayload.title);
    assert.equal(persistedWinner.objective, winnerPayload.objective);
    assert.equal(persistedWinner.input?.development?.scope, winnerPayload.scope);
    assert.equal(persistedWinner.input?.development?.acceptanceCriteria, winnerPayload.acceptanceCriteria);
    assert.equal(persistedWinner.input?.development?.payloadHash, winnerHash);
    assert.notEqual(persistedWinner.input?.development?.payloadHash, computePayloadHash(loserPayload, CONTEXT_A));
    console.log("✔ Preuve 2 : Concurrence simultanée sur payload divergent gérée avec succès (1 gagnant saved avec contenu/hash persistés vérifiés, 1 conflit code 3)");

    // ── 2-bis. Concurrence simultanée sur payload identique (Idempotence stricte) ──
    const [procSame1, procSame2] = await Promise.all([
      execCli(configFileA, { operation: "create", request: SAME_REQ }),
      execCli(configFileA, { operation: "create", request: SAME_REQ }),
    ]);
    assert.equal(procSame1.code, 0, `Échec même payload simultané 1 : ${procSame1.stderr}`);
    assert.equal(procSame2.code, 0, `Échec même payload simultané 2 : ${procSame2.stderr}`);
    assert.equal(procSame1.parsed?.status, "saved");
    assert.equal(procSame2.parsed?.status, "saved");
    assert.equal(procSame1.parsed?.missionId, procSame2.parsed?.missionId, "Les deux requêtes simultanées doivent retourner le même missionId");
    assert.equal(procSame1.parsed?.title, SAME_REQ.title);
    assert.equal(procSame2.parsed?.title, SAME_REQ.title);
    assert.equal(procSame1.parsed?.missionStatus, "draft");
    assert.equal(procSame2.parsed?.missionStatus, "draft");
    assert.equal(procSame1.parsed?.executionRequested, false);
    assert.equal(procSame2.parsed?.executionRequested, false);

    const rLookupSame = await execCli(configFileA, { operation: "lookup", requestId: SAME_REQ.requestId });
    assert.equal(rLookupSame.code, 0);
    assert.equal(rLookupSame.parsed?.status, "saved");
    assert.equal(rLookupSame.parsed?.missionId, procSame1.parsed?.missionId);
    assert.equal(rLookupSame.parsed?.title, SAME_REQ.title);

    const persistedSame = await fetchPersistedMission(CONTEXT_A.workspaceId, procSame1.parsed?.missionId);
    assert.ok(persistedSame, "Mission payload identique persistée dans PostgREST");
    assert.equal(persistedSame.title, SAME_REQ.title);
    assert.equal(persistedSame.objective, SAME_REQ.objective);
    assert.equal(persistedSame.input?.development?.scope, SAME_REQ.scope);
    assert.equal(persistedSame.input?.development?.acceptanceCriteria, SAME_REQ.acceptanceCriteria);
    assert.equal(persistedSame.input?.development?.payloadHash, computePayloadHash(SAME_REQ, CONTEXT_A));
    console.log("✔ Preuve 2-bis : Deux créations simultanées avec le même payload dédupliquées à l'identique (même missionId, status=saved, contenu persisté vérifié)");

    // ── 3. Refus de workspace falsifié et étanchéité inter-workspace ──
    const rMismatch = await execCli(configFileA, {
      operation: "create",
      request: REQUEST_1,
      workspaceId: "rogue-workspace",
    });
    assert.equal(rMismatch.code, 3, "Mismatch de workspace rejeté avec code 3 (invalid_request)");
    assert.equal(rMismatch.parsed?.status, "invalid_request");

    const rForeignLookup = await execCli(configFileB, {
      operation: "lookup",
      requestId: REQUEST_1.requestId,
    });
    assert.equal(rForeignLookup.code, 0);
    assert.equal(rForeignLookup.parsed?.status, "not_found", "Isolation stricte entre workspaces");
    console.log("✔ Preuve 3 : Workspace falsifié rejeté (code 3, invalid_request) et étanchéité inter-workspace garantie (lookup not_found)");

    // ── 4. Perte réelle de réponse après commit & Récupération par lookup ──
    // Le proxy local coupe brutalement la connexion socket après réception du HTTP 201/200 de PostgREST.
    dropNextPostResponse = true;
    const rLost = await execCli(configFileA, { operation: "create", request: LOST_REQ });
    assert.equal(rLost.code, 2, `La coupure post-commit doit sortir en code 2 outcome_unknown (reçu ${rLost.code})`);
    assert.equal(rLost.parsed?.status, "outcome_unknown", "Le statut retourné au client doit être outcome_unknown");
    assert.equal(droppedResponseCount, 1, "La rupture de communication a bien eu lieu après l'écriture en base");

    // Récupération par lookup CLI : prouve que la mission a bien été inscrite en base malgré la rupture de socket
    const rRecover = await execCli(configFileA, { operation: "lookup", requestId: LOST_REQ.requestId });
    assert.equal(rRecover.code, 0, `Le lookup de récupération a échoué (code ${rRecover.code})`);
    assert.equal(rRecover.parsed?.status, "saved");
    assert.equal(rRecover.parsed?.title, LOST_REQ.title);
    assert.equal(rRecover.parsed?.missionStatus, "draft");
    assert.equal(rRecover.parsed?.executionRequested, false);

    const persistedLost = await fetchPersistedMission(CONTEXT_A.workspaceId, rRecover.parsed?.missionId);
    assert.ok(persistedLost, "Mission coupure réseau persistée dans PostgREST");
    assert.equal(persistedLost.title, LOST_REQ.title);
    assert.equal(persistedLost.objective, LOST_REQ.objective);
    assert.equal(persistedLost.input?.development?.scope, LOST_REQ.scope);
    assert.equal(persistedLost.input?.development?.acceptanceCriteria, LOST_REQ.acceptanceCriteria);
    assert.equal(persistedLost.input?.development?.payloadHash, computePayloadHash(LOST_REQ, CONTEXT_A));

    // Nouvelle tentative de création idempotente avec le même payload : doit réussir en no-op et renvoyer la même mission
    const rRetry = await execCli(configFileA, { operation: "create", request: LOST_REQ });
    assert.equal(rRetry.code, 0, `Le retry idempotent a échoué (code ${rRetry.code})`);
    assert.equal(rRetry.parsed?.status, "saved");
    assert.equal(rRetry.parsed?.missionId, rRecover.parsed?.missionId);
    console.log("✔ Preuve 4 : Perte réelle de réponse post-commit récupérée par lookup CLI sans duplication (contenu persisté PostgREST vérifié)");

    console.log("\n=== ÉPREUVES CLI RÉELLES TERMINÉES AVEC SUCCÈS ===");
  }
} finally {
  if (isRestartVerification) {
    try {
      if (fs.existsSync(WINNER_STATE_FILE)) {
        fs.unlinkSync(WINNER_STATE_FILE);
      }
    } catch {}
  }
  gateway.closeAllConnections();
  await new Promise((resolve) => gateway.close(resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
