/**
 * Is a job a mental health appointment? Interpreters see a "Mental Health" pill on the offer (in the app only) so they can decide
 * before accepting. Only this yes / no leaves the server: the billing modifier itself ("U3 U9") is agency-only and never sent.
 * True when the billing modifier is "U3 U9", or the appointment setting mentions mental or behavioral health. Pure.
 */

const SETTING = /\b(mental|behaviou?ral)\s*health\b/i;

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function isMentalHealthJob(requestData: unknown): boolean {
  const data = asObject(requestData);
  const intake = asObject(data.intake);
  const details = asObject(data.details);
  if (text(intake.billingModifier).toUpperCase().replace(/\s+/g, " ") === "U3 U9") return true;
  return [data.setting, details.setting].some((s) => SETTING.test(text(s)));
}
