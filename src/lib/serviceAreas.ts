/**
 * Service areas are a list of short tags. "Virtual Only" is a distinct tag meaning the interpreter has no in-person area,
 * so it is never stored together with a geographic area. Pure and shared by the form (instant feedback) and the server.
 */

export const VIRTUAL_ONLY_AREA = "Virtual Only";
export const MAX_SERVICE_AREAS = 20;
export const MAX_SERVICE_AREA_LENGTH = 60;
/** interpreter_profiles.service_area (the one-line summary of the list) is varchar(200). */
export const SERVICE_AREA_SUMMARY_MAX = 200;

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

export const isVirtualOnlyLabel = (value: string): boolean => squash(value).toLowerCase() === VIRTUAL_ONLY_AREA.toLowerCase();

/** Trimmed, single-spaced, without blanks or repeats (compared ignoring case); any spelling of "Virtual Only" becomes the tag. */
export function cleanAreas(areas: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of areas) {
    const area = isVirtualOnlyLabel(raw) ? VIRTUAL_ONLY_AREA : squash(raw);
    const key = area.toLowerCase();
    if (!area || seen.has(key)) continue;
    seen.add(key);
    out.push(area);
  }
  return out;
}

/** The one-line text stored in interpreter_profiles.service_area. */
export const summarizeAreas = (areas: readonly string[]): string => areas.join(", ");

/** A profile saved before tags existed only has the free-text service area: its comma / semicolon / line separated parts become tags. */
export function areasFromLegacy(text: string | null | undefined): string[] {
  return cleanAreas((text ?? "").split(/[,;\n]+/))
    .map((area) => area.slice(0, MAX_SERVICE_AREA_LENGTH))
    .slice(0, MAX_SERVICE_AREAS);
}
