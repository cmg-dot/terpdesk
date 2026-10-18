"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInterpreter } from "@/lib/auth/guards";
import { agencyIdSchema, writeSharing } from "@/lib/agencyPermissions";
import type { AgencyPermission } from "@/lib/agencyPermissionTypes";
import { logError } from "@/lib/logError";

const schema = z.object({ agencyId: agencyIdSchema, enabled: z.boolean() });

export type ToggleResult = { success: true; permission: AgencyPermission } | { success: false; error: string };

/** "Share my availability" on/off for one agency. Turning it off also turns auto-book off. */
export async function toggleAvailability(input: z.input<typeof schema>): Promise<ToggleResult> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return { success: false, error: "Verify your email to manage agency permissions." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  try {
    // The interpreter is always the signed-in one; the client only chooses the agency.
    const permission = await writeSharing(parsed.data.agencyId, interpreterId, parsed.data.enabled);
    revalidatePath("/agencies");
    return { success: true, permission };
  } catch (err) {
    logError("toggleAvailability", err);
    return { success: false, error: "Could not update this setting. Please try again." };
  }
}
