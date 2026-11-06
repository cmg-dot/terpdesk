"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DayIndex } from "@/lib/calendarDayIndex";
import type { SearchEntry } from "@/lib/calendarSearch";
import { parseDateKey } from "@/lib/dateTimePicker";

interface Options {
  entries: readonly SearchEntry[];
  /** True once the requests have arrived (a link can name a job before it has loaded). */
  loaded: boolean;
  index: DayIndex;
  goToDate: (dayKey: string) => void;
  /** Widens the status filter to "All appointments" when the job being pointed at is hidden by the current one. */
  showAll: () => void;
  /** Changes whenever the screen's content does, so the scroll is tried again for the new month, week or day. */
  viewKey: string;
}

export interface CalendarFocus {
  searchText: string;
  setSearchText: (text: string) => void;
  /** The job card that is pulsing right now (two seconds), or null. */
  highlightId: string | null;
  select: (entry: SearchEntry) => void;
  clear: () => void;
}

const PULSE_MS = 2000;
const LOOK_FRAMES = 40;

/**
 * What the calendar is pointing at: a search result the person picked, or the job named by the address
 * (/calendar?date=yyyy-MM-dd&jobId=…&srn=…). Both land the same way: go to the job's day, fill the search box, scroll the card
 * into view and pulse it for two seconds.
 */
export const useCalendarFocus = ({ entries, loaded, index, goToDate, showAll, viewKey }: Options): CalendarFocus => {
  const params = useSearchParams();
  const date = params?.get("date") ?? "";
  const jobId = params?.get("jobId") ?? "";
  const srn = params?.get("srn") ?? "";
  const [searchText, setSearchText] = useState("");
  const [highlight, setHighlight] = useState<{ id: string; token: number } | null>(null);
  const [pending, setPending] = useState<{ jobId: string; srn: string } | null>(null);
  const appliedLink = useRef("");
  const pulsed = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokens = useRef(0);

  const focusEntry = useCallback(
    (entry: SearchEntry) => {
      if (!index.get(entry.dayKey)?.some((card) => card.request.id === entry.id)) showAll();
      goToDate(entry.dayKey);
      tokens.current += 1;
      setHighlight({ id: entry.id, token: tokens.current });
    },
    [index, goToDate, showAll],
  );

  // The address is read once per distinct set of parameters: the date moves the calendar at once, the job waits for the data.
  useEffect(() => {
    const link = `${date}|${jobId}|${srn}`;
    if (link === "||" || appliedLink.current === link) return;
    appliedLink.current = link;
    if (parseDateKey(date)) goToDate(date);
    if (jobId || srn) setPending({ jobId, srn });
  }, [date, jobId, srn, goToDate]);

  useEffect(() => {
    if (!pending || !loaded) return;
    const entry = entries.find((e) => (pending.jobId !== "" && e.id === pending.jobId) || (pending.jobId === "" && pending.srn !== "" && e.srn === pending.srn));
    setSearchText(entry ? entry.srn ?? entry.title : pending.srn);
    if (entry) focusEntry(entry);
    setPending(null);
  }, [pending, loaded, entries, focusEntry]);

  // Scroll the highlighted card into view as soon as it is on screen, then let the pulse run its two seconds.
  useEffect(() => {
    if (!highlight || pulsed.current === highlight.token) return;
    let frame = 0;
    let tries = 0;
    const look = () => {
      const card = document.querySelector<HTMLElement>(`[data-job-id="${CSS.escape(highlight.id)}"]`);
      if (card) {
        pulsed.current = highlight.token;
        card.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setHighlight((now) => (now?.token === highlight.token ? null : now)), PULSE_MS);
      } else if (tries < LOOK_FRAMES) {
        tries += 1;
        frame = requestAnimationFrame(look);
      }
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [highlight, index, viewKey]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const select = useCallback(
    (entry: SearchEntry) => {
      setSearchText(entry.srn ?? entry.title);
      focusEntry(entry);
    },
    [focusEntry],
  );
  const clear = useCallback(() => {
    setSearchText("");
    setHighlight(null);
  }, []);

  return { searchText, setSearchText, highlightId: highlight?.id ?? null, select, clear };
};
