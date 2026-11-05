/**
 * Whether a job has a physical place that a booked interpreter needs to see, whatever its format. A virtual job can still
 * have one (a meeting held on Zoom with a room, an address and a parking code for people attending in person), so the
 * format alone never hides the place. A bare venue name does not count: on a virtual job it is usually just "Virtual".
 * Pure.
 */

type Loose = Record<string, unknown>;

const present = (value: unknown): boolean => typeof value === "string" && value.trim() !== "";

export const PHYSICAL_PLACE_KEYS = ["address", "building", "floor", "room", "parking", "entrance"] as const;

export function hasPhysicalPlace(onsite: unknown): boolean {
  const place = (typeof onsite === "object" && onsite !== null ? onsite : {}) as Loose;
  return PHYSICAL_PLACE_KEYS.some((key) => present(place[key]));
}
