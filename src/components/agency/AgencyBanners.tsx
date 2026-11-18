"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, MessageCircleQuestion, X } from "lucide-react";
import { dismissAgencyBanner, getMyAgencyBanners } from "@/app/actions/agencyBanners";
import type { AgencyBanner } from "@/app/actions/agencyBanners";

/** How often an open, visible agency page checks for new notices. */
const POLL_MS = 30_000;

const STYLE = {
  offer_accepted: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CalendarCheck, iconClass: "text-emerald-700", open: "Open Staffing" },
  offer_question: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: MessageCircleQuestion, iconClass: "text-amber-700", open: "Read the question" },
} as const;

/**
 * Top of every agency page, full width, built like the interpreter's schedule banner: each offer an interpreter accepted and each
 * question they asked, until this staff member opens it (which also closes it and goes to the job) or closes it with ×. Kari and
 * Josie each close their own. Up to three show; "+N more" opens the bell, which keeps every notice. Checked on every page change,
 * when the window regains focus and every 30 s while the tab is visible.
 */
export function AgencyBanners() {
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<AgencyBanner[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    const next = await getMyAgencyBanners().catch(() => null);
    if (!next) return;
    setItems(next.items);
    setTotal(next.total);
  }, []);

  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(onFocus, POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((n) => Math.max(0, n - 1));
    await dismissAgencyBanner(id).catch(() => undefined);
    void load();
  };

  const open = (item: AgencyBanner) => {
    void dismiss(item.id);
    if (item.href) router.push(item.href);
  };

  if (items.length === 0) return null;
  const more = total - items.length;
  return (
    <div className="mb-6 space-y-2" data-agency-banners="" aria-live="polite">
      {items.map((item) => {
        const style = STYLE[item.kind];
        const Icon = style.icon;
        return (
          <div key={item.id} role="status" data-agency-banner={item.kind} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${style.box}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <button type="button" onClick={() => open(item)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-0.5 block leading-relaxed opacity-90">{item.message}</span>
              {item.href && <span className="mt-1 inline-block font-medium underline underline-offset-2">{style.open}</span>}
            </button>
            <button type="button" onClick={() => void dismiss(item.id)} aria-label={`Dismiss: ${item.title}`} className="rounded-full p-1 opacity-70 transition-opacity hover:opacity-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      {more > 0 && (
        <button
          type="button"
          onClick={() => document.querySelector<HTMLButtonElement>("[data-notification-bell]")?.click()}
          className="text-xs font-medium text-[var(--sage)] underline underline-offset-2 hover:text-[var(--ink)]"
        >
          +{more} more in notifications
        </button>
      )}
    </div>
  );
}
