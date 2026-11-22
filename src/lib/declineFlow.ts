/**
 * Declining an offer from the interpreter's Home card: the answer is a plain yes after "Decline this offer?", never a typed reason (a
 * free-text box could take a client's details). The only thing that can go wrong is a refusal from the server (the offer expired, was
 * withdrawn or was already answered), which arrives as an Error with its own words. Pure.
 */

export const DECLINE_FAILED = "We could not decline this offer. Please try again.";

export type DeclineResult = { ok: true } | { ok: false; error: string };

/** Runs the decline and turns a thrown refusal into the words the card shows. Never throws. */
export async function runDecline(decline: (offerId: string) => Promise<void>, offerId: string): Promise<DeclineResult> {
  try {
    await decline(offerId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message.trim() : "";
    return { ok: false, error: message || DECLINE_FAILED };
  }
}
