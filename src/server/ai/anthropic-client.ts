import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured.");
  }

  return new Anthropic({ apiKey });
}

export function getAnthropicModelId(): string {
  return process.env.ANTHROPIC_MODEL_ID ?? "claude-sonnet-4-20250514";
}
