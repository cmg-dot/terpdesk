"use client";

import { useState } from "react";
import { addSlot, removeSlot } from "@/app/actions/staffingSlots";
import type { SlotActionResult } from "@/app/actions/staffingSlots";
import type { PositionId } from "@/lib/positions";

interface Args {
  requestId: string;
  /** Re-reads the job so the panel shows the new positions. */
  reload: () => Promise<void>;
  /** A short success notice. */
  toast: (message: string) => void;
}

/**
 * Adding and removing interpreter positions from the Staffing panel. The server decides (it refuses to remove a position that has
 * a booking or a waiting offer, and to go past 10); a refusal is kept in `error` for the panel to show as an alert. On success the
 * job is re-read, so the screen always shows what is saved.
 */
export function usePositionSlots({ requestId, reload, toast }: Args) {
  const [busy, setBusy] = useState<"add" | PositionId | null>(null);
  const [error, setError] = useState("");

  const run = async (who: "add" | PositionId, call: () => Promise<SlotActionResult>, done: string) => {
    if (busy !== null) return;
    setBusy(who);
    setError("");
    try {
      const result = await call();
      if (!result.success) {
        setError(result.error);
        return;
      }
      await reload();
      toast(done);
    } catch {
      setError("We could not change the interpreter positions. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    error,
    clearError: () => setError(""),
    add: () => run("add", () => addSlot({ requestId }), "Interpreter position added."),
    remove: (positionId: PositionId) => run(positionId, () => removeSlot({ requestId, positionId }), "Interpreter position removed."),
  };
}
