/**
 * A short fingerprint of who holds which offer on a job (each offer's id and answer, in a fixed order). Staffing's availability map is
 * read again whenever it changes: an interpreter who accepted, declined, was removed or let an offer expire changes what the map should
 * say about them. Pure.
 */
export function offersFitKey(offers: unknown): string {
  if (!Array.isArray(offers)) return "";
  return offers
    .map((raw) => {
      const o = (raw ?? {}) as { id?: unknown; status?: unknown; state?: unknown };
      return `${String(o.id ?? "")}:${String(o.status ?? o.state ?? "")}`;
    })
    .sort()
    .join(",");
}
