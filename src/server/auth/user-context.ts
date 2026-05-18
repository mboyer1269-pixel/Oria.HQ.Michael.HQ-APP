import { serverEnv } from "@/lib/server-env";

const localUserId = "local-michael";

export type ServerUserContext = {
  userId: string;
  email?: string;
  storagePreference: "local" | "supabase";
};

export function getServerUserContext(): ServerUserContext {
  if (!serverEnv.michaelHqOwnerId) {
    return {
      userId: localUserId,
      email: serverEnv.michaelHqOwnerEmail,
      storagePreference: "local",
    };
  }

  return {
    userId: serverEnv.michaelHqOwnerId,
    email: serverEnv.michaelHqOwnerEmail,
    storagePreference: "supabase",
  };
}
