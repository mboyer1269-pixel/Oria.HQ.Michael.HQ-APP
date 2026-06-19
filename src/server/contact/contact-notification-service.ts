import type { ContactLead, ContactNotificationStatus } from "@/core/types";
import { serverEnv } from "@/lib/server-env";

export type ContactNotificationResult = {
  status: ContactNotificationStatus;
  reason: "missing_recipient" | "provider_unconfigured" | "queued" | "failed";
};

export async function notifyContactLead(lead: ContactLead): Promise<ContactNotificationResult> {
  if (!serverEnv.contactNotificationEmail) {
    console.info("Contact notification skipped: CONTACT_NOTIFICATION_EMAIL is not configured.", {
      leadId: lead.id,
    });
    return { status: "skipped", reason: "missing_recipient" };
  }

  if (!serverEnv.resendApiKey) {
    console.info("Contact notification skipped: RESEND_API_KEY is not configured.", {
      leadId: lead.id,
    });
    return { status: "skipped", reason: "provider_unconfigured" };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(serverEnv.resendApiKey);

    const from = serverEnv.resendFromEmail
      ? `Suivia Notifications <${serverEnv.resendFromEmail}>`
      : "Suivia Notifications <onboarding@resend.dev>";

    const subject = lead.company
      ? `Nouveau lead: ${lead.name} — ${lead.company}`
      : `Nouveau lead: ${lead.name}`;

    const lines: string[] = [
      "Nouveau message via le formulaire de contact.",
      "",
      `Nom       : ${lead.name}`,
      `Courriel  : ${lead.email}`,
    ];
    if (lead.phone) lines.push(`Téléphone : ${lead.phone}`);
    if (lead.company) lines.push(`Entreprise: ${lead.company}`);
    lines.push(`Source    : ${lead.source}`);
    lines.push("");
    lines.push("Message:");
    lines.push(lead.message);
    lines.push("");
    lines.push(`Lead ID   : ${lead.id}`);
    lines.push(`Reçu      : ${lead.createdAt}`);

    await resend.emails.send({
      from,
      to: serverEnv.contactNotificationEmail,
      subject,
      text: lines.join("\n"),
    });

    console.info("Contact notification queued via Resend.", { leadId: lead.id });
    return { status: "queued", reason: "queued" };
  } catch (error) {
    console.error(
      "Contact notification failed via Resend:",
      error instanceof Error ? error.message : "Unknown error",
      { leadId: lead.id },
    );
    return { status: "failed", reason: "failed" };
  }
}
