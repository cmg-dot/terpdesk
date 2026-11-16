import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarCheck, HandHelping, Laptop, ShieldCheck } from "lucide-react";
import { PublicRequestForm } from "@/components/public/PublicRequestForm";
import { DEFAULT_AGENCY_NAME } from "@/lib/agency";
import { IS_DEMO_MODE } from "@/lib/demoMode";
import { FORMATS, HONEYPOT_FIELD, SETTINGS, TIME_ZONE_LABELS } from "@/lib/publicIntake";

export const metadata: Metadata = { title: `Request an interpreter | ${DEFAULT_AGENCY_NAME}`, robots: { index: false, follow: false } };

const SERVICES = [
  { icon: HandHelping, title: "On-site interpreting", body: "Certified ASL interpreters for medical, legal, education and workplace appointments." },
  { icon: Laptop, title: "Video remote interpreting", body: "Interpreters on Zoom, Teams or your own platform, booked as easily as an in-person job." },
  { icon: CalendarCheck, title: "Team and recurring bookings", body: "Teams of two for long sessions, and standing appointments scheduled in one request." },
] as const;

/**
 * A sample agency website with its "Request an Interpreter" form, shown only on the demo deployment (NEXT_PUBLIC_DEMO_MODE): everywhere
 * else this address is a 404. A submission becomes a draft in the demo agency's Requests list. Public (not in the middleware matcher).
 */
export default function BookPage() {
  if (!IS_DEMO_MODE) notFound();

  return (
    <div className="min-h-screen bg-[#FBFAF7] text-[var(--ink)]">
      <p className="bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900">Demo site: sample information only. Please do not enter real client details.</p>

      <header className="mx-auto flex max-w-[1100px] items-center justify-between px-4 py-5 sm:px-6">
        <span className="text-lg font-semibold tracking-tight">{DEFAULT_AGENCY_NAME}</span>
        <a href="#request" className="rounded-full bg-[var(--forest)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90">
          Request an interpreter
        </a>
      </header>

      <section className="mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-6 sm:pt-14">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sage)]">ASL interpreting services</p>
        <h1 className="mt-3 max-w-[720px] text-[34px] font-semibold leading-tight tracking-tight sm:text-[46px]">Clear communication for every appointment.</h1>
        <p className="mt-4 max-w-[620px] text-[16px] leading-relaxed text-[var(--sage)]">
          {DEFAULT_AGENCY_NAME} connects Deaf and hard of hearing people with qualified interpreters, in person and online. Tell us what you
          need and our scheduling team takes it from there.
        </p>
      </section>

      <section className="mx-auto grid max-w-[1100px] gap-4 px-4 pb-14 sm:grid-cols-3 sm:px-6">
        {SERVICES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-[#EBE8DF] bg-white p-5">
            <Icon className="h-6 w-6 text-[var(--forest)]" aria-hidden="true" />
            <h2 className="mt-3 text-[15px] font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--sage)]">{body}</p>
          </div>
        ))}
      </section>

      <section id="request" className="mx-auto grid max-w-[1100px] gap-8 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">
          <h2 className="text-[26px] font-semibold tracking-tight">Request an interpreter</h2>
          <p className="text-sm leading-relaxed text-[var(--sage)]">
            Send us the date, time and place. We confirm every request with you before an interpreter is booked.
          </p>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--sage)]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--forest)]" aria-hidden="true" />
            Your request goes straight to our scheduling team and is never shared outside the agency.
          </p>
        </div>
        <div className="rounded-3xl border border-[#EBE8DF] bg-white p-5 sm:p-7">
          <PublicRequestForm settings={SETTINGS} formats={FORMATS} timeZones={TIME_ZONE_LABELS} honeypot={HONEYPOT_FIELD} />
        </div>
      </section>

      <footer className="border-t border-[#EBE8DF] px-4 py-6 text-center text-xs text-[var(--sage)]">
        © {DEFAULT_AGENCY_NAME} · Sample website for demonstration
      </footer>
    </div>
  );
}
