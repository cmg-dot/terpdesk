import { Clock, Languages, MapPin, Video } from "lucide-react";
import { INTERPRETERS } from "@/components/public/book/evergreenContent";
import type { FeaturedInterpreter } from "@/components/public/book/evergreenContent";
import { RequestInterpreterButton } from "@/components/public/book/RequestInterpreterButton";
import { SectionHeading } from "@/components/public/book/SectionHeading";

function InterpreterCard({ person }: { person: FeaturedInterpreter }) {
  return (
    <article className="flex flex-col rounded-3xl border border-[var(--ev-line)] bg-[var(--ev-cream)] p-6">
      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="ev-serif flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--forest)] text-lg font-semibold text-[var(--ev-gold)]">
          {person.initials}
        </span>
        <div className="min-w-0">
          <h3 className="ev-serif text-[19px] font-semibold leading-tight text-[var(--forest)]">{person.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--sage)]">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {person.areas.join(" · ")}
          </p>
        </div>
      </div>

      <ul aria-label="Credentials" className="mt-5 flex flex-wrap gap-1.5">
        {person.credentials.map((credential) => (
          <li key={credential} className="rounded-md bg-[var(--forest)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[var(--ev-gold)]">
            {credential}
          </li>
        ))}
      </ul>
      {person.languages && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--forest)]">
          <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {person.languages}
        </p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-[var(--ink)]">{person.bio}</p>
      <ul aria-label="Specialties" className="mt-4 flex flex-wrap gap-1.5">
        {person.specialties.map((specialty) => (
          <li key={specialty} className="rounded-full border border-[var(--ev-line)] bg-white px-2.5 py-0.5 text-xs text-[var(--sage)]">
            {specialty}
          </li>
        ))}
      </ul>

      <ul className="mt-5 space-y-1.5 border-t border-[var(--ev-line)] pt-4 text-xs text-[var(--sage)]">
        <li className="flex items-center gap-1.5">
          <Video className="h-3.5 w-3.5 shrink-0 text-[var(--forest)]" aria-hidden="true" />
          <span className="sr-only">Works </span>
          {person.modalities.join(" and ")}
        </li>
        <li className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--forest)]" aria-hidden="true" />
          <span className="sr-only">Usually available </span>
          {person.availability}
        </li>
      </ul>

      <div className="mt-auto pt-6">
        <RequestInterpreterButton name={person.name} />
      </div>
    </article>
  );
}

/** #interpreters: four of the demo roster's interpreters, each with a button that names them on the request form. */
export function InterpretersSection() {
  return (
    <section id="interpreters" aria-labelledby="interpreters-title" className="scroll-mt-28 bg-white">
      <div className="mx-auto max-w-[1160px] px-4 py-20 sm:px-6 sm:py-24">
        <SectionHeading id="interpreters-title" eyebrow="Featured interpreters" title="Meet a few of our credentialed interpreters">
          Have someone in mind? Choose &ldquo;Request&rdquo; and we will add them to your request as your preferred interpreter. Our
          coordinators confirm availability before anything is booked.
        </SectionHeading>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INTERPRETERS.map((person) => (
            <InterpreterCard key={person.name} person={person} />
          ))}
        </div>
      </div>
    </section>
  );
}
