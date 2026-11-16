import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { NAV, SITE } from "@/components/public/book/evergreenContent";
import { PineMark } from "@/components/public/book/MountainSilhouette";

/** The website's footer: the agency on the left, the (fictional) scheduling coordinator's contact details on the right. */
export function BookFooter() {
  const contact = [
    { icon: Phone, label: SITE.phone, href: SITE.phoneHref },
    { icon: Mail, label: SITE.email, href: `mailto:${SITE.email}` },
    { icon: MapPin, label: SITE.location },
    { icon: Clock, label: SITE.hours },
  ];
  return (
    <footer className="bg-[var(--ev-night)] text-white">
      <div className="mx-auto grid max-w-[1160px] gap-12 px-4 py-16 sm:px-6 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-3">
            <PineMark className="h-10 w-10" />
            <span className="ev-serif text-[22px] font-semibold">{SITE.name}</span>
          </div>
          <p className="mt-4 max-w-[420px] text-sm leading-relaxed text-white/65">
            ASL and Deaf interpreters for medical, education, legal and workplace appointments across Western Washington, and by video
            anywhere.
          </p>
          <nav aria-label="Footer" className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {NAV.map(({ href, label }) => (
              <a key={href} href={href} className="text-sm text-white/70 transition-colors hover:text-[var(--ev-gold)]">
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="md:justify-self-end">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ev-gold)]">Scheduling</h2>
          <p className="ev-serif mt-3 text-[19px] font-semibold">{SITE.coordinator.name}</p>
          <p className="text-sm text-white/60">{SITE.coordinator.role}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-white/80">
            {contact.map(({ icon: Icon, label, href }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0 text-[var(--ev-gold)]" aria-hidden="true" />
                {href ? (
                  <a href={href} className="break-all transition-colors hover:text-[var(--ev-gold)]">
                    {label}
                  </a>
                ) : (
                  label
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} {SITE.name} · A fictional agency on a sample website for demonstration.
      </p>
    </footer>
  );
}
