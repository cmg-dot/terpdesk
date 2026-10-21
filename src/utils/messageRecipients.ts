/**
 * Who an agency message can go to: the interpreters currently booked on the request (accepted offers only, so
 * declined, given-back, withdrawn and pending offers never appear). Client-safe.
 */

export interface MessageRecipient {
  interpreterId: string;
  label: string;
}

interface OfferLike {
  interpreterId?: unknown;
  interpreterName?: unknown;
  status?: unknown;
  state?: unknown;
  positionIndex?: unknown;
}

export function bookedRecipients(offers: unknown): MessageRecipient[] {
  if (!Array.isArray(offers)) return [];
  const seen = new Set<string>();
  const out: MessageRecipient[] = [];
  for (const raw of offers as OfferLike[]) {
    const accepted = raw?.status === "accepted" || raw?.state === "accepted";
    if (!accepted || typeof raw.interpreterId !== "string" || seen.has(raw.interpreterId)) continue;
    seen.add(raw.interpreterId);
    const name = typeof raw.interpreterName === "string" && raw.interpreterName.trim() ? raw.interpreterName.trim() : "Interpreter";
    out.push({ interpreterId: raw.interpreterId, label: `${name} (Position ${raw.positionIndex === 2 ? 2 : 1})` });
  }
  return out;
}

/**
 * Default recipient: the booked interpreter who most recently asked a clarification question (the one usually being
 * replied to); otherwise the only booked interpreter; otherwise none, so the agency has to choose.
 */
export function defaultRecipient(recipients: MessageRecipient[], clarifications: unknown): string {
  const ids = new Set(recipients.map((r) => r.interpreterId));
  if (Array.isArray(clarifications)) {
    const latest = (clarifications as { interpreterId?: unknown; askedAt?: unknown }[])
      .filter((c) => typeof c?.interpreterId === "string" && ids.has(c.interpreterId) && typeof c.askedAt === "string")
      .sort((a, b) => new Date(String(b.askedAt)).getTime() - new Date(String(a.askedAt)).getTime())[0];
    if (latest) return String(latest.interpreterId);
  }
  return recipients.length === 1 ? recipients[0].interpreterId : "";
}
