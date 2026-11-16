import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { notFound } from "next/navigation";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { AboutSection } from "@/components/public/book/AboutSection";
import { BookFooter } from "@/components/public/book/BookFooter";
import { BookHeader } from "@/components/public/book/BookHeader";
import { BookingProvider } from "@/components/public/book/BookingContext";
import { EvergreenHero } from "@/components/public/book/EvergreenHero";
import { InterpretersSection } from "@/components/public/book/InterpretersSection";
import { ServicesSection } from "@/components/public/book/ServicesSection";
import { SectionHeading } from "@/components/public/book/SectionHeading";
import { NEXT_STEPS, SITE } from "@/components/public/book/evergreenContent";
import { PublicRequestForm } from "@/components/public/PublicRequestForm";
import { IS_DEMO_MODE } from "@/lib/demoMode";
import { FORMATS, HONEYPOT_FIELD, SETTINGS, TIME_ZONE_LABELS } from "@/lib/publicIntake";

// Self-hosted by next/font at build time: the page makes no request to Google, and only /book loads it.
const serif = Fraunces({ subsets: ["latin"], variable: "--font-ev-serif", display: "swap" });

export const metadata: Metadata = { title: `Request an interpreter | ${SITE.name}`, robots: { index: false, follow: false } };

/**
 * A sample agency website ("Evergreen Interpreting Group", fictional) with its "Request an Interpreter" form, shown only on the demo
 * deployment (NEXT_PUBLIC_DEMO_MODE): everywhere else this address is a 404. A submission becomes a draft in the demo agency's
 * Requests list. Public (not in the middleware matcher).
 */
export default function BookPage() {
  if (!IS_DEMO_MODE) notFound();

  return (
    <div data-site="evergreen" className={`${serif.variable} min-h-screen bg-[var(--ev-cream)] text-[var(--ink)]`}>
      <BookingProvider>
        <BookHeader />
        <main>
          <EvergreenHero />
          <ServicesSection />
          <InterpretersSection />
          <AboutSection />

          <section id="request" aria-labelledby="request-title" className="scroll-mt-28 border-t border-[var(--ev-line)] bg-[var(--ev-cream)]">
            <div className="mx-auto grid max-w-[1160px] gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.55fr]">
              <aside className="space-y-8 lg:sticky lg:top-32 lg:self-start">
                <SectionHeading id="request-title" eyebrow="Book" title="Request an interpreter">
                  Send us the date, time and place. We confirm every request with you before an interpreter is booked.
                </SectionHeading>
                <ol className="space-y-4">
                  {NEXT_STEPS.map(({ title, body }, i) => (
                    <li key={title} className="flex gap-3.5">
                      <span className="ev-serif flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--ev-gold)] text-sm font-semibold text-[var(--forest)]">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--forest)]">{title}</p>
                        <p className="text-sm text-[var(--sage)]">{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="space-y-2 rounded-2xl bg-[var(--forest)] p-5 text-sm text-white/85">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ev-gold)]">Prefer to talk it through?</p>
                  <a href={SITE.phoneHref} className="flex items-center gap-2 hover:text-[var(--ev-gold)]">
                    <Phone className="h-4 w-4 text-[var(--ev-gold)]" aria-hidden="true" />
                    {SITE.phone}
                  </a>
                  <a href={`mailto:${SITE.email}`} className="flex items-center gap-2 break-all hover:text-[var(--ev-gold)]">
                    <Mail className="h-4 w-4 shrink-0 text-[var(--ev-gold)]" aria-hidden="true" />
                    {SITE.email}
                  </a>
                </div>
                <p className="flex items-start gap-2 text-xs leading-relaxed text-[var(--sage)]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--forest)]" aria-hidden="true" />
                  Your request goes straight to our scheduling team and is never shared outside the agency.
                </p>
              </aside>
              <PublicRequestForm settings={SETTINGS} formats={FORMATS} timeZones={TIME_ZONE_LABELS} honeypot={HONEYPOT_FIELD} />
            </div>
          </section>
        </main>
        <BookFooter />
      </BookingProvider>
    </div>
  );
}
