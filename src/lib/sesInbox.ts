import { createHash } from "node:crypto";
import { simpleParser } from "mailparser";
import { z } from "zod";
import { db } from "@/db";
import { agencyInbox } from "@/db/schema";
import type { InsertAgencyInbox } from "@/db/schema";
import { DEFAULT_AGENCY_ID } from "@/lib/agency";

/**
 * Turns an AWS SES "Received" notification (the JSON inside an SNS message) into an agency_inbox row.
 * SES puts the whole raw email in `content` for emails up to 150 KB; larger ones arrive as metadata only.
 *
 * HIPAA: nothing from the email (sender, subject, body) is ever logged here.
 * SERVER ONLY.
 */

const MAX_TEXT = 200_000;
const MAX_HTML = 400_000;
const MAX_SUBJECT = 998;
const MAX_ADDRESS = 320;
const MAX_NAME = 255;
export const OVERSIZE_NOTICE = "This message was too large to be shown here. Open it in the original mailbox.";

const sesNotificationSchema = z.object({
  notificationType: z.string().optional(),
  mail: z.object({
    timestamp: z.string().optional(),
    source: z.string().optional(),
    commonHeaders: z
      .object({ from: z.array(z.string()).optional(), subject: z.string().optional(), messageId: z.string().optional(), date: z.string().optional() })
      .optional(),
  }),
  receipt: z.object({ action: z.object({ encoding: z.string().optional() }).optional() }).optional(),
  content: z.string().optional(),
});

export type ParsedInboxEmail = Omit<InsertAgencyInbox, "id" | "isRead">;

const clip = (value: string | undefined | null, max: number): string => (value ?? "").slice(0, max);
const toDate = (value: string | Date | undefined | null): Date | null => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** "<abc@host>" -> "abc@host", so the same id written with or without brackets is one id. */
const bareMessageId = (value: string | undefined | null): string => (value ?? "").trim().replace(/^<|>$/g, "").trim();

/** "Name <a@b.com>" or "a@b.com" from a raw header value. */
function addressFromHeader(raw: string | undefined): { address: string; name: string | null } | null {
  if (!raw) return null;
  const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (angle) return { address: angle[2], name: angle[1].trim() || null };
  const bare = raw.trim().match(/^[^<>\s]+@[^<>\s]+$/);
  return bare ? { address: bare[0], name: null } : null;
}

/** The row to store, or null when the notification is not an inbound email we can store (wrong type, no sender). */
export async function parseSesNotification(messageJson: string): Promise<ParsedInboxEmail | null> {
  let json: unknown;
  try {
    json = JSON.parse(messageJson);
  } catch {
    return null;
  }
  const parsed = sesNotificationSchema.safeParse(json);
  if (!parsed.success) return null;
  const { mail, receipt, content, notificationType } = parsed.data;
  if (notificationType && notificationType !== "Received") return null;

  const headers = mail.commonHeaders;
  const raw = content ? Buffer.from(content, receipt?.action?.encoding?.toUpperCase() === "BASE64" ? "base64" : "utf8") : null;
  const email = raw ? await simpleParser(raw) : null;

  const from = email?.from?.value[0];
  const fallbackFrom = addressFromHeader(headers?.from?.[0]) ?? addressFromHeader(mail.source);
  const senderEmail = clip(from?.address || fallbackFrom?.address, MAX_ADDRESS).trim().toLowerCase();
  if (!senderEmail) return null;

  const subject = clip(email?.subject ?? headers?.subject, MAX_SUBJECT);
  const bodyText = raw ? clip(email?.text, MAX_TEXT) : OVERSIZE_NOTICE;
  const html = email && typeof email.html === "string" ? clip(email.html, MAX_HTML) : "";
  const receivedAt = toDate(mail.timestamp) ?? toDate(email?.date) ?? toDate(headers?.date) ?? new Date();

  // The Message-ID header identifies the email itself, so a copy forwarded twice has the same id. An email without one
  // is identified by a fingerprint of what it says and when it was sent.
  const messageId =
    bareMessageId(email?.messageId ?? headers?.messageId) ||
    `no-id:${createHash("sha256").update(`${senderEmail}\n${subject}\n${receivedAt.toISOString()}\n${bodyText}`).digest("hex")}`;

  return {
    agencyId: DEFAULT_AGENCY_ID,
    senderEmail,
    senderName: clip(from?.name || fallbackFrom?.name, MAX_NAME).trim() || null,
    subject,
    bodyText,
    bodyHtml: html || null,
    messageId: clip(messageId, 998),
    receivedAt,
  };
}

/** Inserts the email once. A repeat of the same Message-ID is dropped silently: no error, nothing written. */
export async function storeInboxEmail(email: ParsedInboxEmail): Promise<"stored" | "duplicate"> {
  const inserted = await db
    .insert(agencyInbox)
    .values(email)
    .onConflictDoNothing({ target: agencyInbox.messageId })
    .returning({ id: agencyInbox.id });
  return inserted.length > 0 ? "stored" : "duplicate";
}
