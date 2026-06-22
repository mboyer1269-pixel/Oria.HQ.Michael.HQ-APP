// src/core/ventures/build-outreach-email.ts
//
// Generic outreach-email builder. Produces a {subject, body} from a venture's
// VentureMarketProfile + a target, by interpolating the profile's template.
// No proper nouns, no per-venture branches: every venture goes through here.
//
// `mode: "llm"` is intentionally not handled here — an agent generates that
// body from venture context elsewhere; this builder owns the deterministic,
// CEO-reviewed template path.

import type {
  OutreachTarget,
  VentureMarketProfile,
} from "./venture-market-profile";

export type OutreachEmail = {
  subject: string;
  body: string;
};

/** Strip a trailing corporate suffix for a clean company name in copy. */
export function normalizeCompanyName(name: string): string {
  return name.replace(/\s+(inc|ltd|llc|ltée|ltee|corp|co)\.?$/i, "").trim();
}

/** The variables a template may reference via {{key}}. */
export function buildInterpolationVars(
  profile: VentureMarketProfile,
  target: OutreachTarget,
): Record<string, string> {
  return {
    name: target.name,
    company: normalizeCompanyName(target.name),
    reference: target.reference ?? target.id,
    angle: target.angle ?? "",
    sell: profile.offer.sell,
    deliverable: profile.offer.deliverable,
    nextStep: profile.offer.nextStep,
    disclaimer: profile.offer.disclaimer,
  };
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Replace every {{key}} with vars[key]. Throws (fail loud) on an unknown key
 *  so a broken template is caught in dev/tests, never sent to a prospect. */
export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => {
    if (!(key in vars)) {
      throw new Error(`Outreach template references unknown placeholder {{${key}}}.`);
    }
    return vars[key];
  });
}

/**
 * Build a venture's outreach email for one target from its template profile.
 * Throws if the profile is not in template mode or has no template.
 */
export function buildOutreachEmail(
  profile: VentureMarketProfile,
  target: OutreachTarget,
): OutreachEmail {
  if (profile.outreach.mode !== "template" || !profile.outreach.template) {
    throw new Error(
      `buildOutreachEmail requires a template-mode profile (venture ${profile.ventureId}).`,
    );
  }
  const vars = buildInterpolationVars(profile, target);
  return {
    subject: interpolate(profile.outreach.template.subject, vars),
    body: interpolate(profile.outreach.template.body, vars),
  };
}
