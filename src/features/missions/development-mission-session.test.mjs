#!/usr/bin/env node

// src/features/missions/development-mission-session.test.mjs
//
// Reprise d'une demande de mission de développement, sur la logique réellement
// exécutée par le formulaire (src/features/missions/development-mission-session.ts).
//
// Le défaut corrigé : après un rechargement, l'identifiant de demande survivait
// dans sessionStorage alors que l'état React repartait de zéro, et le
// formulaire convertissait silencieusement un envoi en `GET` sous l'ancien
// identifiant — puis annonçait « Mission enregistrée » avec l'ancien titre,
// sans qu'aucune écriture ait eu lieu et en perdant la saisie.
//
// Ces tests portent sur les cinq risques nommés : sessionStorage absent ou
// corrompu, double clic, rechargement, workspace différent, et tentative
// réseau à issue inconnue. Aucune requête n'est émise : la décision est pure.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.resolve(__dirname, "..", "..") },
});

const {
  OUTCOME_MESSAGES,
  REFUSAL_MESSAGES,
  RETRYABLE_STATUSES,
  classifyTrackingValue,
  describeReceipt,
  developmentMissionTrackingKey,
  developmentReceiptUrl,
  isResponseApplicable,
  performDevelopmentRequest,
  planIntent,
  requestMethodFor,
} = await jiti.import("./development-mission-session.ts");

const ID_A = "6f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";
const ID_B = "7a2c3d4e-5f60-4b7c-9d8e-1f2a3b4c5d6e";

/** État de départ : rien en cours, suivi exploitable, formulaire rempli. */
const base = {
  tracking: "ok",
  activeRequestId: null,
  pendingRequestId: null,
  releasedRequestId: null,
  hasFrozenPayload: false,
  inputComplete: true,
};

const state = (patch) => ({ ...base, ...patch });

// ---------------------------------------------------------------------------
// Rechargement — le défaut d'origine
// ---------------------------------------------------------------------------

test("après rechargement, un envoi n'est jamais converti en relecture", () => {
  // sessionStorage a gardé l'identifiant, l'état React est reparti de zéro.
  const plan = planIntent(state({ pendingRequestId: ID_A }), "create");

  assert.equal(plan.kind, "refused");
  assert.equal(plan.reason, "resume-decision-required");
  // Le coeur du défaut : aucune requête, et surtout aucun GET.
  assert.equal(requestMethodFor(plan), null);
});

test("le refus de reprise annonce que la saisie n'a pas été envoyée", () => {
  const message = REFUSAL_MESSAGES["resume-decision-required"];
  assert.match(message, /n’a pas été envoyée/);
  // L'opérateur doit lire les deux issues possibles, pas une seule.
  assert.match(message, /reprendre/i);
  assert.match(message, /nouvelle mission/i);
});

test("reprendre explicitement la demande résiduelle émet un GET sur cet identifiant", () => {
  const plan = planIntent(state({ pendingRequestId: ID_A }), "read-pending");

  assert.deepEqual(plan, { kind: "read", requestId: ID_A });
  assert.equal(requestMethodFor(plan), "GET");
  assert.equal(developmentReceiptUrl(ID_A), `/api/missions/development?requestId=${ID_A}`);
});

test("commencer une nouvelle mission après reprise écartée émet un POST, pas un GET", () => {
  // L'opérateur a tranché : la demande précédente est mise de côté.
  const plan = planIntent(state({ pendingRequestId: null, releasedRequestId: ID_A }), "create");

  assert.deepEqual(plan, { kind: "create" });
  assert.equal(requestMethodFor(plan), "POST");
});

test("la demande mise de côté reste relisible : son reçu n'est pas perdu", () => {
  const plan = planIntent(
    state({ activeRequestId: ID_B, releasedRequestId: ID_A }),
    "read-released",
  );

  assert.deepEqual(plan, { kind: "read", requestId: ID_A });
});

// ---------------------------------------------------------------------------
// Reçu relu contre création
// ---------------------------------------------------------------------------

test("un reçu relu et une création ne s'annoncent pas pareil", () => {
  const read = describeReceipt("read", "Ancien titre");
  const created = describeReceipt("created", "Nouveau titre");

  assert.match(read, /relu/);
  assert.match(read, /Aucun envoi, aucune création/);
  assert.notEqual(read, created);
  assert.match(created, /Mission enregistrée/);
  // Une relecture ne doit jamais emprunter le vocabulaire de l'enregistrement.
  assert.ok(!read.includes("Mission enregistrée"));
});

