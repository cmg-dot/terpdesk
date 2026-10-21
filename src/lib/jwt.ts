import jwt, { type SignOptions } from "jsonwebtoken";
import { getAuthSecret } from "@/lib/auth/secret";

export interface OfferTokenPayload {
  interpreterId: string;
  requestId: string;
  positionNumber?: number;
  /**
   * The exact offer this link was sent for. When present, the link only works for THAT offer, so an older email stops
   * working once the offer is replaced (e.g. the request was edited and re-offered). Links from before this field
   * existed have none and keep working the old way until they expire.
   */
  offerId?: string;
}

/**
 * Secret for the zero-login Accept / Decline links.
 *
 * Uses JWT_SECRET when set (preferred: a long random value, separate from the sign-in secret). Otherwise it falls
 * back to the NextAuth secret, which production must have anyway. There is deliberately NO hard-coded default: with
 * neither secret, links can't be created or accepted, because a secret written in the source code would let anyone
 * who has seen it forge Accept / Decline links. Local development gets getAuthSecret()'s dev-only value.
 *
 * Tokens that share this secret are told apart by audience: offer tokens carry none, and verifyOfferToken rejects any
 * token that has one (e.g. the job-details link), so one kind can never stand in for the other.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || getAuthSecret();
  if (!secret) {
    throw new Error("No signing secret is configured. Set JWT_SECRET (or NEXTAUTH_SECRET) in the environment.");
  }
  return secret;
}

export function generateOfferToken(
  payload: OfferTokenPayload,
  expiresIn: string = "48h"
): string {
  const secret = getJwtSecret();
  const options: SignOptions = {
    expiresIn: expiresIn as unknown as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, secret, options);
}

export function verifyOfferToken(token: string): OfferTokenPayload | null {
  if (!token || typeof token !== "string") return null;

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    // Fail closed: with no secret, no link is valid.
    console.error("[jwt] offer links are disabled: no signing secret is configured");
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret);
    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const raw = decoded as Record<string, unknown>;

    // Any audience means it was issued for something else (e.g. the job-details page).
    if (raw.aud !== undefined) return null;

    if (
      typeof raw.interpreterId !== "string" ||
      typeof raw.requestId !== "string" ||
      !raw.interpreterId ||
      !raw.requestId
    ) {
      return null;
    }

    const payload: OfferTokenPayload = {
      interpreterId: raw.interpreterId,
      requestId: raw.requestId,
    };

    if (typeof raw.positionNumber === "number" && !Number.isNaN(raw.positionNumber)) {
      payload.positionNumber = raw.positionNumber;
    }
    if (typeof raw.offerId === "string" && raw.offerId) {
      payload.offerId = raw.offerId;
    }

    return payload;
  } catch {
    return null;
  }
}
