"use server";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/requestActivity";

const cancelSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
  clientRequested: z.boolean().default(false),
});

export async function cancelRequest(id: string, reason?: string, clientRequested: boolean = false) {
  await requireRole("agency");
  const parsed = cancelSchema.parse({ id, reason, clientRequested });

  const [updated] = await db.update(requests)
    .set({
      status: 'Cancelled',
      canceledAt: new Date(),
      cancelReason: parsed.reason || null,
      clientRequestedCancellation: parsed.clientRequested,
      updatedAt: new Date(),
    })
    .where(eq(requests.id, parsed.id))
    .returning();

  // The reason is internal, so the shared entry never includes it.
  if (updated) await logActivity({ requestId: parsed.id, audience: "shared", kind: "cancelled", message: parsed.clientRequested ? "Appointment cancelled (client request)" : "Appointment cancelled", actorLabel: "Agency staff" });

  revalidatePath(`/requests/${parsed.id}`);
  revalidatePath('/dashboard');
  revalidatePath('/requests');
  revalidatePath('/calendar');

  return updated;
}
