import { parseAcceptAnswers } from "@/lib/acceptAnswers";
import type { AcceptAnswersParse } from "@/lib/acceptAnswers";
import { verifyOfferToken } from "@/lib/jwt";
import { logError } from "@/lib/logError";
import { renderOfferConfirmPage } from "@/lib/offerConfirmPage";
import { resolveOfferLinkState } from "@/lib/offerLinkState";

/**
 * The email link's Accept: the confirm page's travel-time answer and availability note (lib/acceptAnswers.ts), read from the posted
 * form. Kept out of the route so it stays about recording the answer. SERVER ONLY.
 */

/** The answers in the posted form, checked. */
export function readAcceptAnswers(form: FormData): AcceptAnswersParse {
  const field = (name: string): string | undefined => {
    const value = form.get(name);
    return typeof value === "string" ? value : undefined;
  };
  return parseAcceptAnswers({ travel: field("travel"), travelHours: field("travelHours"), travelMinutes: field("travelMinutes"), availabilityNote: field("availabilityNote") });
}

/**
 * The confirm page again with the problem shown, while the offer is still open; null otherwise (the caller shows its "expired"
 * card). Nothing is written.
 */
export async function confirmPageWithProblem(token: string, problem: string): Promise<Response | null> {
  const payload = verifyOfferToken(token);
  if (!payload) return null;
  try {
    const state = await resolveOfferLinkState(payload);
    return state.kind === "pending" ? renderOfferConfirmPage({ token, action: "accept", summary: state.summary, error: problem }) : null;
  } catch (err) {
    logError("Offer Response answers", err);
    return null;
  }
}
