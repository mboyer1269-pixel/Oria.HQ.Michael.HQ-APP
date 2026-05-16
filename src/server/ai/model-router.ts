import type { ModelMode, ModelProfile } from "@/features/hq/types";
import { modelProfiles } from "@/features/hq/seed";

export type ModelRouteInput = {
  message: string;
  requestedMode?: ModelMode;
  highImpact?: boolean;
};

export type ModelRouteDecision = {
  model: ModelProfile;
  mode: ModelMode;
  reason: string;
};

const strategicSignals = [
  "stratégie",
  "pricing",
  "vente",
  "millionnaire",
  "board",
  "comité",
  "positionnement",
  "négociation",
  "architecture",
  "agent autonome",
];

const longContextSignals = ["document", "résume", "analyse ce fichier", "long", "vault", "sop"];

export function chooseModel(input: ModelRouteInput): ModelRouteDecision {
  const message = input.message.toLowerCase();
  const mode = input.requestedMode ?? "auto";

  const claude = modelProfiles.find((model) => model.id === "claude-sonnet-4-6") ?? modelProfiles[0];
  const openAiEconomy = modelProfiles.find((model) => model.id === "gpt-4o-mini") ?? claude;
  const gemini = modelProfiles.find((model) => model.id === "gemini-flash") ?? openAiEconomy;

  if (mode === "brute" || input.highImpact || strategicSignals.some((signal) => message.includes(signal))) {
    return {
      model: claude,
      mode: mode === "manual" ? "manual" : "brute",
      reason: "Demande à fort impact business: on privilégie le jugement et le ton de Joris.",
    };
  }

  if (mode === "economy") {
    return {
      model: openAiEconomy,
      mode: "economy",
      reason: "Mode économie demandé: réponse utile sans consommer le modèle premium.",
    };
  }

  if (longContextSignals.some((signal) => message.includes(signal))) {
    return {
      model: gemini,
      mode: "economy",
      reason: "Demande orientée contexte long ou synthèse: Gemini est priorisé pour réduire les coûts.",
    };
  }

  return {
    model: openAiEconomy,
    mode: "economy",
    reason: "Tâche simple ou opérationnelle: Joris économise le budget IA.",
  };
}
