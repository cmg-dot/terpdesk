/**
 * The setting an interpreter EMAIL may name: one of a fixed set of generic categories, never the form's own words. The state's form
 * and the agency's own form let staff write any text ("Medical Provider-Medicaid", "MEDICAID COVERED SERVICE", "Job Interview"), and
 * free text can carry more than a category (security.md: outbound email carries only a generic setting). The result is always one of
 * GENERIC_SETTINGS. Pure.
 */

export const GENERIC_SETTINGS = ["Medical", "Legal", "Educational", "Mental Health", "Social Services", "Employment", "General"] as const;
export type GenericSetting = (typeof GENERIC_SETTINGS)[number];

/** First match wins, so "Mental health" is not read as the Medical "health" and "Job interview" is Employment. */
const RULES: readonly (readonly [GenericSetting, RegExp])[] = [
  ["Mental Health", /\b(?:mental|behaviou?ral|psychiatr\w*|psycholog\w*|counsel\w*|substance|addiction|crisis|detox\w*)\b/i],
  ["Legal", /\b(?:legal|court\w*|attorney|lawyer|law|judicial|judge|jail|prison|police|probation|deposition|mediation|immigration)\b/i],
  ["Employment", /\b(?:employ\w*|job|interview|vocational|workplace|workforce|career|onboarding|dvr|human resources|business)\b/i],
  ["Educational", /\b(?:educat\w*|school\w*|college|universit\w*|classroom|class|training|student\w*|iep|academic|tutor\w*|campus)\b/i],
  ["Medical", /\b(?:medic\w*|health\w*|hospital\w*|clinic\w*|doctor|dental|dentist|surgery|surgical|nurs\w*|pharmac\w*|therap\w*|primary care|urgent care|emergency|radiology|oncology|cardio\w*|pediatric\w*|vision|optical)\b/i],
  // "Client Services - Direct" is the state's own wording for its direct service to clients; "CARE Assessment" is DSHS's.
  ["Social Services", /\b(?:social|dshs|benefits?|housing|dcyf|welfare|community|ssa|food|shelter|case\s*manag\w*|family services|client services|care assessment|disability)\b/i],
];

/** "Medical Provider-Medicaid" -> "Medical"; nothing recognised, or nothing entered, -> "General". */
export function genericSetting(raw: unknown): GenericSetting {
  const text = typeof raw === "string" ? raw : "";
  for (const [category, pattern] of RULES) if (pattern.test(text)) return category;
  return "General";
}
