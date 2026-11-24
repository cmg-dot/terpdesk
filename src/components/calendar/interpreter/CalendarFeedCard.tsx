"use client";

import { useState } from "react";
import { CalendarCheck, Check, Copy } from "lucide-react";
import { useCalendarFeed } from "@/hooks/useCalendarFeed";
import type { FeedBusy } from "@/hooks/useCalendarFeed";
import type { FeedDetailLevel } from "@/lib/calendarFeed/events";

const LEVELS: { value: FeedDetailLevel; label: string; hint: string }[] = [
  { value: "busy", label: "Busy only", hint: 'Every event is titled just "terpDESK job", "Personal job" or "Busy".' },
  { value: "generic", label: "With setting", hint: "A job also names one general setting, such as Medical or Legal. Never a client, place or your own notes." },
];

const BUTTON = "min-h-11 rounded-full px-5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:opacity-50 sm:min-h-10";
const OUTLINE = `${BUTTON} border border-[var(--banner-edge)] bg-white text-[var(--ink)] hover:bg-[var(--surface)]`;

const syncedText = (iso: string | null): string => {
  if (!iso) return "Not synced yet";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Not synced yet" : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

function LevelPicker({ value, disabled, onPick }: { value: FeedDetailLevel; disabled: boolean; onPick: (level: FeedDetailLevel) => void }) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-[13px] font-medium text-gray-700">What each event says</legend>
      <div role="radiogroup" aria-label="What each event says" className="grid gap-2 sm:grid-cols-2">
        {LEVELS.map((level) => (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={value === level.value}
            data-level={level.value}
            onClick={() => value !== level.value && onPick(level.value)}
            className={`min-h-11 rounded-xl border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] ${
              value === level.value ? "border-[var(--forest)] bg-[var(--tint)] text-[var(--tint-ink)]" : "border-[var(--banner-edge)] bg-white text-[var(--ink)] hover:bg-[var(--surface)]"
            }`}
          >
            <span className="block text-[14px] font-semibold">{level.label}</span>
            <span className="mt-0.5 block text-[12px] opacity-80">{level.hint}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AddressBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the address is selectable in the box.
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-[var(--forest)] bg-[var(--tint)] p-4" data-feed-address="">
      <p className="text-[13px] font-medium text-[var(--tint-ink)]">Copy your link now. For your security it is shown only once; if you lose it, rotate the link to get a new one.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} className="h-11 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3 text-[13px] text-gray-900" />
        <button type="button" onClick={() => void copy()} className={`${BUTTON} inline-flex items-center justify-center gap-2 bg-[var(--forest)] text-white hover:opacity-90`}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      <p className="text-[12px] text-[var(--tint-ink)]">
        Apple Calendar: <a className="font-medium underline" href={url.replace(/^https?:/, "webcal:")}>open this link</a> on your device. Google Calendar: Other calendars, From URL, paste the link.
      </p>
    </div>
  );
}

const CONFIRM_TEXT = {
  rotate: "Rotate the link? The old one stops working, and you will need to subscribe again with the new one.",
  revoke: "Turn the link off? Calendar apps lose access at their next sync.",
} as const;

function Actions({ busy, onRotate, onRevoke }: { busy: FeedBusy; onRotate: () => void; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState<"rotate" | "revoke" | null>(null);
  if (confirming) {
    return (
      <div className="space-y-3 rounded-xl border border-[var(--banner-edge)] bg-[var(--canvas)] p-4" role="alertdialog" aria-label={confirming === "rotate" ? "Rotate the link" : "Revoke the link"}>
        <p className="text-[13px] text-[var(--ink)]">{CONFIRM_TEXT[confirming]}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy !== null} onClick={() => { const go = confirming === "rotate" ? onRotate : onRevoke; setConfirming(null); go(); }} className={`${BUTTON} ${confirming === "revoke" ? "bg-red-600 text-white hover:bg-red-700" : "bg-[var(--forest)] text-white hover:opacity-90"}`}>
            {confirming === "rotate" ? "Yes, rotate" : "Yes, revoke"}
          </button>
          <button type="button" onClick={() => setConfirming(null)} className={OUTLINE}>Keep it</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy !== null} onClick={() => setConfirming("rotate")} className={OUTLINE}>{busy === "rotate" ? "Rotating..." : "Rotate link"}</button>
      <button type="button" disabled={busy !== null} onClick={() => setConfirming("revoke")} className={`${OUTLINE} text-red-700 hover:bg-red-50`}>{busy === "revoke" ? "Revoking..." : "Revoke"}</button>
    </div>
  );
}

const PROBLEMS = {
  not_ready: "Calendar subscriptions are not set up on this database yet. Please check back soon.",
  not_linked: "Connect your interpreter profile (use the link we emailed you) before subscribing a calendar.",
  error: "We couldn't load your calendar subscription. Please refresh the page.",
} as const;

/**
 * "Subscribe in your calendar app": a private link that shows your confirmed agency jobs, personal jobs and busy time in Apple, Google or
 * any calendar app. The card makes the link (shown once), says how much each event shows, when it last synced, and rotates or revokes it.
 */
export function CalendarFeedCard() {
  const feed = useCalendarFeed();
  const [level, setLevel] = useState<FeedDetailLevel>("busy");
  const state = feed.state;

  return (
    <section id="calendar-feed" aria-labelledby="calendar-feed-title" data-calendar-feed="" className="mt-12 scroll-mt-6 space-y-4 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tint)]"><CalendarCheck className="h-5 w-5 text-[var(--forest)]" aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 id="calendar-feed-title" className="text-lg font-semibold text-[var(--ink)]">Subscribe in your calendar app</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--sage)]">
            A private link that puts your confirmed agency jobs, personal jobs and busy time in Apple Calendar, Google Calendar or any calendar app, from 30 days back to 6 months ahead. Pending offers are not included.
          </p>
        </div>
      </div>

      {state === "loading" && <p className="text-[13px] text-[var(--sage)]" role="status">Loading...</p>}
      {state !== "loading" && state.status !== "none" && state.status !== "active" && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">{PROBLEMS[state.status]}</p>}

      {state !== "loading" && state.status === "none" && (
        <div className="space-y-4">
          <LevelPicker value={level} disabled={feed.busy !== null} onPick={setLevel} />
          <button type="button" disabled={feed.busy !== null} onClick={() => void feed.create(level)} className={`${BUTTON} bg-[var(--forest)] text-white hover:opacity-90`}>
            {feed.busy === "create" ? "Creating..." : "Create feed link"}
          </button>
        </div>
      )}

      {state !== "loading" && state.status === "active" && (
        <div className="space-y-4">
          {feed.url && <AddressBox url={feed.url} />}
          <LevelPicker value={state.feed.detailLevel} disabled={feed.busy !== null} onPick={(next) => void feed.setDetail(next)} />
          <p className="text-[13px] text-[var(--ink)]" data-feed-synced="">
            <span className="font-medium">Last synced:</span> {syncedText(state.feed.lastFetchedAt)}
          </p>
          {!feed.url && <p className="text-[13px] text-[var(--sage)]">Your link is hidden for your security. If you need it again, rotate the link to get a new one.</p>}
          <Actions busy={feed.busy} onRotate={() => void feed.rotate()} onRevoke={() => void feed.revoke()} />
        </div>
      )}

      {feed.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-medium text-red-800">{feed.error}</p>}

      <p className="border-t border-[var(--banner-edge)] pt-3 text-[12px] leading-relaxed text-[var(--sage)]">
        Anyone with the link can see your times, so keep it private. Your calendar app fetches it on its own schedule, often every few hours. Events it has already
        downloaded stay in that app until it refreshes or you remove the subscription: rotating or revoking stops future syncs but cannot take back what was already fetched.
      </p>
    </section>
  );
}
