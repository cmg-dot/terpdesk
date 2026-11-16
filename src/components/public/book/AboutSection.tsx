import { ABOUT } from "@/components/public/book/evergreenContent";
import { SectionHeading } from "@/components/public/book/SectionHeading";

/** #about: who the (fictional) agency is, and three commitments set on the dark green. */
export function AboutSection() {
  return (
    <section id="about" aria-labelledby="about-title" className="scroll-mt-28 bg-[var(--ev-cream)]">
      <div className="mx-auto grid max-w-[1160px] gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <SectionHeading id="about-title" eyebrow="About us" title={ABOUT.heading} />
          <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-[var(--sage)]">
            {ABOUT.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
        <ol className="space-y-px overflow-hidden rounded-3xl bg-[var(--forest)]">
          {ABOUT.commitments.map(({ title, body }, i) => (
            <li key={title} className="flex gap-5 border-b border-white/10 p-7 last:border-b-0">
              <span className="ev-serif text-[28px] font-semibold leading-none text-[var(--ev-gold)]" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="ev-serif text-[19px] font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
