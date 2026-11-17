/**
 * Is an in-person appointment in King County (so State and HCA work is paid and billed at the interpreter's King County rate)?
 * Read from the appointment's address text: a ZIP code decides first (it settles the split cities, such as Bothell 98011 in King
 * County but 98012 / 98021 in Snohomish), else the city named in the address. Staff can override the answer on the job. Pure.
 */

/** King County ZIP codes outside the 981xx block (every 981xx code is King County: Seattle and its neighbours). */
const KING_ZIPS = new Set([
  "98001", "98002", "98003", "98004", "98005", "98006", "98007", "98008", "98009", "98010", "98011", "98013", "98014", "98015",
  "98019", "98022", "98023", "98024", "98025", "98027", "98028", "98029", "98030", "98031", "98032", "98033", "98034", "98035",
  "98038", "98039", "98040", "98041", "98042", "98045", "98047", "98050", "98051", "98052", "98053", "98055", "98056", "98057",
  "98058", "98059", "98062", "98063", "98064", "98065", "98070", "98071", "98072", "98073", "98074", "98075", "98077", "98083",
  "98089", "98092", "98093", "98224", "98288",
]);

/** Cities and communities in King County (incorporated, plus the unincorporated places addresses commonly name). */
const KING_CITIES = new Set([
  "algona", "auburn", "beaux arts", "beaux arts village", "bellevue", "black diamond", "bothell", "burien", "carnation", "clyde hill",
  "covington", "des moines", "duvall", "enumclaw", "federal way", "hunts point", "issaquah", "kenmore", "kent", "kirkland",
  "lake forest park", "maple valley", "medina", "mercer island", "newcastle", "normandy park", "north bend", "pacific", "redmond",
  "renton", "sammamish", "seatac", "sea-tac", "seattle", "shoreline", "skykomish", "snoqualmie", "tukwila", "woodinville",
  "yarrow point", "vashon", "vashon island", "white center", "fall city", "hobart", "ravensdale", "preston", "baring",
  "cottage lake", "skyway", "boulevard park",
]);

export interface KingCountyAnswer {
  kingCounty: boolean;
  /** What decided it: the ZIP code or the city, as found; null when the address names neither. */
  matched: string | null;
}

const isKingZip = (zip: string): boolean => zip.startsWith("981") || KING_ZIPS.has(zip);

/** A comma-separated part of an address, without a trailing "WA" / "Washington" / ZIP: "Kent WA 98032" -> "kent". */
const placePart = (part: string): string =>
  part
    .toLowerCase()
    .replace(/\b\d{5}(-\d{4})?\b/g, "")
    .replace(/\b(wa|washington)\b\.?/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Reads the address texts in order (street address first, then venue / location lines). */
export function detectKingCounty(texts: readonly (string | null | undefined)[]): KingCountyAnswer {
  const lines = texts.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  for (const line of lines) {
    // The last WA ZIP on the line is the address's own (a suite number never has five digits starting 98/99).
    const zips = line.match(/\b9[89]\d{3}\b/g);
    if (zips && zips.length > 0) {
      const zip = zips[zips.length - 1];
      return { kingCounty: isKingZip(zip), matched: zip };
    }
  }
  for (const line of lines) {
    for (const part of line.split(/[,\n·|]/)) {
      const place = placePart(part);
      if (place && KING_CITIES.has(place)) return { kingCounty: true, matched: part.trim() };
    }
  }
  return { kingCounty: false, matched: null };
}
