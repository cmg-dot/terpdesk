import { NAV, SITE } from "@/components/public/book/evergreenContent";
import { PineMark } from "@/components/public/book/MountainSilhouette";

/**
 * The demo agency website's sticky top: the "Demo site" notice (kept in view, since it is what stops anyone typing in real client
 * details), then the brand, the section links and the "Request an Interpreter" button. On phones the section links fold away.
 */
export function BookHeader() {
  return (
    <div className="sticky top-0 z-40">
      <a href="#request" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm">
        Skip to the request form
      </a>
      <p className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
        Demo site: sample information only. Please do not enter real client details.
      </p>
      <header className="border-b border-white/10 bg-[rgb(var(--forest-rgb)/0.97)] backdrop-blur">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#overview" aria-label={`${SITE.name}, back to the top`} className="flex items-center gap-2.5 text-white">
            <PineMark className="h-8 w-8 shrink-0" />
            <span className="leading-none">
              <span className="ev-serif block text-[18px] font-semibold tracking-tight">Evergreen</span>
              <span className="mt-0.5 block text-[9.5px] font-semibold uppercase tracking-[0.22em] text-[var(--ev-gold)]">Interpreting Group</span>
            </span>
          </a>
          <nav aria-label="Page sections" className="hidden items-center gap-7 md:flex">
            {NAV.map(({ href, label }) => (
              <a key={href} href={href} className="text-sm font-medium text-white/80 transition-colors hover:text-[var(--ev-gold)]">
                {label}
              </a>
            ))}
          </nav>
          <a
            href="#request"
            className="shrink-0 rounded-full bg-[var(--ev-gold)] px-4 py-2 text-sm font-semibold text-[var(--forest)] transition-colors hover:bg-[var(--ev-gold-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ev-gold)] focus:ring-offset-2 focus:ring-offset-[var(--forest)] sm:px-5"
          >
            <span className="sm:hidden">Request</span>
            <span className="hidden sm:inline">Request an Interpreter</span>
          </a>
        </div>
      </header>
    </div>
  );
}
