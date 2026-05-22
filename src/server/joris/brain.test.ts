import { describe, it, expect, vi, type Mock } from "vitest";

// --- module mocks (must come before imports) ---
vi.mock("server-only", () => ({}));
vi.mock("@/server/brief/ceo-brief-service", () => ({}));
vi.mock("@/server/calendar/intent-parser", () => ({}));
vi.mock("@/server/calendar/calendar-service", () => ({}));
vi.mock("@/server/permissions/permissions", () => ({}));
vi.mock("@/server/joris/joris-prompt", () => ({
  buildJorisSystemPrompt: () => "system prompt",
  buildJorisSystemBlocks: () => [],
}));
vi.mock("@/server/ai/providers", () => ({
  getModelForRole: vi.fn().mockReturnValue({}),
  getModelIdForRole: vi.fn().mockReturnValue("gpt-4o-mini"),
}));

const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => mockGenerateObject(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}));

// --- imports after mocks ---
import { chooseModel } from "@/server/ai/model-router";
import { classifyIntentLLM } from "@/server/joris/brain";

// ---------------------------------------------------------------------------
// chooseModel — routing logic (pure function, no AI calls)
// ---------------------------------------------------------------------------
describe("chooseModel", () => {
  it("returns brute mode for high-impact flag", () => {
    const result = chooseModel({ message: "bonjour", highImpact: true });
    expect(result.mode).toBe("brute");
  });

  it("returns economy mode for simple message", () => {
    const result = chooseModel({ message: "bonjour" });
    expect(result.mode).toBe("economy");
  });

  it("returns brute mode for strategic signal", () => {
    const result = chooseModel({ message: "stratégie de pricing" });
    expect(result.mode).toBe("brute");
  });

  it("strategic signals take priority over requestedMode economy", () => {
    const result = chooseModel({ message: "stratégie", requestedMode: "economy" });
    expect(result.mode).toBe("brute");
  });

  it("returns economy when requestedMode is economy with a neutral message", () => {
    const result = chooseModel({ message: "bonjour", requestedMode: "economy" });
    expect(result.mode).toBe("economy");
  });

  it("strategy role routes to Claude brain", () => {
    const result = chooseModel({ message: "board consult", highImpact: true });
    expect(result.brainRole).toBe("strategy");
  });

  it("economy role routes to GPT-4o-mini brain", () => {
    const result = chooseModel({ message: "simple task" });
    expect(result.brainRole).toBe("economy");
  });
});

// ---------------------------------------------------------------------------
// classifyIntentLLM — Vercel AI SDK generateObject wrapper
// ---------------------------------------------------------------------------
describe("classifyIntentLLM", () => {
  it("returns the intent from generateObject", async () => {
    (mockGenerateObject as Mock).mockResolvedValueOnce({
      object: { intent: "board.consult" },
    });

    const result = await classifyIntentLLM("Que dirait Hormozi de cette offre ?");
    expect(result).toBe("board.consult");
  });

  it("falls back to chat when generateObject throws", async () => {
    (mockGenerateObject as Mock).mockRejectedValueOnce(new Error("No object generated"));

    // classifyIntentLLM itself re-throws; the catch is in detectIntent
    await expect(classifyIntentLLM("bonjour")).rejects.toThrow();
  });

  it("classifies calendar.book for booking message", async () => {
    (mockGenerateObject as Mock).mockResolvedValueOnce({
      object: { intent: "calendar.book" },
    });

    const result = await classifyIntentLLM("Booke-moi un rdv demain à 14h");
    expect(result).toBe("calendar.book");
  });
});
