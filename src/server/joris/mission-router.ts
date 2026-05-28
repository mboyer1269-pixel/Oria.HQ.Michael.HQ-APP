import { validateWorkOrder, type WorkOrder, type WorkOrderValidationResult } from "../agents/work-order-contract";
import { ApprovalGate } from "../agents/agent-profile-contract";
import { BoosterType } from "../agents/booster-contract";

export interface MissionRouterResult {
  workOrder: WorkOrder;
  humanOnTheLoopSummary: string;
  validation: WorkOrderValidationResult;
}

/**
 * Pure helper that routes a natural language request into a dry-run WorkOrder proposal.
 * Uses static heuristic rules for this PR.
 * Returns the generated WorkOrder, a conversational summary, and the validation result.
 * It is completely side-effect free and does not dispatch anything.
 */
export function routeMissionRequest(
  requestText: string,
  userId: string,
): MissionRouterResult {
  const text = requestText.toLowerCase();

  // Basic static heuristic rules
  const isVenture =
    text.includes("revenue") ||
    text.includes("opportunity") ||
    text.includes("launch") ||
    text.includes("business") ||
    text.includes("idée") ||
    text.includes("idee") ||
    text.includes("opportunité") ||
    text.includes("opportunite") ||
    text.includes("revenu");
  const isResearch =
    text.includes("research") ||
    text.includes("analyze") ||
    text.includes("scout") ||
    text.includes("analyse") ||
    text.includes("recherche") ||
    text.includes("analyser");
  const isCode =
    text.includes("code") ||
    text.includes("build") ||
    text.includes("deploy") ||
    text.includes("développer") ||
    text.includes("developper") ||
    text.includes("construire") ||
    text.includes("déployer") ||
    text.includes("deployer");

  let workOrder: WorkOrder;
  let summary = "";

  if (isVenture) {
    workOrder = {
      id: `wo_venture_${Date.now()}`,
      type: "venture",
      title: "Exploration d'opportunité Business",
      ownerAgentId: "revenue-operator",
      businessIdea: requestText,
      revenueModel: "SaaS Subscription",
      profitTarget: 1000,
      validationTest: { description: "100 signups on landing page", evaluationMethod: "analytics" },
      expectedOutput: { description: "MVP Landing Page and Pricing Model", outputType: "product" },
      boostersRequested: [
        {
          boosterType: BoosterType.MODEL,
          reason: "Need optimal pricing strategy",
          expectedOutput: "Pricing tiers",
          modelTier: "premium",
          costTier: "medium"
        }
      ],
      budgetRequested: { amount: 50, currency: "EUR", justification: "Ads and domain" },
      approvalGates: [ApprovalGate.MONEY, ApprovalGate.PUBLISHING, ApprovalGate.DEPLOYMENT],
      promotionOpportunity: { targetLevel: 3, criteria: "Hit profit target", originalOryaEligible: false },
      successMetric: { description: "Reach profit target within 30 days" },
      nextAction: { description: "Draft landing page copy", actor: "revenue-operator" },
      businessValue: { valueType: "revenue", expectedValue: 1000, currency: "EUR", confidence: "medium" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      requestedById: userId,
      createdAt: new Date().toISOString()
    };
    summary = "Je détecte une opportunité de revenu. Voici un brouillon de Venture Work Order, qui nécessite des approbations strictes (argent, publication, déploiement) avant toute exécution.";
  } else if (isCode) {
    workOrder = {
      id: `wo_mission_code_${Date.now()}`,
      type: "mission",
      title: "Développement et Déploiement",
      ownerAgentId: "product-builder",
      assignedAgentId: "product-builder",
      objective: requestText,
      expectedOutput: { description: "Feature shipped to production", outputType: "code" },
      boostersRequested: [
        {
          boosterType: BoosterType.TOOL,
          reason: "Need CI/CD assistance",
          expectedOutput: "Deployment scripts",
          modelTier: "standard",
          costTier: "low"
        }
      ],
      riskLevel: "high",
      approvalGates: [ApprovalGate.DEPLOYMENT, ApprovalGate.LIVE_RUNTIME],
      successMetric: { description: "Zero downtime deployment" },
      nextAction: { description: "Write initial implementation", actor: "product-builder" },
      businessValue: { valueType: "activation", confidence: "high" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      requestedById: userId,
      createdAt: new Date().toISOString(),
    };
    summary = "Je détecte une demande de développement. Voici un brouillon de Mission Work Order assigné au Product Builder. Les portes de déploiement et d'exécution live sont actives.";
  } else if (isResearch) {
    workOrder = {
      id: `wo_mission_research_${Date.now()}`,
      type: "mission",
      title: "Recherche et Analyse",
      ownerAgentId: "innovation-scout",
      assignedAgentId: "innovation-scout",
      objective: requestText,
      expectedOutput: { description: "Research report", outputType: "report" },
      boostersRequested: [
        {
          boosterType: BoosterType.MODEL,
          reason: "Deep market analysis required",
          expectedOutput: "Market insights document",
          modelTier: "economy",
          costTier: "low"
        }
      ],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Delivery of actionable insights" },
      nextAction: { description: "Gather data sources", actor: "innovation-scout" },
      businessValue: { valueType: "learning", confidence: "high" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      requestedById: userId,
      createdAt: new Date().toISOString(),
    };
    summary = "Demande d'analyse reçue. Je propose une Mission Work Order pour l'Innovation Scout. Le niveau de risque est faible, aucune approbation spéciale requise.";
  } else {
    // Fallback safe mission
    workOrder = {
      id: `wo_mission_fallback_${Date.now()}`,
      type: "mission",
      title: "Mission de clarification",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: `Clarifier la demande: ${requestText}`,
      expectedOutput: { description: "Clarification or refined requirements", outputType: "text" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "User clarifies intent" },
      nextAction: { description: "Ask user for clarification", actor: "joris" },
      businessValue: { valueType: "learning", confidence: "low" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      requestedById: userId,
      createdAt: new Date().toISOString(),
    };
    summary = "Demande générique. Voici un brouillon de Mission de clarification bas risque. Joris reste le propriétaire.";
  }

  return {
    workOrder,
    humanOnTheLoopSummary: summary,
    validation: validateWorkOrder(workOrder as unknown as Record<string, unknown>),
  };
}
