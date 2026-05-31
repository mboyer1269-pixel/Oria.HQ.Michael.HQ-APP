#!/usr/bin/env node

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

const { detectIntent } = await jiti.import(path.join(projectRoot, "src/server/joris/detect-intent.ts"));

const calendarBookingCases = [
  { message: "je veux un rendez-vous", expected: "calendar.book" },
  { message: "prendre rendez-vous demain", expected: "calendar.book" },
  { message: "Book RDV demain 10h00", expected: "calendar.book" },
  { message: "planifie deux rdvs cette semaine", expected: "calendar.book" },
  { message: "bookez-moi mardi prochain", expected: "calendar.book" },
  { message: "bookons quelque chose demain", expected: "calendar.book" },
  { message: "je veux booker demain", expected: "calendar.book" },
  { message: "prends rendez vous mardi", expected: "calendar.book" },
  { message: "pas de rendez-vous mardi, book un rdv jeudi", expected: "calendar.book" },
  { message: "pas de rdv demain, prends rendez-vous vendredi", expected: "calendar.book" },
  {
    message: "aucun rendez-vous cette semaine, mais bookez-moi mardi prochain",
    expected: "calendar.book",
  },
  { message: "sans rendez-vous aujourd'hui, bookons quelque chose demain", expected: "calendar.book" },
  { message: "pas de rdv aujourd'hui, mais je veux booker demain", expected: "calendar.book" },
  { message: "aucun rendez vous lundi, prends un rdv mardi", expected: "calendar.book" },
  { message: "pas de rendez-vous", expected: "chat" },
  { message: "aucun rendez-vous", expected: "chat" },
  { message: "je ne veux pas de rendez-vous", expected: "chat" },
  { message: "sans rendez-vous", expected: "chat" },
  { message: "pas de rdv", expected: "chat" },
  { message: "aucun rdv", expected: "chat" },
];

for (const { message, expected } of calendarBookingCases) {
  test(`detectIntent(${JSON.stringify(message)}) -> ${expected}`, () => {
    assert.equal(detectIntent(message), expected);
  });
}

const priorityAndAccentCases = [
  { message: "planifie la mission de lancement", expected: "mission.plan" },
  { message: "book un rdv et planifie la mission demain", expected: "mission.plan" },
  { message: "rapport d'audit de gouvernance", expected: "governance.audit" },
  { message: "historique des décisions de gouvernance", expected: "governance.audit" },
  { message: "audit gouvernance", expected: "governance.audit" },
  { message: "résumé avec audit de gouvernance", expected: "governance.audit" },
  { message: "Prépare le comité pour demain", expected: "board.consult" },
  { message: "consulte le comité Hormozi", expected: "board.consult" },
  { message: "consulte le board", expected: "board.consult" },
  { message: "Nouvelle opportunité à scorer", expected: "opportunity.score" },
  { message: "score cette opportunité business", expected: "opportunity.score" },
  { message: "Donne-moi un résumé de la semaine", expected: "brief.generate" },
  { message: "fais-moi un résumé", expected: "brief.generate" },
  { message: "mission planifie la relance", expected: "mission.plan" },
  { message: "Quelle est la priorité du jour?", expected: "brief.generate" },
  { message: "génère un résumé avec priorité haute", expected: "brief.generate" },
];

for (const { message, expected } of priorityAndAccentCases) {
  test(`detectIntent priority/accent ${JSON.stringify(message)} -> ${expected}`, () => {
    assert.equal(detectIntent(message), expected);
  });
}