test("un renvoi sous le même identifiant ne prétend pas avoir créé une seconde mission", () => {
  const retried = describeReceipt("retried", "Titre");

  assert.match(retried, /même identifiant/);
  assert.match(retried, /Aucune seconde mission/);
  assert.ok(!retried.includes("Mission enregistrée"));
});

// ---------------------------------------------------------------------------
// Double clic
// ---------------------------------------------------------------------------

test("un second envoi sous une demande déjà active est refusé", () => {
  const plan = planIntent(state({ activeRequestId: ID_A }), "create");

  assert.equal(plan.kind, "refused");
  assert.equal(plan.reason, "submission-already-active");
  assert.equal(requestMethodFor(plan), null);
});

test("un renvoi réutilise l'identifiant actif et la charge déjà figée", () => {
  // Charge figée : la saisie courante n'est plus consultée, donc un renvoi
  // porte exactement la même intention que le premier envoi.
  const plan = planIntent(
    state({ activeRequestId: ID_A, hasFrozenPayload: true, inputComplete: false }),
    "retry",
  );

  assert.deepEqual(plan, { kind: "retry", requestId: ID_A });
  assert.equal(requestMethodFor(plan), "POST");
});

test("un renvoi sans charge figée exige une saisie complète", () => {
  // Cas réel après rechargement : l'identifiant est adopté, le contenu non —
  // il n'est pas conservé. Renvoyer une charge vide serait une écriture fausse.
  const plan = planIntent(
    state({ activeRequestId: ID_A, hasFrozenPayload: false, inputComplete: false }),
    "retry",
  );

  assert.equal(plan.kind, "refused");
  assert.equal(plan.reason, "input-incomplete");
});

test("un renvoi n'est offert que sur les issues qui excluent une écriture", () => {
  assert.deepEqual(RETRYABLE_STATUSES, [
    "not_found",
    "request_denied",
    "invalid_request",
    "disabled",
  ]);
  // Une issue inconnue ne doit pas ouvrir un renvoi : c'est le seul signal qui
  // bloque une relance aveugle.
  assert.ok(!RETRYABLE_STATUSES.includes("outcome_unknown"));
  assert.ok(!RETRYABLE_STATUSES.includes("conflict"));
  assert.ok(!RETRYABLE_STATUSES.includes("unavailable"));
});

// ---------------------------------------------------------------------------
// sessionStorage absent, vide ou corrompu
// ---------------------------------------------------------------------------

test("une valeur stockée absente ou vide ne propose aucune reprise", () => {
  assert.equal(classifyTrackingValue(null), "empty");
  assert.equal(classifyTrackingValue(undefined), "empty");
  assert.equal(classifyTrackingValue(""), "empty");
});

test("une valeur stockée qui n'est pas un identifiant de demande est corrompue", () => {
  for (const value of ["abc", "null", "{}", `${ID_A} `, ID_A.slice(0, -1), "../../etc"]) {
    assert.equal(classifyTrackingValue(value), "corrupt", `valeur: ${JSON.stringify(value)}`);
  }
  assert.equal(classifyTrackingValue(ID_A), "resumable");
  assert.equal(classifyTrackingValue(ID_A.toUpperCase()), "resumable");
});

test("un suivi corrompu bloque toute écriture sans bloquer la relecture connue", () => {
  const creating = planIntent(state({ tracking: "corrupt" }), "create");
  assert.equal(creating.kind, "refused");
  assert.equal(creating.reason, "tracking-corrupt");

  // Aucun identifiant fiable : la relecture n'invente rien non plus.
  const reading = planIntent(state({ tracking: "corrupt" }), "read-active");
  assert.equal(reading.kind, "refused");
  assert.equal(reading.reason, "tracking-corrupt");

  // Mais un identifiant déjà en mémoire reste relisible : un GET n'écrit pas.
  const known = planIntent(state({ tracking: "corrupt", activeRequestId: ID_A }), "read-active");
  assert.deepEqual(known, { kind: "read", requestId: ID_A });
});

test("un sessionStorage indisponible bloque l'écriture et l'annonce", () => {
  const plan = planIntent(state({ tracking: "unavailable" }), "create");

  assert.equal(plan.kind, "refused");
  assert.equal(plan.reason, "tracking-unavailable");
  assert.match(REFUSAL_MESSAGES["tracking-unavailable"], /aucun envoi/i);
  // La saisie n'est pas annoncée perdue : elle reste à l'écran.
  assert.match(REFUSAL_MESSAGES["tracking-unavailable"], /saisie/i);
});

test("sans rien de stocké ni d'actif, vérifier un reçu n'émet aucune requête", () => {
  const plan = planIntent(state({}), "read-active");

  assert.deepEqual(plan, { kind: "read-empty" });
  assert.equal(requestMethodFor(plan), null);
});

