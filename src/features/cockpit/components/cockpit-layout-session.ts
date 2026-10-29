import { cockpitLayoutWriteSchema, defaultCockpitOrder, isCockpitLayoutReady, type CockpitLayoutRead, type CockpitLayoutReady, type CockpitLayoutSave } from "../cockpit-layout-contract";

export type LayoutSession = {
  order: string[];
  baseline: CockpitLayoutReady | null;
  status: "idle" | "pending" | "confirmed" | "unconfirmed" | "not_attempted" | "conflict" | "read_failed" | "reloading" | "reloaded";
};
export function initialLayoutSession(read: CockpitLayoutRead): LayoutSession {
  return isCockpitLayoutReady(read)
    ? { order: [...read.order], baseline: read, status: "idle" }
    : { order: defaultCockpitOrder(), baseline: null, status: "read_failed" };
}
export function canSaveCockpitLayout(state: LayoutSession): boolean {
  return state.baseline !== null && (state.status === "idle" || state.status === "confirmed" || state.status === "reloaded");
}
export function beginLayoutSave(state: LayoutSession, order: string[]) {
  if (!canSaveCockpitLayout(state)) return null;
  const request = cockpitLayoutWriteSchema.safeParse({ order, expectedRevision: state.baseline!.revision });
  if (!request.success || JSON.stringify(order) === JSON.stringify(state.order)) return null;
  return { request: request.data, state: { ...state, order: [...order], status: "pending" as const } };
}
export function settleLayoutSave(state: LayoutSession, result: CockpitLayoutSave | undefined): LayoutSession {
  if (state.status !== "pending") return state;
  if (result?.status === "confirmed") {
    const checked = cockpitLayoutWriteSchema.safeParse({ order: result.order, expectedRevision: result.revision });
    if (checked.success && result.revision !== null && JSON.stringify(result.order) === JSON.stringify(state.order)) {
      return { order: [...result.order], baseline: { status: "loaded", order: result.order, revision: result.revision }, status: "confirmed" };
    }
  } else if (result?.status === "not_attempted" || result?.status === "conflict") {
    return { ...state, baseline: null, status: result.status };
  }
  return { ...state, baseline: null, status: "unconfirmed" };
}
/** Called only after the user's explicit reload gesture. A failed read keeps the local order. */
export function settleLayoutReload(state: LayoutSession, result: CockpitLayoutRead): LayoutSession {
  return isCockpitLayoutReady(result)
    ? { order: [...result.order], baseline: result, status: "reloaded" }
    : { ...state, baseline: null, status: "read_failed" };
}
export const layoutStatusText: Record<LayoutSession["status"], string> = {
  idle: "",
  pending: "Ordre ajusté ici. Demande de sauvegarde en cours ; patientez avant un autre déplacement.",
  confirmed: "Ordre enregistré : confirmation reçue du serveur.",
  unconfirmed: "Ordre ajusté ici ; sauvegarde non confirmée. Elle peut avoir réussi. Rechargez l’ordre enregistré avant un autre déplacement.",
  not_attempted: "Ordre ajusté ici. Aucune écriture n’a été tentée. Rechargez l’ordre enregistré avant un autre déplacement.",
  conflict: "L’ordre enregistré a changé ailleurs. Votre déplacement n’a pas été appliqué. Rechargez l’ordre enregistré.",
  read_failed: "Ordre enregistré indisponible. L’affichage actuel est conservé et la sauvegarde est bloquée pour ne pas écraser vos préférences.",
  reloaded: "Ordre enregistré rechargé. Aucune sauvegarde n’a été lancée.",
  reloading: "Lecture de l’ordre enregistré en cours ; aucune sauvegarde n’est lancée.",
};

export function layoutStatusMessage(state: LayoutSession): string {
  if (state.status === "reloaded" && state.baseline?.status === "missing") return "Aucun ordre enregistré. Ordre par défaut affiché ; aucune sauvegarde lancée.";
  return layoutStatusText[state.status];
}
