import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Lot A′ — frontière d'architecture : l'interface (composants .tsx) ne doit pas
// importer directement un client de base de données ni un moteur d'exécution
// (runtimes CLI, fournisseurs, cerveau Joris, jobs, secrets). Elle passe par une
// route API ou un service serveur. Les imports « type » restent permis.
const UI_FORBIDDEN_PATTERNS = [
  { group: ["@supabase/*", "pg", "postgres"], message: "UI : pas de client DB direct — passer par une route ou un service serveur.", allowTypeImports: true },
  { group: ["@/server/db/*", "@/server/supabase/*", "@/lib/supabase/admin*"], message: "UI : pas d'accès direct à la base — passer par une route ou un service serveur.", allowTypeImports: true },
  { group: ["@/server/agents/runtimes/*", "@/server/agents/providers/*", "@/server/ai/subscription-runtime", "@/server/joris/brain", "@/server/jobs/*", "@/server/missions/atelier-mission*"], message: "UI : pas d'import direct d'un moteur d'exécution — passer par une route API.", allowTypeImports: true },
  { group: ["@/lib/server-env", "@/lib/server-env/*"], message: "UI : pas de lecture directe des secrets serveur.", allowTypeImports: true },
];

export { UI_FORBIDDEN_PATTERNS };

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/features/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: UI_FORBIDDEN_PATTERNS }],
    },
  },
  {
    // DETTE CONNUE (registre Lot A′, ligne UI-1) : cette page serveur lit le jeton
    // Paperclip via serverEnv pour calculer un statut. À déplacer dans un service
    // serveur. Exception limitée à la règle « secrets » sur ce seul fichier.
    files: ["src/app/hq/missions/page.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", { patterns: UI_FORBIDDEN_PATTERNS.slice(0, 3) }],
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