// ---------------------------------------------------------------------------
// Workspace différent
// ---------------------------------------------------------------------------

test("le suivi est cloisonné par projet : aucune reprise croisée", () => {
  const a = developmentMissionTrackingKey("michael-hq");
  const b = developmentMissionTrackingKey("autre-workspace");

  assert.notEqual(a, b);
  assert.equal(a, "hq:development-mission:michael-hq");
  // Une clé par projet : la demande de l'un n'est jamais lue sous l'autre.
  assert.ok(!b.includes("michael-hq"));
});

// ---------------------------------------------------------------------------
// Tentative réseau à issue inconnue
// ---------------------------------------------------------------------------

test("une issue inconnue n'est jamais annoncée comme enregistrée", () => {
  const message = OUTCOME_MESSAGES.outcome_unknown;

  assert.ok(!message.includes("enregistrée"));
  assert.match(message, /incertain/i);
  // Ni nouvel identifiant ni renvoi automatique : la relance reste manuelle.
  assert.match(message, /Aucun nouvel identifiant/);
  assert.match(message, /vérifie le reçu/i);
});

test("après une issue inconnue, l'identifiant actif reste relisible", () => {
  // La seule voie de sortie offerte par le plan est la relecture du reçu, pas
  // un nouvel envoi : l'identifiant actif interdit une seconde création.
  const reading = planIntent(state({ activeRequestId: ID_A, hasFrozenPayload: true }), "read-active");
  assert.deepEqual(reading, { kind: "read", requestId: ID_A });

  const creating = planIntent(state({ activeRequestId: ID_A, hasFrozenPayload: true }), "create");
  assert.equal(creating.kind, "refused");
});

test("un envoi sans saisie complète est refusé avant toute requête", () => {
  const plan = planIntent(state({ inputComplete: false }), "create");

  assert.equal(plan.kind, "refused");
  assert.equal(plan.reason, "input-incomplete");
  assert.equal(requestMethodFor(plan), null);
});

test("aucun refus n'émet de requête", () => {
  const intents = ["create", "retry", "read-active", "read-pending", "read-released"];
  const trackings = ["ok", "corrupt", "unavailable"];

  for (const tracking of trackings) {
    for (const intent of intents) {
      for (const inputComplete of [true, false]) {
        const plan = planIntent(state({ tracking, inputComplete }), intent);
        if (plan.kind === "refused" || plan.kind === "read-empty") {
          assert.equal(requestMethodFor(plan), null, `${tracking}/${intent}`);
        }
        // Et jamais de GET issu d'une intention d'écriture.
        if (intent === "create" || intent === "retry") {
          assert.notEqual(requestMethodFor(plan), "GET", `${tracking}/${intent}`);
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Changement de projet pendant une requête en vol
// ---------------------------------------------------------------------------

const PAYLOAD_A = {
  requestId: ID_A,
  title: "Mission A",
  objective: "Objectif A",
  scope: "src/a",
  acceptanceCriteria: "tests A",
};

const savedBody = (title, missionId) => ({
  status: "saved",
  missionId,
  title,
  missionStatus: "draft",
  updatedAt: "2026-10-01T00:00:00.000Z",
  executionRequested: false,
});

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

test("un jeton de requête n'est applicable que sur la même génération et le même projet", () => {
  const issued = { generation: 3, trackingKey: developmentMissionTrackingKey("workspace-a") };

  assert.equal(isResponseApplicable(issued, { ...issued }), true);
  assert.equal(isResponseApplicable(issued, { ...issued, generation: 4 }), false);
  assert.equal(
    isResponseApplicable(issued, {
      ...issued,
      trackingKey: developmentMissionTrackingKey("workspace-b"),
    }),
    false,
  );
});

test("transition A vers B pendant un POST lent : la réponse de A ne s’applique pas dans B", async () => {
  let release;
  const slowFetch = () =>
    new Promise((resolve) => {
      release = () => resolve(okResponse(savedBody("Mission A", "mission-a")));
    });

  // État tel que le composant le tient : génération et clé de suivi du projet A.
  let generation = 1;
  let trackingKey = developmentMissionTrackingKey("workspace-a");
  const issued = { generation, trackingKey };

  const pending = performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: slowFetch,
  });

  // Le projet change pendant l'appel : useEffect incrémente la génération et
  // repart sur une autre clé de suivi.
  generation += 1;
  trackingKey = developmentMissionTrackingKey("workspace-b");

  release();
  const outcome = await pending;

  // La réponse de A existe bel et bien…
  assert.equal(outcome.status, "saved");
  assert.equal(outcome.title, "Mission A");
  // …mais elle n'est pas applicable : aucune mission de A n'est affichée dans B,
  // et aucun router.refresh() n'est déclenché pour B.
  assert.equal(isResponseApplicable(issued, { generation, trackingKey }), false);
});

test("sans changement de projet, la réponse du même envoi s’applique", async () => {
  const trackingKey = developmentMissionTrackingKey("workspace-a");
  const issued = { generation: 1, trackingKey };

  const outcome = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () => okResponse(savedBody("Mission A", "mission-a")),
  });

  assert.equal(outcome.status, "saved");
  assert.equal(isResponseApplicable(issued, { generation: 1, trackingKey }), true);
});

// ---------------------------------------------------------------------------
// Forme de la requête et issues réseau
// ---------------------------------------------------------------------------

test("une relecture émet un GET portant l’identifiant, sans corps", async () => {
  const calls = [];
  await performDevelopmentRequest({
    method: "GET",
    requestId: ID_A,
    payload: null,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return okResponse(savedBody("Titre", "mission-a"));
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, developmentReceiptUrl(ID_A));
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.cache, "no-store");
});

test("un renvoi poste exactement la charge figée, sous le même identifiant", async () => {
  const calls = [];
  await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return okResponse(savedBody("Mission A", "mission-a"));
    },
  });

  assert.equal(calls[0].url, "/api/missions/development");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), PAYLOAD_A);
  assert.equal(JSON.parse(calls[0].init.body).requestId, ID_A);
});

