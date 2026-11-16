import { ArrowRight, BadgeCheck, CalendarCheck, Video } from "lucide-react";
import { MountainSilhouette } from "@/components/public/book/MountainSilhouette";

const HIGHLIGHTS = [
  { icon: BadgeCheck, label: "NIC and CDI credentialed" },
  { icon: Video, label: "On-site and video remote" },
  { icon: CalendarCheck, label: "Confirmed before it's booked" },
] as const;

/** The demo agency website's opening: a twilight forest drawn in CSS and SVG (no images), the headline and the two calls to action. */
export function EvergreenHero() {
  return (
    <section id="overview" aria-labelledby="overview-title" className="ev-hero-sky relative isolate scroll-mt-28 overflow-hidden text-white">
      <div className="relative z-10 mx-auto max-w-[1160px] px-4 pb-44 pt-16 sm:px-6 sm:pb-56 sm:pt-24">
        <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ev-gold)]">
          <span className="h-px w-8 bg-[var(--ev-gold)]" aria-hidden="true" />
          ASL interpreting · Pacific Northwest
        </p>
        <h1 id="overview-title" className="ev-serif mt-5 max-w-[760px] text-[38px] font-semibold leading-[1.08] tracking-tight sm:text-[58px]">
          Clear communication, wherever the appointment takes you.
        </h1>
        <p className="mt-6 max-w-[580px] text-[16px] leading-relaxed text-white/80 sm:text-[17px]">
          Credentialed ASL and Deaf interpreters for medical, education, legal and workplace settings, in person across Western
          Washington or by video anywhere.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="#request"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--ev-gold)] px-6 py-3 text-sm font-semibold text-[var(--forest)] transition-colors hover:bg-[var(--ev-gold-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ev-gold)] focus:ring-offset-2 focus:ring-offset-[var(--forest)]"
          >
            Request an Interpreter
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a href="#interpreters" className="rounded-full border border-white/30 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/60 hover:bg-white/5">
            Meet our interpreters
          </a>
        </div>
        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/75">
          {HIGHLIGHTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-[var(--ev-gold)]" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <MountainSilhouette className="absolute inset-x-0 bottom-0 h-[150px] w-full sm:h-[220px]" />
    </section>
  );
}
