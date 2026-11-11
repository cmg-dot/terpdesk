"use client";

import { useEffect, useRef } from "react";

/**
 * Which way the list moved: 1 when the page number went up, -1 when it went down, 0 for anything else (the first view, a change of
 * tab or filter, no change). Read while rendering the new page, so the old page can leave the way the new one arrives. `group` is
 * whatever makes two page numbers comparable (the status tab): a different group is not a step forward or back.
 */
export function usePageDirection(group: string, page: number): -1 | 0 | 1 {
  const previous = useRef({ group, page });
  const direction = previous.current.group === group ? Math.sign(page - previous.current.page) : 0;
  useEffect(() => {
    previous.current = { group, page };
  });
  return direction === 0 ? 0 : direction > 0 ? 1 : -1;
}
