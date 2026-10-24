import type { EmployeeProfile } from "@/core/employees/types";

export type EmployeeReadiness = {
  status: "proposed" | "archived" | "unknown";
  executable: false;
  label: string;
  mandate: string;
  execution: string;
  access: string;
  nextStep: string;
};

/** A directory profile is not execution evidence. Never infer access from its prose. */
export function projectEmployeeReadiness(employee: EmployeeProfile | null): EmployeeReadiness {
  const status = employee?.state === "draft" ? "proposed" : employee?.state === "archived" ? "archived" : "unknown";
  const mandateComplete = Boolean(employee && [employee.specialty, employee.assignmentRole, employee.instructions, employee.assignmentContext].every((value) => value?.trim()));
  return {
    status,
    executable: false,
    label: status === "archived" ? "Profil archivé · non opérationnel" : status === "proposed" ? "Profil proposé · non opérationnel" : "État opérationnel inconnu",
    mandate: mandateComplete ? "Rôle et mandat renseignés. Ils décrivent le travail souhaité, sans autoriser son exécution." : "Rôle ou mandat incomplet. Aucun accès ne peut en être déduit.",
    execution: status === "unknown" ? "Qualification du modèle et inscription au registre non confirmées." : "Ce profil d’équipe est exclu du registre d’exécution. Aucun modèle n’est qualifié pour cet identifiant ; une connexion fournisseur ne suffirait pas à le qualifier.",
    access: "Connexions et permissions non vérifiées ici. Les outils cités dans le mandat sont des besoins, pas des accès accordés.",
    nextStep: status === "archived" ? "Conservez ce profil comme référence. L’archivage ne crée aucun accès ni capacité d’exécution." : status === "proposed" ? "Utilisez « Modifier » pour préciser le mandat, ses limites et les outils nécessaires. L’activation de ce profil n’est pas disponible dans cette équipe." : "Rechargez l’équipe pour retrouver un état de profil confirmé. Ne déduisez aucune capacité d’exécution de cet état inconnu.",
  };
}
