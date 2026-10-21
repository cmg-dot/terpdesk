import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { interpreters, offers, requests } from "@/db/schema";
import { hasRole } from "@/lib/auth/guards";
import { getBaseUrl } from "@/lib/baseUrl";
import { buildOfferEmail } from "@/lib/jobEmails";
import { summarizeJob } from "@/lib/jobSummary";
import { generateOfferToken } from "@/lib/jwt";
import { sendEmail } from "@/lib/timesheetEmail";

export const dynamic = "force-dynamic";

// `interpreterEmail` is still accepted from older callers but ignored: the address always comes from the database,
// so a tampered request cannot send an offer link to an arbitrary inbox.
const bodySchema = z.object({
  interpreterId: z.string().uuid(),
  requestId: z.string().uuid(),
  interpreterEmail: z.string().optional(),
  positionNumber: z.number().int().min(1).max(2).optional(),
});

/**
 * Emails a job offer with zero-login Accept / Decline links. Progressive disclosure: the email carries only the
 * restricted summary (reference, title, date and time, format, generic setting, role). Location, client, program,
 * prep notes and materials are shared after acceptance through the booking confirmation's secure link.
 */
export async function POST(req: Request) {
  if (!(await hasRole("agency"))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ success: false, error: "Invalid offer details." }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid offer details." }, { status: 400 });
  }

  try {
    const [request] = await db
      .select({ id: requests.id, title: requests.title, createdAt: requests.createdAt, data: requests.data })
      .from(requests)
      .where(eq(requests.id, body.requestId))
      .limit(1);
    if (!request) return NextResponse.json({ success: false, error: "This request no longer exists." }, { status: 404 });

    const [interpreter] = await db
      .select({ email: interpreters.email })
      .from(interpreters)
      .where(eq(interpreters.id, body.interpreterId))
      .limit(1);
    if (!interpreter?.email) {
      return NextResponse.json({ success: false, error: "This interpreter has no email address on file." }, { status: 400 });
    }

    // Bind the link to the offer that was just created (the newest pending one for this interpreter on this request).
    const [offer] = await db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, body.requestId), eq(offers.interpreterId, body.interpreterId), eq(offers.status, "pending")))
      .orderBy(desc(offers.createdAt))
      .limit(1);

    const token = generateOfferToken({
      interpreterId: body.interpreterId,
      requestId: body.requestId,
      ...(body.positionNumber ? { positionNumber: body.positionNumber } : {}),
      ...(offer ? { offerId: offer.id } : {}),
    });
    const appUrl = getBaseUrl();
    const acceptUrl = `${appUrl}/api/offers/response?token=${token}&action=accept`;
    const declineUrl = `${appUrl}/api/offers/response?token=${token}&action=decline`;

    const email = buildOfferEmail(summarizeJob(request, body.positionNumber), acceptUrl, declineUrl);
    await sendEmail(interpreter.email, email.subject, email.html, email.text);
    return NextResponse.json({ success: true });
  } catch {
    // Generic on purpose: SES errors can echo the recipient address.
    console.error("[Offer Dispatch] could not send the offer email");
    return NextResponse.json({ success: false, error: "We could not send the offer email. Please try again." }, { status: 500 });
  }
}
