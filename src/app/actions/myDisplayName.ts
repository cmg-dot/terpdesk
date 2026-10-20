"use server";

import { requireInterpreter } from "@/lib/auth/guards";
import { getInterpreterDisplayName } from "@/lib/displayName";
import { logError } from "@/lib/logError";

/**
 * The signed-in interpreter's display name (preferred name, else account name). Null when the login is not linked
 * to a profile yet or the lookup fails; callers then fall back to the session's account name.
 */
export async function getMyDisplayName(): Promise<string | null> {
  let interpreterId: string;
  try {
    ({ interpreterId } = await requireInterpreter());
  } catch {
    return null;
  }
  try {
    return await getInterpreterDisplayName(interpreterId);
  } catch (err) {
    logError("getMyDisplayName", err);
    return null;
  }
}
