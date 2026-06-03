import { skillsCatalog } from "@/features/skills/seed";
import type { SkillProfile } from "@/features/skills/types";

export function resolveRuntimeSkill(skillId: string): SkillProfile | null {
  return skillsCatalog.find((skill) => skill.id === skillId) ?? null;
}
