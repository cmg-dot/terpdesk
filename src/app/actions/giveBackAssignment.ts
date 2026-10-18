"use server";

import { requireInterpreter, FORBIDDEN } from "@/lib/auth/guards";
import { db } from "@/db";
import { requests, offers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function giveBackAssignment(offerId: string, requestId: string, reason: string) {
  const { interpreterId } = await requireInterpreter();
  const [ownOffer] = await db
    .select({ id: offers.id })
    .from(offers)
    .where(and(eq(offers.id, offerId), eq(offers.requestId, requestId), eq(offers.interpreterId, interpreterId)))
    .limit(1);
  if (!ownOffer) throw new Error(FORBIDDEN);

  await db.transaction(async (tx) => {
    // 1. Update offer to 'returned'
    await tx.update(offers)
      .set({ status: 'returned', updatedAt: new Date() })
      .where(eq(offers.id, offerId));

    // 2. Lookup request data to find position
    const [existing] = await tx.select().from(requests).where(eq(requests.id, requestId));
    const existingData = (existing?.data as any) || {};
    const offerPositions = existingData.offerPositions || {};
    const posIdx = offerPositions[offerId] || 1;

    const updatedSlotReplacements = {
      ...(existingData.slotReplacements || {}),
      [posIdx]: true
    };

    // 3. Update request to 'Needs replacement'
    await tx.update(requests)
      .set({ 
        status: 'Needs replacement',
        data: {
          ...existingData,
          slotReplacements: updatedSlotReplacements
        },
        updatedAt: new Date() 
      })
      .where(eq(requests.id, requestId));
  });

  // Revalidate routes to instantly update UI
  revalidatePath('/jobs');
  revalidatePath('/interpreter-home');
  revalidatePath('/dashboard');
  revalidatePath(`/requests/${requestId}`);
  revalidatePath('/requests');
}
