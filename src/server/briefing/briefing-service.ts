import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getModelForRole } from "@/server/ai/providers";
import type { ScanResult } from "@/server/market-scout/scanner";

export type SignalBriefDraft = {
  title: string;
  executiveSummary: string;
  topSignals: Array<{
    signal: string;
    implication: string;
    urgency: "high" | "medium" | "low";
  }>;
  marketTensionScore: number; // 1–10
  recommendedActions: string[];
  generatedAt: string;
};

const BriefSchema = z.object({
  title: z.string(),
  executiveSummary: z.string(),
  topSignals: z.array(
    z.object({
      signal: z.string(),
      implication: z.string(),
      urgency: z.enum(["high", "medium", "low"]),
    }),
  ),
  marketTensionScore: z.number().min(1).max(10),
  recommendedActions: z.array(z.string()),
});

export async function generateSignalBrief(scan: ScanResult): Promise<SignalBriefDraft> {
  const signalText = scan.signals
    .slice(0, 10)
    .map((s, i) => `${i + 1}. [${s.category}] ${s.title}\n   ${s.snippet}`)
    .join("\n\n");

  const { object } = await generateObject({
    model: getModelForRole("strategy"),
    schema: BriefSchema,
    system: `Tu es le Briefing Analyst de Suivia — agence Signal-to-Client pour cliniques esthétiques QC/ON.
Tu analyses les signaux de marché collectés et tu génères un briefing stratégique hebdomadaire.

## Format attendu
- title: Titre percutant du briefing (ex: "3 signaux critiques cette semaine en esthétique QC")
- executiveSummary: 3-4 phrases résumant la tension marché et l'opportunité principale
- topSignals: Les 3-5 signaux les plus importants avec leur implication business pour une clinique esthétique
- marketTensionScore: Score de 1 (calme) à 10 (tension maximale) basé sur les signaux
- recommendedActions: 3 actions concrètes qu'une clinique devrait prendre cette semaine

## Contexte
- Marché: Cliniques esthétiques (botox, laser, injections, soins)
- Territoire: Québec et Ontario
- Client-type: Clinique avec 2-10 praticiens, cherche à rester compétitive
- Langue: Français québécois, ton direct et professionnel`,
    prompt: `Voici les signaux du marché collectés cette semaine (${scan.scannedAt.slice(0, 10)}):\n\n${signalText || "Aucun signal collecté ce cycle — utilise des données génériques du secteur esthétique QC/ON pour simuler un briefing."}`,
  });

  return {
    ...object,
    generatedAt: new Date().toISOString(),
  };
}
