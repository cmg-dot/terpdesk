"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { availabilityShares } from "@/db/schema";
import { requireInterpreter } from "@/lib/auth/guards";
import { agencyIdSchema, readPermission } from "@/lib/agencyPermissions";
import { logError } from "@/lib/logError";
import type { ToggleResult } from "@/app/actions/toggleAvailability";

const schema = z.object({ agencyId: agencyIdSchema, enabled: z.boolean() });

/** "Allow this agency to auto-book me" on/off. Only allowed while sharing availability with that agency. */
export async function toggleAutoBook(input: z.input<typeof schema>): Promise<ToggleResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: "Verify your email to manage agency permissions." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { agencyId, enabled } = parsed.data;

  try {
    // Auto-book depends on sharing, and that is enforced here, not just by the disabled button.
    const current = await readPermission(agencyId, interpreterId);
    if (enabled && !current.sharesAvailability) {
      return { success: false, error: "Turn on 'Share my availability' for this agency first." };
    }

    await db
      .update(availabilityShares)
      .set({ allowsAutoBook: enabled })
      .where(and(eq(availabilityShares.agencyId, agencyId), eq(availabilityShares.interpreterId, interpreterId)));

    revalidatePath("/agencies");
    return { success: true, permission: await readPermission(agencyId, interpreterId) };
  } catch (err) {
    logError("toggleAutoBook", err);
    return { success: false, error: "Could not update this setting. Please try again." };
  }
}
