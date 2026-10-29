import { createVerify } from "node:crypto";
import { z } from "zod";

/**
 * Verifies that an HTTP POST really came from Amazon SNS (https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html).
 * SNS cannot send an API key, so the signature is the only proof of origin for the SES inbox webhook.
 *
 * SERVER ONLY.
 */

export const snsMessageSchema = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]),
  MessageId: z.string().min(1),
  TopicArn: z.string().min(1),
  Timestamp: z.string().min(1),
  Message: z.string(),
  Signature: z.string().min(1),
  SignatureVersion: z.enum(["1", "2"]),
  SigningCertURL: z.string().url(),
  Subject: z.string().optional(),
  Token: z.string().optional(),
  SubscribeURL: z.string().url().optional(),
});

export type SnsMessage = z.infer<typeof snsMessageSchema>;

/** SNS endpoints (certificate and subscription-confirmation URLs) live only on sns.<region>.amazonaws.com. */
const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** True for an https URL on a genuine SNS host (no credentials, no custom port), so a forged message cannot aim us elsewhere. */
export function isSnsUrl(raw: string, requirePem = false): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    if (!SNS_HOST.test(url.hostname)) return false;
    return requirePem ? url.pathname.endsWith(".pem") : true;
  } catch {
    return false;
  }
}

/** The fields SNS signed, in the order it signed them, as "Name\nValue\n" pairs. */
export function stringToSign(m: SnsMessage): string {
  const fields: [string, string | undefined][] =
    m.Type === "Notification"
      ? [["Message", m.Message], ["MessageId", m.MessageId], ["Subject", m.Subject], ["Timestamp", m.Timestamp], ["TopicArn", m.TopicArn], ["Type", m.Type]]
      : [["Message", m.Message], ["MessageId", m.MessageId], ["SubscribeURL", m.SubscribeURL], ["Timestamp", m.Timestamp], ["Token", m.Token], ["TopicArn", m.TopicArn], ["Type", m.Type]];
  return fields.filter(([, value]) => value !== undefined).map(([name, value]) => `${name}\n${value}\n`).join("");
}

type CertFetcher = (url: string) => Promise<string>;

const certCache = new Map<string, string>();

const fetchCertificate: CertFetcher = async (url) => {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error("Could not fetch the SNS signing certificate.");
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
};

/** True only when the message's signature is valid for the certificate SNS names (which must be on an SNS host). */
export async function verifySnsSignature(m: SnsMessage, getCertificate: CertFetcher = fetchCertificate): Promise<boolean> {
  if (!isSnsUrl(m.SigningCertURL, true)) return false;
  try {
    const certificate = await getCertificate(m.SigningCertURL);
    const verifier = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
    verifier.update(stringToSign(m), "utf8");
    return verifier.verify(certificate, m.Signature, "base64");
  } catch {
    return false;
  }
}
