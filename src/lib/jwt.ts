import jwt, { type SignOptions } from "jsonwebtoken";

export interface OfferTokenPayload {
  interpreterId: string;
  requestId: string;
  positionNumber?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || "terpdesk_dev_jwt_secret_key_2026_secure";
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not defined");
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
  try {
    const secret = process.env.JWT_SECRET || "terpdesk_dev_jwt_secret_key_2026_secure";
    if (!secret || !token || typeof token !== "string") {
      return null;
    }

    const decoded = jwt.verify(token, secret);
    if (!decoded || typeof decoded !== "object") {
      return null;
    }

    const raw = decoded as Record<string, unknown>;

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

    return payload;
  } catch {
    return null;
  }
}
