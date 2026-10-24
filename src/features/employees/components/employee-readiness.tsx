import type { EmployeeProfile } from "@/core/employees/types";
import { projectEmployeeReadiness } from "@/features/employees/readiness";

export function EmployeeReadiness({ employee }: { employee: EmployeeProfile }) {
  const readiness = projectEmployeeReadiness(employee);
  return <details className="rounded-xl border border-neutral-700 text-sm text-neutral-300">
    <summary className="min-h-11 break-words cursor-pointer rounded-xl px-3 py-3 font-medium text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300">Comprendre la disponibilité de {employee.displayName}</summary>
    <div className="space-y-3 break-words px-3 pb-3 leading-6">
      <p className="font-medium text-amber-200">{readiness.label}</p>
      <dl className="space-y-3">
        <div><dt className="font-medium text-neutral-100">Rôle et mandat</dt><dd>{readiness.mandate}</dd></div>
        <div><dt className="font-medium text-neutral-100">Modèle et exécution</dt><dd>{readiness.execution}</dd></div>
        <div><dt className="font-medium text-neutral-100">Outils et accès</dt><dd>{readiness.access}</dd></div>
      </dl>
      <p>{readiness.nextStep}</p>
    </div>
  </details>;
}
