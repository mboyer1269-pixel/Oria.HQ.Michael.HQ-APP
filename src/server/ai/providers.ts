import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * Brain roles for the Hermès dual-model architecture.
 *
 * strategy  → Claude Sonnet   — Board, decisions, CEO briefs, nuanced reasoning
 * execution → GPT-4o          — Copy, structured output, multimodal, high volume
 * economy   → GPT-4o-mini     — Triage, classification, fast ops
 * intent    → GPT-4o-mini     — Intent detection (always fast + cheap)
 */
export type BrainRole = "strategy" | "execution" | "economy" | "intent";

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL_ID ?? "claude-sonnet-4-6";
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

// @ai-sdk/anthropic v3 defaults to a non-standard base URL — must be explicit.
const anthropic = createAnthropic({
  baseURL: "https://api.anthropic.com/v1",
});

export function getModelForRole(role: BrainRole): LanguageModel {
  switch (role) {
    case "strategy":
      return anthropic(CLAUDE_MODEL);
    case "execution":
      return hasOpenAI ? openai("gpt-4o") : anthropic(CLAUDE_MODEL);
    case "economy":
    case "intent":
      return hasOpenAI ? openai("gpt-4o-mini") : anthropic(CLAUDE_MODEL);
  }
}

export function getModelIdForRole(role: BrainRole): string {
  switch (role) {
    case "strategy":
      return CLAUDE_MODEL;
    case "execution":
      return hasOpenAI ? "gpt-4o" : CLAUDE_MODEL;
    case "economy":
    case "intent":
      return hasOpenAI ? "gpt-4o-mini" : CLAUDE_MODEL;
  }
}
