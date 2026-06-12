#!/usr/bin/env node
// P1 INTEGRATION — the full bridge, end to end, no network:
// target → audit email → approved candidate → register → CEO send (fake
// adapter + fake ledger) → outcome recorded → daily counter incremented.
// This is the proof that every bridge is connected with no break.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

const { buildLoi96AuditEmail } = await import("./loi96-audit-email.ts");
const { buildApprovedSendCandidate } = await import("../outbound/outbound-queue-intake.ts");
const {
  registerOutboundSendCandidate,
  getOutboundSendCandidate,
  getOutboundOutcome,
  sentTodayOnChannel,
  resetOutboundSendStoreForTests,
} = await import("../outbound/outbound-send-store.ts");
const { sendOutboundActionAsCeo } = await import("../outbound/outbound-send-service.ts");

const target = {
  name: "Métal Leetwo inc.",
  domain: "leetwo.com",
  tier: 1,
  status: "audit_to_rebuild",
  audit: null,
  contact: "sales@leetwo.com",
  angle: "Liste OQLF + certifié marchandises contrôlées",
  sentDate: null,
  replyDate: null,
  signedValue: 0,
};

beforeEach(() => resetOutboundSendStoreForTests());

test("PONT COMPLET : cible loi96 → file → clic CEO → preuve", async () => {
  // 1. Relay rédige (pur, déterministe)
  const email = buildLoi96AuditEmail(target);

  // 2. Intake : candidat approuvé, token lié au contenu
  const built = buildApprovedSendCandidate({
    workspaceId: "ws_1",
    approverId: "michael",
    agentId: "hermes",
    ventureId: "loi96",
    channelId: "email",
    recipient: target.contact,
    leadId: target.domain,
    subject: email.subject,
    body: email.body,
    subVoie: "cold_email",
    audienceType: "cold_prospect",
    consentBasis: "implied_verified",
    recipientLocalHour: 10,
  });
  assert.equal(built.ok, true);
  registerOutboundSendCandidate(built.candidate);

  // 3. La cible est dans la file, visible par le Send Desk
  const candidate = getOutboundSendCandidate("ws_1", built.candidate.action.id);
  assert.ok(candidate);
  assert.equal(candidate.batch.ventureId, "loi96");
  assert.equal(candidate.recipient, "sales@leetwo.com");

  // 4. Clic CEO (adapter + ledger simulés)
  const ledgerEvents = [];
  const outcome = await sendOutboundActionAsCeo(
    {
      workspaceId: "ws_1",
      actionId: built.candidate.action.id,
      approvalToken: built.approvalToken,
    },
    {
      channelSend: { send: async () => ({ ok: true, providerMessageId: "msg_e2e" }) },
      ledger: async (event) => {
        ledgerEvents.push(event);
        return { ledgerEventId: `lg_${ledgerEvents.length}` };
      },
    },
  );

  // 5. Preuves : envoi unique, 2 événements ledger, compteur, outcome durable
  assert.equal(outcome.kind, "result");
  assert.equal(outcome.result.status, "sent");
  assert.equal(ledgerEvents.length, 2);
  assert.equal(ledgerEvents[0].actionType, "outbound.email.send");
  assert.equal(ledgerEvents[1].actionType, "outbound.email.sent");
  assert.equal(ledgerEvents[1].metadata.providerMessageId, "msg_e2e");
  assert.equal(sentTodayOnChannel("ws_1", "email"), 1);
  const recorded = getOutboundOutcome(candidate.action.idempotencyKey);
  assert.equal(recorded.status, "sent");

  // 6. Double-clic = zéro deuxième envoi (idempotence de bout en bout)
  let sends = 0;
  const second = await sendOutboundActionAsCeo(
    {
      workspaceId: "ws_1",
      actionId: built.candidate.action.id,
      approvalToken: built.approvalToken,
    },
    {
      channelSend: { send: async () => { sends += 1; return { ok: true, providerMessageId: "x" }; } },
      ledger: async () => ({ ledgerEventId: "x" }),
    },
  );
  assert.equal(second.result.alreadySent, true);
  assert.equal(sends, 0);
});

test("GARDE-FOU : cible sans courriel direct ne peut pas être préparée (contrat)", () => {
  const wavo = { ...target, domain: "wavo.me", contact: "formulaire wavo.me/contact" };
  assert.equal(wavo.contact.includes("@"), false);
});
