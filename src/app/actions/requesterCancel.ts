"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { confirmRequesterCancellation, dismissRequesterCancellation } from "@/lib/requesterCancel";

/** Problems are returned, not thrown: in production a thrown message is hidden from the browser. */
export type RequesterCancelResult = { success: true } | { success: false; error: string };

const idSchema = z.object({ requestId: z.string().uuid() });
const FAILED = "We could not do that. Please try again.";

async function staff() {
  try {
    const session = await requireRole("agency");
    return { label: session.user.name ?? "Agency staff", userId: session.user.id ?? null, userEmail: session.user.email ?? null };
  } catch {
    return null;
  }
}

/** The banner's "Confirm Cancellation": cancels the job as a client request (a requester's email asked for it). Agency only. */
export async function confirmCancellationRequest(input: unknown): Promise<RequesterCancelResult> {
  const actor = await staff();
  if (!actor) return { success: false, error: NOT_ALLOWED_MESSAGE };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const result = await confirmRequesterCancellation(parsed.data.requestId, actor);
  if (result.outcome === "cancelled" || result.outcome === "already_cancelled") return { success: true };
  return { success: false, error: result.outcome === "not_flagged" ? "That cancellation request is no longer waiting for a decision." : FAILED };
}

/** The banner's "Dismiss": the email did not mean a cancellation. Nothing else changes. Agency only. */
export async function dismissCancellationRequest(input: unknown): Promise<RequesterCancelResult> {
  const actor = await staff();
  if (!actor) return { success: false, error: NOT_ALLOWED_MESSAGE };
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: FAILED };
  const result = await dismissRequesterCancellation(parsed.data.requestId, actor);
  if (result.outcome === "failed") return { success: false, error: FAILED };
  revalidatePath(`/requests/${parsed.data.requestId}`);
  return { success: true };
}
