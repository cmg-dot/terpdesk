/** The Rates & rules sections, as anchors: the page is long, so each card can be reached in one tap (the cards carry matching ids). */
export const RULES_SECTIONS = [
  { id: "rules-fees", label: "Fees & hours" },
  { id: "rules-pay-schedule", label: "Pay schedule" },
  { id: "rules-holidays", label: "Holidays" },
  { id: "rules-organizations", label: "Organization rates" },
  { id: "rules-interpreters", label: "Interpreter rates" },
] as const;

export const RulesNav = () => (
  <nav aria-label="Rates and rules sections" className="-mt-2 flex gap-2 overflow-x-auto pb-1">
    {RULES_SECTIONS.map((s) => (
      <a
        key={s.id}
        href={`#${s.id}`}
        className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-gray-50 max-sm:min-h-11"
      >
        {s.label}
      </a>
    ))}
  </nav>
);