test("une écriture dont l’issue est inconnue ne se présente pas comme un échec propre", async () => {
  const outcome = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () => {
      throw new Error("réseau interrompu");
    },
  });

  assert.deepEqual(outcome, { status: "outcome_unknown" });
});

test("une relecture interrompue est indisponible, pas incertaine", async () => {
  // Une relecture n'écrit rien : son échec ne doit pas fabriquer un doute
  // d'écriture, qui est le seul signal bloquant du parcours.
  const outcome = await performDevelopmentRequest({
    method: "GET",
    requestId: ID_A,
    payload: null,
    fetchImpl: async () => {
      throw new Error("réseau interrompu");
    },
  });

  assert.deepEqual(outcome, { status: "unavailable" });
});

test("un refus d’origine et une requête invalide traversent tels quels", async () => {
  const denied = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ status: "request_denied" }),
    }),
  });
  assert.deepEqual(denied, { status: "request_denied" });

  const invalid = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ status: "invalid_request" }),
    }),
  });
  assert.deepEqual(invalid, { status: "invalid_request" });
});

test("un reçu incomplet ou un statut inconnu ne passe pas pour un enregistrement", async () => {
  const truncated = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () => okResponse({ status: "saved", title: "Mission A" }),
  });
  assert.deepEqual(truncated, { status: "outcome_unknown" });

  const executed = await performDevelopmentRequest({
    method: "POST",
    requestId: ID_A,
    payload: PAYLOAD_A,
    fetchImpl: async () =>
      okResponse({ ...savedBody("Mission A", "mission-a"), executionRequested: true }),
  });
  assert.deepEqual(executed, { status: "outcome_unknown" });

  const unknown = await performDevelopmentRequest({
    method: "GET",
    requestId: ID_A,
    payload: null,
    fetchImpl: async () => okResponse({ status: "launched" }),
  });
  assert.deepEqual(unknown, { status: "unavailable" });
});

test("le formulaire se charge et consomme bien cette logique", async () => {
  // Pas un rendu : un chargement. Il vérifie que le composant corrigé parse,
  // que ses imports résolvent et qu'il expose toujours le même export. Les
  // quatre gates du dépôt (typecheck, lint, build, smoke) restent à exécuter
  // sur la branche d'intégration — ce test ne les remplace pas.
  const componentJiti = createJiti(import.meta.url, {
    jsx: true,
    alias: {
      "@": path.resolve(__dirname, "..", ".."),
      "next/navigation": path.join(__dirname, "..", "..", "__server-only-noop.js"),
    },
  });

  const mod = await componentJiti.import("./components/development-mission-form.tsx");
  assert.equal(typeof mod.DevelopmentMissionForm, "function");
});

test("chaque refus possible porte un message", () => {
  for (const reason of [
    "tracking-unavailable",
    "tracking-corrupt",
    "resume-decision-required",
    "submission-already-active",
    "input-incomplete",
    "nothing-to-resume",
  ]) {
    assert.equal(typeof REFUSAL_MESSAGES[reason], "string");
    assert.ok(REFUSAL_MESSAGES[reason].length > 0, reason);
  }
});
