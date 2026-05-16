/* eslint-disable @typescript-eslint/no-require-imports */
const fs: typeof import("node:fs") = require("node:fs");
const path: typeof import("node:path") = require("node:path");

type EnvSource = {
  value: string;
  source: string;
};

type EnvRequirement = {
  key: string;
  required: boolean;
  purpose: string;
  setupHint: string;
  validate?: (value: string) => string | null;
};

const envFiles = [".env", ".env.local"];

const requirements: EnvRequirement[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    purpose: "Supabase project URL for Auth sessions and server repositories.",
    setupHint: "Copy it from Supabase Project Settings > API > Project URL.",
    validate(value) {
      try {
        const url = new URL(value);

        if (!url.hostname.endsWith(".supabase.co")) {
          return "Expected a Supabase project URL ending in .supabase.co.";
        }
      } catch {
        return "Expected a valid URL.";
      }

      return null;
    },
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    purpose: "Anon/publishable key used by Supabase Auth clients.",
    setupHint: "Copy it from Supabase Project Settings > API. This can be public, but still avoid printing it.",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    purpose: "Server-only key used for backend writes that must bypass RLS, such as contact leads.",
    setupHint: "Copy the service role/secret key from Supabase Project Settings > API and keep it server-only.",
  },
  {
    key: "MICHAEL_HQ_OWNER_ID",
    required: true,
    purpose: "Owner Supabase auth.users UUID used for owner-only access and owner-scoped rows.",
    setupHint: "Copy the UUID from Supabase Authentication > Users after creating the owner account.",
    validate(value) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? null
        : "Expected a UUID from auth.users.id.";
    },
  },
  {
    key: "MICHAEL_HQ_OWNER_EMAIL",
    required: false,
    purpose: "Optional owner email fallback for the first auth setup.",
    setupHint: "Use the same email as the owner Supabase Auth user.",
    validate(value) {
      return /^\S+@\S+\.\S+$/.test(value) ? null : "Expected an email address.";
    },
  },
  {
    key: "CONTACT_NOTIFICATION_EMAIL",
    required: false,
    purpose: "Optional destination for contact lead notifications once an email provider is wired.",
    setupHint: "Set this when contact notifications should be routed to an inbox.",
    validate(value) {
      return /^\S+@\S+\.\S+$/.test(value) ? null : "Expected an email address.";
    },
  },
];

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return new Map<string, string>();

  const parsed = new Map<string, string>();
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = normalized.indexOf("=");

    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    let value = normalized.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed.set(key, value);
  }

  return parsed;
}

function collectEnv() {
  const collected = new Map<string, EnvSource>();

  for (const fileName of envFiles) {
    const filePath = path.join(process.cwd(), fileName);
    const values = parseEnvFile(filePath);

    for (const [key, value] of values) {
      collected.set(key, {
        value,
        source: fileName,
      });
    }
  }

  for (const key of Object.keys(process.env)) {
    const value = process.env[key];

    if (value) {
      collected.set(key, {
        value,
        source: "process environment",
      });
    }
  }

  return collected;
}

function hasValue(value: string | undefined) {
  return Boolean(value?.trim());
}

function printStatus(label: "ok" | "missing" | "warning", message: string) {
  const prefix = label === "ok" ? "[ok]" : label === "missing" ? "[missing]" : "[warning]";

  console.log(`${prefix} ${message}`);
}

function main() {
  const collected = collectEnv();
  const missing: EnvRequirement[] = [];
  const warnings: string[] = [];

  console.log("Oria / Michael HQ Supabase configuration check");
  console.log("No secret values are printed by this script.\n");

  for (const requirement of requirements) {
    const envValue = collected.get(requirement.key);

    if (!envValue || !hasValue(envValue.value)) {
      if (requirement.required) {
        missing.push(requirement);
        printStatus("missing", `${requirement.key}: ${requirement.purpose}`);
      } else {
        printStatus("warning", `${requirement.key}: optional. ${requirement.purpose}`);
      }

      continue;
    }

    const validationMessage = requirement.validate?.(envValue.value.trim());

    if (validationMessage) {
      warnings.push(`${requirement.key}: ${validationMessage}`);
      printStatus("warning", `${requirement.key}: present in ${envValue.source}, but ${validationMessage}`);
      continue;
    }

    printStatus("ok", `${requirement.key}: present in ${envValue.source}.`);
  }

  if (missing.length > 0) {
    console.log("\nMissing required configuration:");

    for (const requirement of missing) {
      console.log(`- ${requirement.key}: ${requirement.setupHint}`);
    }
  }

  if (warnings.length > 0) {
    console.log("\nWarnings to review:");

    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("\nNext manual checks:");
  console.log("- Apply db/schema.sql in the Supabase SQL Editor.");
  console.log("- Smoke test owner and non-owner logins on /hq, then documents on /dashboard/documents.");
  console.log("- Smoke test RLS for calendar_events, contact_leads, and documents.");

  if (missing.length > 0) {
    process.exitCode = 1;
  }
}

main();
