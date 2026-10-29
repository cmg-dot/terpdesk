import { NextResponse } from "next/server";
import { logError } from "@/lib/logError";
import { parseSesNotification, storeInboxEmail } from "@/lib/sesInbox";
import { isSnsUrl, snsMessageSchema, verifySnsSignature } from "@/lib/snsVerify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAG = "SES Inbox Webhook";
const reply = (status: number, body: Record<string, unknown> = {}) => NextResponse.json(body, { status });

/**
 * AWS SES -> SNS -> here: mail sent to the agency's intake address is stored in agency_inbox for the in-app inbox.
 *
 * Open to the internet by necessity (SNS cannot send an API key), so a request is accepted only when ALL of these hold:
 *  - it is a well-formed SNS message from the one topic in SES_INBOX_TOPIC_ARN (fails closed when that is not set);
 *  - its signature verifies against a certificate hosted by SNS.
 * Anything else gets a bare 4xx. A repeat of an email already stored (same Message-ID) answers 200 and writes nothing.
 * A failure to store answers 500 so SNS retries it. HIPAA: the sender, subject and body are never logged.
 */
export async function POST(req: Request) {
  try {
    const expectedTopic = process.env.SES_INBOX_TOPIC_ARN?.trim();
    if (!expectedTopic) {
      console.error(`[${TAG}] SES_INBOX_TOPIC_ARN is not set — rejecting request.`);
      return reply(500, { success: false, error: "Webhook is not configured." });
    }

    // SNS posts the JSON with a text/plain content type, so the body is read as text.
    let json: unknown;
    try {
      json = JSON.parse(await req.text());
    } catch {
      return reply(400, { success: false });
    }
    const parsed = snsMessageSchema.safeParse(json);
    if (!parsed.success) return reply(400, { success: false });
    const message = parsed.data;

    if (message.TopicArn !== expectedTopic || !(await verifySnsSignature(message))) {
      console.warn(`[${TAG}] Rejected a message that is not from the configured SNS topic or has a bad signature.`);
      return reply(403, { success: false });
    }

    if (message.Type === "SubscriptionConfirmation") {
      // Confirms the subscription once, only to a genuine SNS address (the message is already verified above).
      if (!message.SubscribeURL || !isSnsUrl(message.SubscribeURL)) return reply(400, { success: false });
      const res = await fetch(message.SubscribeURL, { signal: AbortSignal.timeout(5000) });
      console.log(`[${TAG}] Subscription confirmation answered`, { status: res.status });
      return reply(res.ok ? 200 : 502, { success: res.ok });
    }
    if (message.Type === "UnsubscribeConfirmation") return reply(200, { success: true });

    const email = await parseSesNotification(message.Message);
    if (!email) {
      console.log(`[${TAG}] Notification ignored (not a storable inbound email).`);
      return reply(200, { success: true, outcome: "ignored" });
    }
    const outcome = await storeInboxEmail(email);
    console.log(`[${TAG}] Email ${outcome}`);
    return reply(200, { success: true, outcome });
  } catch (error) {
    // logError never prints bound query parameters (which would hold the whole email).
    logError(TAG, error);
    return reply(500, { success: false });
  }
}
