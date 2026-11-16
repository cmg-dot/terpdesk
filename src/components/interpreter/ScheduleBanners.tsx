"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, CalendarX, X } from "lucide-react";
import { dismissScheduleBanner, getMyScheduleBanners } from "@/app/actions/scheduleBanners";
import type { ScheduleBanner } from "@/app/actions/scheduleBanners";

const STYLE = {
  booking_added: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CalendarPlus, iconClass: "text-emerald-700" },
  booking_cancelled: { box: "border-red-200 bg-red-50 text-red-950", icon: CalendarX, iconClass: "text-red-700" },
} as const;

/**
 * Top of the interpreter's Home and Jobs: each recent change the agency made to their schedule (a booking added, or one cancelled),
 * until they close it. The same notice stays in the bell. Shows nothing while loading or on error.
 */
export function ScheduleBanners() {
  const [items, setItems] = useState<ScheduleBanner[]>([]);

  useEffect(() => {
    let live = true;
    getMyScheduleBanners()
      .then((rows) => { if (live) setItems(rows); })
      .catch(() => undefined);
    return () => { live = false; };
  }, []);

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    void dismissScheduleBanner(id);
  };

  if (items.length === 0) return null;
  return (
    <div className="mb-6 space-y-2" data-schedule-banners="">
      {items.map((item) => {
        const style = STYLE[item.kind];
        const Icon = style.icon;
        return (
          <div key={item.id} role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${style.box}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5 leading-relaxed opacity-90">{item.message}</p>
              {item.href && (
                <Link href={item.href} className="mt-1 inline-block font-medium underline underline-offset-2">
                  {item.kind === "booking_added" ? "Open the job" : "Open your jobs"}
                </Link>
              )}
            </div>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="rounded-full p-1 opacity-70 transition-opacity hover:opacity-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
