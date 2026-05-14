import type { Route } from "next";

export const defaultPrivatePath = "/hq";

export function normalizePrivateRedirectPath(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") return defaultPrivatePath;

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return defaultPrivatePath;
  }

  if (trimmed !== "/hq" && !trimmed.startsWith("/hq/") && !trimmed.startsWith("/dashboard")) {
    return defaultPrivatePath;
  }

  return trimmed;
}

export function getLoginPath(nextPath = defaultPrivatePath) {
  return `/login?next=${encodeURIComponent(normalizePrivateRedirectPath(nextPath))}`;
}

export function asRoute(path: string) {
  return path as Route;
}
