import { getActiveWorkspaceContext } from "@/core/workspace-context";
import type { ContactLead, ContactNotificationStatus } from "@/core/types";
import {
  createContactLeadRepository,
  type CreateContactLeadInput,
} from "@/server/contact/contact-lead-repository";
import { notifyContactLead } from "@/server/contact/contact-notification-service";

export type CreateContactLeadCommand = Omit<CreateContactLeadInput, "workspaceId">;

export type ContactLeadWriteResult = {
  lead: ContactLead;
  notificationStatus: ContactNotificationStatus;
  notificationReason?: string;
};

export async function createContactLead(command: CreateContactLeadCommand): Promise<ContactLeadWriteResult> {
  const repository = createContactLeadRepository();
  const lead = await repository.create({ ...command, workspaceId: getActiveWorkspaceContext().workspace.id });

  try {
    const notification = await notifyContactLead(lead);

    return {
      lead,
      notificationStatus: notification.status,
      notificationReason: notification.reason,
    };
  } catch (error) {
    console.error("Contact notification failed:", error instanceof Error ? error.message : "Unknown error");

    return {
      lead,
      notificationStatus: "failed",
      notificationReason: "failed",
    };
  }
}
