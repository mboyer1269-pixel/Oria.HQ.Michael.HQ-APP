import type { ContactLead, ContactNotificationStatus } from "@/features/contact/types";
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

    return {
      status: "skipped",
      reason: "missing_recipient",
    };
  }

  console.info("Contact notification skipped: no email provider is configured yet.", {
    leadId: lead.id,
    recipient: serverEnv.contactNotificationEmail,
  });

  return {
    status: "skipped",
    reason: "provider_unconfigured",
  };
}
