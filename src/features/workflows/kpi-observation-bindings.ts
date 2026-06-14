import type { KpiObservationBinding } from "./kpi-observations";

// ---------------------------------------------------------------------------
// KPI → observation bindings seed.
//
// Only KPIs whose meaning maps defensibly onto an observed metric are bound.
// Each binding documents the proxy so a human can audit the assumption. The
// remaining charter KPIs stay deliberately unbound (status "unbound" in the
// report) until either a matching metric exists or the proxy is justified —
// honesty over false coverage. Extend this list to wire more KPIs.
// ---------------------------------------------------------------------------

export const kpiObservationBindings: KpiObservationBinding[] = [
  {
    kpiId: "joris-routing-accuracy",
    measure: "useful_output_rate",
    note: "Proxy : une mission routée sans correction CEO ≈ un output jugé utile sur les outputs relus.",
  },
  {
    kpiId: "joris-ledger-coverage",
    measure: "guardrail_clean_rate",
    note: "Proxy : une violation de guardrail = une action non gouvernée/non tracée ; le taux propre approxime la couverture ledger.",
  },
  {
    kpiId: "sentinel-gate-coverage",
    measure: "guardrail_clean_rate",
    note: "Proxy : taux d'actions sans violation observée ≈ couverture du gate sur les niveaux 4-5.",
  },
  {
    kpiId: "sentinel-incident-count",
    measure: "guardrail_violations",
    note: "Direct : un incident externe post-gate se matérialise comme une violation de guardrail observée.",
  },
  {
    kpiId: "relay-mission-completion",
    measure: "useful_output_rate",
    note: "Proxy : un run de mission conclu sans échec = une mission confirmée livrée.",
  },
  {
    kpiId: "forge-spec-rework",
    measure: "useful_output_rate",
    note: "Proxy : un run conclu sans échec ≈ une spec livrée sans rework majeur.",
  },
];
