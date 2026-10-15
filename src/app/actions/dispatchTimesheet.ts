"use server";

import { randomBytes } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { interpreters, offers, requests, timesheets } from "@/db/schema";
import { sendTimesheetEmail } from "@/lib/timesheetEmail";
import { hashToken } from "@/lib/timesheetToken";
import { getIanaZone, resolveRequestTimes } from "@/utils/timezone";

const TOKEN_TTL_DAYS = 7;
const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

const dispatchSchema = z.object({
  requestId: z.string().min(1),
  interpreterId: z.string().min(1),
});

export type DispatchTimesheetResult =
  | { success: true; message: string }
  | { success: false; error: string };

interface LooseData {
  details?: { timeZone?: string; timezone?: string; format?: string };
  timeZone?: string;
  timezone?: string;
  format?: string;
}

const fail = (error: string): DispatchTimesheetResult => ({ success: false, error });

const isUuid = (value: string): boolean => z.string().uuid().safeParse(value).success;

export async function dispatchTimesheet(input: z.input<typeof dispatchSchema>): Promise<DispatchTimesheetResult> {
  try {
    return await runDispatch(input);
  } catch (err) {
    // Log only the error class/code; messages can embed row data.
    const code = (err as { code?: string } | null)?.code ?? "unknown";
    console.error(`[dispatchTimesheet] failed (code: ${code})`);
    return fail("Could not send the timesheet request. Please try again.");
  }
}

async function runDispatch(input: z.input<typeof dispatchSchema>): Promise<DispatchTimesheetResult> {
  const parsed = dispatchSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");
  const { requestId } = parsed.data;
  let { interpreterId } = parsed.data;

  // Postgres uuid columns reject any other string with a hard error, so check first.
  if (!isUuid(requestId)) return fail("This request has no database record, so a timesheet can't be sent.");

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId)).limit(1);
  if (!request) return fail("Request not found.");

  // The UI can pass a placeholder (e.g. "assigned-interpreter-1") when a booking has no matching offer row.
  // In that case fall back to the request's accepted offers, but only when that is unambiguous.
  if (!isUuid(interpreterId)) {
    const accepted = await db
      .select({ interpreterId: offers.interpreterId })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, "accepted")));
    const distinct = Array.from(new Set(accepted.map((o) => o.interpreterId)));
    if (distinct.length !== 1) {
      return fail("Couldn't identify the assigned interpreter. Re-assign the interpreter and try again.");
    }
    interpreterId = distinct[0];
  }

  // The interpreter must hold an accepted booking on this request; a client-supplied pair is not enough.
  const [booking] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId), eq(offers.status, "accepted")))
    .limit(1);
  if (!booking) return fail("This interpreter is not assigned to the request.");

  const [interpreter] = await db
    .select({ name: interpreters.name, email: interpreters.email })
    .from(interpreters)
    .where(eq(interpreters.id, interpreterId))
    .limit(1);
  if (!interpreter?.email) return fail("The interpreter has no email address on file.");

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [existing] = await db
    .select({ id: timesheets.id, status: timesheets.status, updatedAt: timesheets.updatedAt })
    .from(timesheets)
    .where(and(eq(timesheets.requestId, requestId), eq(timesheets.interpreterId, interpreterId)))
    .orderBy(desc(timesheets.createdAt))
    .limit(1);

  if (existing && (existing.status === "submitted" || existing.status === "approved")) {
    return fail("A timesheet has already been submitted for this interpreter.");
  }

  if (existing?.status === "pending" && now.getTime() - existing.updatedAt.getTime() < RESEND_COOLDOWN_MS) {
    return fail("A timesheet link was just sent. Please wait a couple of minutes before resending.");
  }

  if (existing) {
    // Pending or rejected: rotate the token so any previously emailed link stops working.
    await db
      .update(timesheets)
      .set({ tokenHash, tokenExpiresAt, status: "pending", updatedAt: now })
      .where(eq(timesheets.id, existing.id));
  } else {
    await db.insert(timesheets).values({ requestId, interpreterId, tokenHash, tokenExpiresAt, status: "pending" });
  }

  const data = (request.data ?? {}) as unknown as LooseData;
  const zone = getIanaZone(data.details?.timeZone ?? data.details?.timezone ?? data.timeZone ?? data.timezone);
  const { startsAt } = resolveRequestTimes({ createdAt: request.createdAt, data: request.data });
  const isVirtual = (data.details?.format ?? data.format) === "Virtual";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    await sendTimesheetEmail({
      to: interpreter.email,
      interpreterName: interpreter.name,
      dateLabel: formatInTimeZone(startsAt, zone, "MMMM d, yyyy"),
      formatLabel: isVirtual ? "Virtual" : "On-site",
      link: `${baseUrl}/timesheet/${rawToken}`,
      expiryDays: TOKEN_TTL_DAYS,
    });
  } catch {
    return fail("The email could not be sent. Please try again.");
  }

  revalidatePath(`/requests/${requestId}`);
  return { success: true, message: `Timesheet request emailed to ${interpreter.name}.` };
}
