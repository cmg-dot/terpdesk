"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarCheck, Hourglass, MessageCircleQuestion, UserMinus, X } from "lucide-react";
import { dismissAgencyBanner, getMyAgencyBanners } from "@/app/actions/agencyBanners";
import type { AgencyBanner } from "@/app/actions/agencyBanners";
import { AnswerQuestionDialog } from "@/components/requests/AnswerQuestionDialog";
import { usePulseChange } from "@/hooks/usePulse";
import { parseQuestionHref } from "@/lib/clarificationThread";

/** The request (and question) an interpreter's-question notice is about; null for any other notice. */
const target = (item: AgencyBanner) => (item.kind === "offer_question" ? parseQuestionHref(item.href) : null);

const STYLE = {
  offer_accepted: { box: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: CalendarCheck, iconClass: "text-emerald-700", open: "Open Staffing" },
  offer_declined: { box: "border-red-200 bg-red-50 text-red-950", icon: UserMinus, iconClass: "text-red-700", open: "Open Staffing" },
  offer_expired: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: Hourglass, iconClass: "text-amber-700", open: "Open Staffing" },
  offer_question: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: MessageCircleQuestion, iconClass: "text-amber-700", open: "Read the question" },
} as const;

/**
 * Top of every agency page, full width, built like the interpreter's schedule banner: each offer an interpreter accepted or declined,
 * each offer that ran out of time, and each question they asked, until this staff member opens it (which also closes it and goes to
 * the job) or closes it with ×. Kari and Josie each close their own. Up to three show; "+N more" opens the bell, which keeps every
 * notice. Checked on every page change and whenever the 15-second pulse (hooks/usePulse.ts) sees something new.
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

  // The 15-second pulse (hooks/usePulse.ts, also on focus) says when something new arrived: re-read the notices then.
  usePulseChange(() => void load());

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

  // "Answer question": the reply box in place, without leaving the page. Answering closes this notice for every staff member.
  const [answering, setAnswering] = useState<{ bannerId: string; requestId: string; questionId: string | null } | null>(null);

  if (items.length === 0) return null;
  const more = total - items.length;
  return (
    <div className="mb-6 space-y-2" data-agency-banners="" aria-live="polite">
      {items.map((item) => {
        const style = STYLE[item.kind];
        const Icon = style.icon;
        const answerTarget = target(item);
        return (
          <div key={item.id} role="status" data-agency-banner={item.kind} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${style.box}`}>
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
            <button type="button" onClick={() => open(item)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-0.5 block leading-relaxed opacity-90">{item.message}</span>
              {item.href && <span className="mt-1 inline-block font-medium underline underline-offset-2">{style.open}</span>}
            </button>
            {answerTarget && (
              <button
                type="button"
                data-answer-question-button=""
                onClick={() => setAnswering({ bannerId: item.id, ...answerTarget })}
                className="shrink-0 self-center rounded-full bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
              >
                Answer question
              </button>
            )}
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
      {answering && (
        <AnswerQuestionDialog
          open
          onOpenChange={(next) => !next && setAnswering(null)}
          requestId={answering.requestId}
          questionId={answering.questionId}
          onAnswered={() => {
            setItems((prev) => prev.filter((item) => item.id !== answering.bannerId));
            void load();
          }}
        />
      )}
    </div>
  );
}
