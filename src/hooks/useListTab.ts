"use client";

import { useState } from "react";

export type ListTab = "upcoming" | "past";

/**
 * The open Upcoming / Past tab of the Requests list. Each filter starts on Upcoming when it has jobs there, else on Past when that
 * has jobs, else on Upcoming. The pick is made once per filter, after the list has loaded, and kept: a refresh or the minute clock
 * never moves the person to the other tab, and a tab they click stays open until they choose another filter.
 */
export function useListTab(filter: string, counts: { upcoming: number; past: number }, loaded: boolean): [ListTab, (tab: ListTab) => void] {
  const [pick, setPick] = useState<{ filter: string; tab: ListTab } | null>(null);
  const auto: ListTab = counts.upcoming > 0 || counts.past === 0 ? "upcoming" : "past";
  // Adjusting state during render (React's pattern for "reset when an input changes"): React re-renders at once, with no effect.
  if (loaded && pick?.filter !== filter) setPick({ filter, tab: auto });
  const tab = pick?.filter === filter ? pick.tab : auto;
  return [tab, (next) => setPick({ filter, tab: next })];
}
