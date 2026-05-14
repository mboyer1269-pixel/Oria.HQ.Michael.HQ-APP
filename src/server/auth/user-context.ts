import { serverEnv } from "@/lib/server-env";

const localUserId = "local-michael";

export type ServerUserContext = {
  userId: string;
  storagePreference: "local" | "supabase";
};

export function getServerUserContext(): ServerUserContext {
  if (!serverEnv.michaelHqOwnerId) {
    return {
      userId: localUserId,
      storagePreference: "local",
    };
  }

  return {
    userId: serverEnv.michaelHqOwnerId,
    storagePreference: "supabase",
  };
}
