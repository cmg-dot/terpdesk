"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface AnimatedPaginatedListProps<T> {
  items: T[];
  itemsPerPage?: number;
  renderItem: (item: T, index: number) => ReactNode;
  /** Stable key per item; falls back to the index within the page. */
  getKey?: (item: T, index: number) => string | number;
  /** Classes for the element that wraps the current page of items (e.g. spacing or a grid). */
  className?: string;
  /** Use "ul" when `renderItem` returns <li> elements. */
  as?: "div" | "ul";
}

type PageToken = number | "gap-start" | "gap-end";

/** Page numbers with ellipses, e.g. 1 … 4 5 6 … 12. */
const buildPageTokens = (current: number, total: number): PageToken[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages)
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) tokens.push(i < sorted.length / 2 ? "gap-start" : "gap-end");
    tokens.push(p);
  });
  return tokens;
};

const buttonBase =
  "min-w-[2.25rem] h-9 px-3 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/**
 * Client-side pagination with a fade/slide transition between pages.
 * State is local to this component, so the host page does not need to change how it renders.
 */
export const AnimatedPaginatedList = <T,>({
  items,
  itemsPerPage = 5,
  renderItem,
  getKey,
  className,
  as = "div",
}: AnimatedPaginatedListProps<T>) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  // Filters or live updates can shrink the list; never sit on a page that no longer exists.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (items.length === 0) return null;

  const current = Math.min(page, totalPages);
  const start = (current - 1) * itemsPerPage;
  const visible = items.slice(start, start + itemsPerPage);
  const MotionTag = as === "ul" ? motion.ul : motion.div;

  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <MotionTag
          key={current}
          className={className}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {visible.map((item, i) => (
            // Wrapped in a fragment so the caller's element keeps its own key semantics.
            <FragmentWithKey key={getKey ? getKey(item, start + i) : start + i}>
              {renderItem(item, start + i)}
            </FragmentWithKey>
          ))}
        </MotionTag>
      </AnimatePresence>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 1}
            className={`${buttonBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
          >
            Prev
          </button>

          {buildPageTokens(current, totalPages).map((token) =>
            typeof token === "number" ? (
              <button
                key={token}
                type="button"
                onClick={() => setPage(token)}
                aria-current={token === current ? "page" : undefined}
                className={`${buttonBase} ${
                  token === current
                    ? "bg-[#163C3A] text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {token}
              </button>
            ) : (
              <span key={token} className="px-1 text-gray-400" aria-hidden="true">
                …
              </span>
            ),
          )}

          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current === totalPages}
            className={`${buttonBase} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50`}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
};

const FragmentWithKey = ({ children }: { children: ReactNode }) => <>{children}</>;
