import type { Route } from "next";
import { SendHorizonal } from "lucide-react";
import { requireOwnerAccess } from "@/server/auth/owner";
import { OwnerAccessDenied } from "@/features/hq/components/owner-access-denied";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { CockpitShell } from "@/features/cockpit/components/cockpit-shell";
import {
  HqMetric,
  HqPageHeader,
  HqSummaryRail,
  HqWidget,
} from "@/features/hq/components/hq-widget-system";
import { SendDeskQueue, type SendDeskItem } from "@/features/hq/components/send-desk-queue";
import {
  getOutboundOutcome,
  listOutboundSendCandidates,
  sentTodayOnChannel,
} from "@/server/outbound/outbound-send-store";
import { EMAIL_CHANNEL, SMS_CHANNEL } from "@/server/outbound/outbound-channel";

export const dynamic = "force-dynamic";

// /hq/outbound — Send Desk (`ceo_single_send`)
//
// The first live execution surface of Oria HQ. Relay prepares; Michael
// reviews and clicks; the bridge sends ONE message and writes the proof to
// the Action Ledger. See docs/REVENUE_EXECUTION_LANE.md §3.1.

export default async function OutboundSendDeskPage() {
  const access = await requireOwnerAccess("/hq/outbound");
  if (access.status === "forbidden") {
    return <OwnerAccessDenied email={access.user.email} />;
  }

  const { activeWorkspace } = getActiveWorkspaceContext();
  const candidates = listOutboundSendCandidates(activeWorkspace.id);

  const items: SendDeskItem[] = candidates.map((candidate) => {
    const outcome = getOutboundOutcome(candidate.action.idempotencyKey);
    const base = {
      actionId: candidate.action.id,
      approvalToken: candidate.batch.approvalToken ?? "",
      channelId: candidate.channelId,
      recipient: candidate.recipient,
      subject: candidate.action.renderedSubject,
      body: candidate.action.renderedBody,
      subVoie: candidate.batch.subVoie,
      audienceType: candidate.batch.audienceType,
      consentBasis: candidate.batch.consentBasis,
      ...(candidate.batch.ventureId ? { ventureId: candidate.batch.ventureId } : {}),
    };
    if (!outcome) {
      return { ...base, status: "queued" as const };
    }
    if (outcome.status === "sent") {
      return {
        ...base,
        status: "sent" as const,
        providerMessageId: outcome.providerMessageId,
        ledgerEventId: outcome.ledgerEventId,
        sentAt: outcome.sentAt,
      };
    }
    if (outcome.status === "failed") {
      return { ...base, status: "failed" as const };
    }
    return { ...base, status: "blocked" as const, blockReason: outcome.blockReason };
  });

  const queuedCount = items.filter((item) => item.status === "queued").length;
  const sentEmailToday = sentTodayOnChannel(activeWorkspace.id, "email");
  const sentSmsToday = sentTodayOnChannel(activeWorkspace.id, "sms");

  return (
    <CockpitShell active="outbound" crumb="Send Desk">
      <HqPageHeader
        backHref={"/hq" as Route}
        eyebrow="Send Desk — ceo_single_send"
        icon={SendHorizonal}
        tone="emerald"
        title="Révise. Clique. C'est parti — avec preuve."
        description={
          <>
            La première voie d&apos;exécution réelle d&apos;Oria HQ. Relay prépare les messages ; rien ne
            part sans ton clic. Chaque envoi est validé (approbation, consentement, caps,
            suppression list), dédupliqué, et inscrit au ledger avant dispatch.
          </>
        }
      />

      <HqSummaryRail>
        <HqMetric label="En attente de ton clic" value={queuedCount} tone={queuedCount > 0 ? "amber" : "neutral"} />
        <HqMetric
          label="Email aujourd'hui"
          value={`${sentEmailToday} / ${EMAIL_CHANNEL.dailyCap}`}
          tone={sentEmailToday >= EMAIL_CHANNEL.dailyCap ? "rose" : "emerald"}
        />
        <HqMetric
          label="SMS aujourd'hui"
          value={`${sentSmsToday} / ${SMS_CHANNEL.dailyCap}`}
          tone={sentSmsToday >= SMS_CHANNEL.dailyCap ? "rose" : "emerald"}
        />
        <HqMetric label="Envois sans clic CEO" value="0 — par construction" tone="sky" />
      </HqSummaryRail>

      <HqWidget
        title="File d'envoi"
        eyebrow="Un clic = un envoi = une preuve"
        icon={SendHorizonal}
      >
        <SendDeskQueue items={items} />
      </HqWidget>
    </CockpitShell>
  );
}
