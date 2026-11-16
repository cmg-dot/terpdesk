/**
 * The room / unit a state form writes into its Location or Address line instead of its own Room line ("Legacy Salmon Creek
 * Ocean 8", "... Ste B3", "123 Main St Room 1213"). Pure.
 *
 * Only a numbered unit counts (a word plus a number: "Ocean 8", "Room 1213", "Suite 1000", "Ste. 107", "Wing C2"), never a word on
 * its own: "Ocean entrance" is a direction, "Department of Services for the Blind" and "... Clinic" are names. On the Address line
 * only Room / Rm / Ocean are taken, and the address is left whole: a suite or unit there is part of the postal address.
 */

/** "8", "1213", "B3", "C-2": a number, never ending in a dash (a dash after it is a separator: "Ocean 8- Legacy"). */
const UNIT = String.raw`[A-Za-z]?\d(?:[A-Za-z0-9-]{0,5}[A-Za-z0-9])?`;
const LOCATION_ROOM = new RegExp(String.raw`(?:^|[\s,;(/–—-])((?:Ocean|Room|Rm\.?|Suite|Ste\.?|Unit|Wing)[ \t]*#?[ \t]*${UNIT})(?=$|[\s,;)/–—-])`, "i");
const ADDRESS_ROOM = new RegExp(String.raw`(?:^|[\s,;(/–—-])((?:Ocean|Room|Rm\.?)[ \t]*#?[ \t]*${UNIT})(?=$|[\s,;)/–—-])`, "i");
/** Separators and a dangling dash left at either end once the unit is taken out ("Legacy - " -> "Legacy"). */
const EDGE_SEPARATORS = /^[\s,;:/–—-]+|[\s,;:/–—-]+$/g;

export interface PlaceRoom {
  /** The place's name with the unit taken out, or "" when the Location line held nothing else. */
  venue: string;
  room: string | null;
}

/** The unit in the venue (removed from it), else the one in the address (left in it). `room` is null when neither has one. */
export function roomFromPlace(venue: string | null, address: string | null): PlaceRoom {
  const name = venue ?? "";
  const inVenue = LOCATION_ROOM.exec(name);
  if (inVenue) {
    const start = inVenue.index + inVenue[0].length - inVenue[1].length;
    const rest = `${name.slice(0, start)} ${name.slice(start + inVenue[1].length)}`.replace(/\s{2,}/g, " ").replace(EDGE_SEPARATORS, "").trim();
    return { venue: rest, room: tidy(inVenue[1]) };
  }
  const inAddress = ADDRESS_ROOM.exec(address ?? "");
  return { venue: name, room: inAddress ? tidy(inAddress[1]) : null };
}

/** "OCEAN 8" -> "Ocean 8", "rm. 12" -> "Rm. 12"; a mixed-case value is kept as written. */
function tidy(unit: string): string {
  const clean = unit.replace(/\s+/g, " ").trim();
  const isOneCase = clean === clean.toUpperCase() || clean === clean.toLowerCase();
  return isOneCase ? clean.replace(/^([A-Za-z])([A-Za-z.]*)/, (_, first: string, rest: string) => `${first.toUpperCase()}${rest.toLowerCase()}`) : clean;
}
