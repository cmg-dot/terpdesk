import type { ReactNode } from "react";

/** The website's section opening: a gold rule with a small label, then the serif heading and an optional intro. */
export function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[680px]">
      <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--forest)]">
        <span className="h-px w-8 bg-[var(--ev-gold)]" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2 id={id} className="ev-serif mt-4 text-[30px] font-semibold leading-tight tracking-tight text-[var(--forest)] sm:text-[40px]">
        {title}
      </h2>
      {children && <div className="mt-4 text-[15.5px] leading-relaxed text-[var(--sage)]">{children}</div>}
    </div>
  );
}
