import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireRole } from "@/lib/auth/guards";
import { logError } from "@/lib/logError";
import { positionIdSchema } from "@/lib/validation/position";
import { generateVerificationPdf } from "@/lib/verificationPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  requestId: z.string().uuid(),
  position: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).pipe(positionIdSchema),
});

/**
 * The Independent Contractor Invoice (verification PDF) for one position of a non-state job, for AGENCY STAFF ONLY. It holds the
 * participant's name and the signatures, so it is never cached, never emailed, and the audit row carries ids only. Anything that is
 * not signed in as agency gets a bare 401; an unknown job, a state job and a position without hours all get the same bare 404, so
 * ids cannot be probed. A sign-off whose picture cannot be read is a 502: the PDF is never produced with it silently missing.
 */
export async function GET(_req: Request, { params }: { params: { requestId: string; position: string } }) {
  let session;
  try {
    session = await requireRole("agency");
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const ids = paramsSchema.safeParse(params);
  if (!ids.success) return new NextResponse(null, { status: 404 });
  const { requestId, position } = ids.data;

  try {
    const outcome = await generateVerificationPdf(requestId, position);
    if (!outcome.ok) {
      return outcome.reason === "signature_unavailable"
        ? NextResponse.json({ error: "The on-site signature could not be read." }, { status: 502, headers: { "Cache-Control": "private, no-store" } })
        : new NextResponse(null, { status: 404 });
    }
    await writeAuditLog({
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      action: "verification_pdf_downloaded",
      details: `requestId=${requestId}; position=${position}`,
    });
    const body = Buffer.from(outcome.bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // The name carries no participant or interpreter details.
        "Content-Disposition": `attachment; filename="invoice-${requestId.slice(0, 8)}-position-${position}.pdf"`,
        "Content-Length": String(body.length),
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    logError("GET /api/verification-pdf/[requestId]/[position]", err);
    return new NextResponse(null, { status: 500 });
  }
}
