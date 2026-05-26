import { defaultArenaEvaluationService } from "./arena-evaluation-service";

type ArenaEvaluationService = typeof defaultArenaEvaluationService;

/**
 * Returns the arena evaluation service.
 *
 * In production, always returns the real service.
 * In non-production environments, allows a globalThis override so
 * integration tests can inject a mock without a full DI framework.
 */
export function getArenaEvaluationService(): ArenaEvaluationService {
  if (process.env.NODE_ENV === "production") {
    return defaultArenaEvaluationService;
  }

  const globals = globalThis as typeof globalThis & {
    __arenaEvaluationServiceTestOverride?: ArenaEvaluationService;
  };

  return globals.__arenaEvaluationServiceTestOverride ?? defaultArenaEvaluationService;
}
