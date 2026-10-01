#!/usr/bin/env node

// src/server/auth/owner-api-session-guard.test.mjs
//
// La barrière propriétaire des Route Handlers (`requireOwnerApiSession`) honore
// un point d'injection de test posé sur `globalThis`. Il était consulté AVANT
// toute vérification de session et SANS garde d'environnement : la propriété
// présente valait « autorisé » partout, production comprise.
//
// Ce test fixe la garde : hors production la dérivation reste disponible pour
// les suites existantes ; en production elle n'est pas lue, et la vraie
// barrière de session répond.
//
// Portée honnête : il s'agit de défense en profondeur. Aucun module de
// production ne pose cette propriété aujourd'hui, et poser une propriété sur
// `globalThis` côté serveur suppose déjà d'exécuter du code dans le processus.
// Ce n'est pas la démonstration d'une exploitation distante.
//
// NODE_ENV est basculé au moment de l'APPEL, jamais à l'import : server-env.ts
// échoue volontairement au chargement sous NODE_ENV=production sans
// identifiants réels, et la garde testée est à l'intérieur de la fonction.
// Note : dans un bundle Next de production, `process.env.NODE_ENV` est inliné,
// donc la branche est éliminée à la compilation — strictement plus fort que ce
// que ce test mesure au runtime.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectSrc = path.resolve(__dirname, "..", "..");

// Aucun client Supabase, aucune identité réelle, aucun secret : la résolution
// de session renvoie null, donc la vraie barrière répond 401.
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const initialNodeEnv = process.env.NODE_ENV;

// Même stub `server-only` que les suites existantes (paperclip-read.test.mjs).
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": projectSrc,
    "server-only": path.join(projectSrc, "__server-only-noop.js"),
  },
});
const { requireOwnerApiSession } = await jiti.import("./owner.ts");

/** Pose la propriété exactement comme le font les suites du dépôt. */
function withHook(value, run) {
  globalThis.__ownerApiSessionTestResult = value;
  try {
    return run();
  } finally {
    delete globalThis.__ownerApiSessionTestResult;
  }
}

async function callUnder(nodeEnv, run) {
  process.env.NODE_ENV = nodeEnv;
  try {
    return await run();
  } finally {
    // Réassigner `undefined` écrirait la chaîne "undefined" dans l'environnement.
    if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialNodeEnv;
  }
}

test("hors production, la dérivation de test reste honorée", async () => {
  const result = await callUnder("development", () =>
    withHook(null, () => requireOwnerApiSession()),
  );

  // null = autorisé : c'est le contrat dont dépendent les suites existantes.
  assert.equal(result, null);
});

test("en production, la dérivation ne court-circuite pas la barrière", async () => {
  const result = await callUnder("production", () =>
    withHook(null, () => requireOwnerApiSession()),
  );

  assert.notEqual(result, null, "la propriété globale a franchi la barrière en production");
  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { error: "Authentification requise." });
});

test("en production, une dérivation posée à undefined ne franchit pas la barrière", async () => {
  // `hasOwnProperty` était vrai et `?? null` ramenait « autorisé » : le même
  // contournement sans même fournir de valeur.
  const result = await callUnder("production", () =>
    withHook(undefined, () => requireOwnerApiSession()),
  );

  assert.notEqual(result, null);
  assert.equal(result.status, 401);
});

test("en production, une réponse imposée par la dérivation est ignorée", async () => {
  // Une dérivation qui imposerait un 200 arbitraire ne doit pas être lue.
  const forged = { status: 200, json: async () => ({ error: "forged" }) };
  const result = await callUnder("production", () =>
    withHook(forged, () => requireOwnerApiSession()),
  );

  assert.notEqual(result, forged);
  assert.equal(result.status, 401);
});

test("sans dérivation, la barrière répond pareil dans les deux environnements", async () => {
  delete globalThis.__ownerApiSessionTestResult;

  const dev = await callUnder("development", () => requireOwnerApiSession());
  const prod = await callUnder("production", () => requireOwnerApiSession());

  assert.equal(dev.status, 401);
  assert.equal(prod.status, 401);
});

test("la propriété est restaurée proprement entre les cas", () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(globalThis, "__ownerApiSessionTestResult"),
    false,
  );
  assert.equal(process.env.NODE_ENV, initialNodeEnv);
});
