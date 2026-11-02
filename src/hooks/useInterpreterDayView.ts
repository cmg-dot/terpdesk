"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getInterpreterDayView } from "@/app/actions/getInterpreterDayView";
import type { InterpreterDayView } from "@/lib/interpreterDayView";

export interface InterpreterDayViewState {
  /** The last day that loaded. While the next day loads it stays, so the screen never flashes empty. */
  view: InterpreterDayView | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads one day of the Interpreter View whenever `date` (yyyy-MM-dd) changes. Answers that arrive out of order are
 * ignored, so quickly paging through days can never show an older day's data under a newer date.
 */
export const useInterpreterDayView = (date: string): InterpreterDayViewState => {
  const [view, setView] = useState<InterpreterDayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const load = useCallback(async (day: string) => {
    const ticket = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getInterpreterDayView({ date: day });
      if (ticket !== latest.current) return;
      if (result.success) setView(result.view);
      else setError(result.error);
    } catch {
      if (ticket === latest.current) setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  const reload = useCallback(() => void load(date), [date, load]);
  return { view, loading, error, reload };
};
