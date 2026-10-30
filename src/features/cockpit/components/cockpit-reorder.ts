import type { Announcements } from "@dnd-kit/core";

const WIDGET_LABELS: Record<string, string> = {
  "daily-direction": "Plan du jour — Joris",
  "idea-intake": "Capture d’idée",
  "decision-queue": "File de décision",
  "joris-agent": "Joris — Agent CEO",
  treasury: "Trésorerie",
  ventures: "Ventures",
  modes: "Modes opérationnels",
};

export const getWidgetLabel = (id: string): string => WIDGET_LABELS[id] ?? "Widget";

/** A cancelled, unchanged or invalid drop never produces an order to persist. */
export function moveWidgetOrder(order: string[], activeId: string, overId: string | null): string[] | null {
  const from = order.indexOf(activeId);
  const to = overId === null ? -1 : order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

// Read the snapshot captured at pickup, not the reordered React render.
export function cockpitReorderAnnouncements(
  readStartOrder: () => string[],
  readCurrentOrder: () => string[] = readStartOrder,
): Announcements {
  const position = (id: string, order = readStartOrder()) => {
    return `${order.indexOf(id) + 1} sur ${order.length}`;
  };
  return {
    onDragStart: ({ active }) => `${getWidgetLabel(String(active.id))} saisi, position ${position(String(active.id), readCurrentOrder())}. Utilisez les flèches, Espace pour déposer, Échap pour annuler.`,
    onDragOver: ({ active, over }) => over
      ? `${getWidgetLabel(String(active.id))}, position proposée ${position(String(over.id))}.`
      : `${getWidgetLabel(String(active.id))}, hors de la grille.`,
    onDragEnd: ({ active, over }) => {
      const next = moveWidgetOrder(readStartOrder(), String(active.id), over ? String(over.id) : null);
      return next
        ? `${getWidgetLabel(String(active.id))} déplacé, position ${next.indexOf(String(active.id)) + 1} sur ${next.length}. Ordre ajusté ici ; sauvegarde non confirmée.`
        : `${getWidgetLabel(String(active.id))} reposé. Ordre inchangé.`;
    },
    onDragCancel: ({ active }) => `Déplacement de ${getWidgetLabel(String(active.id))} annulé. Ordre inchangé.`,
  };
}
