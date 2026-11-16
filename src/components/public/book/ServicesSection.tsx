import { Check, HandHelping, Laptop, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SERVICES } from "@/components/public/book/evergreenContent";
import type { ServiceKey } from "@/components/public/book/evergreenContent";
import { SectionHeading } from "@/components/public/book/SectionHeading";
import { SETTINGS } from "@/lib/publicIntake";

const ICONS: Record<ServiceKey, LucideIcon> = { onsite: HandHelping, vri: Laptop, team: Users };

/** The settings the request form offers, minus its catch-all. */
const COVERED = SETTINGS.filter((s) => s !== "Other");

/** #services: the three kinds of request, and the settings the agency covers. */
export function ServicesSection() {
  return (
    <section id="services" aria-labelledby="services-title" className="scroll-mt-28 bg-[var(--ev-cream)]">
      <div className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading id="services-title" eyebrow="Services" title="Interpreting for every kind of appointment">
          Tell us where and when. We take care of matching the right interpreter, whether you need someone in the room or on screen.
        </SectionHeading>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {SERVICES.map(({ key, title, body, points }) => {
            const Icon = ICONS[key];
            return (
              <article key={key} className="flex flex-col rounded-3xl border border-[var(--ev-line)] bg-white p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--forest)]">
                  <Icon className="h-5 w-5 text-[var(--ev-gold)]" aria-hidden="true" />
                </span>
                <h3 className="ev-serif mt-5 text-[21px] font-semibold text-[var(--forest)]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sage)]">{body}</p>
                <ul className="mt-5 space-y-2 border-t border-[var(--ev-line)] pt-5">
                  {points.map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-[var(--ink)]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--forest)]" aria-hidden="true" />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          <span className="mr-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--sage)]">Settings we cover</span>
          {COVERED.map((setting) => (
            <span key={setting} className="rounded-full border border-[var(--ev-line)] bg-white px-3.5 py-1 text-sm text-[var(--forest)]">
              {setting}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
