import type { ThemeOption } from "@/lib/theme";

interface ThemeCardProps {
  option: ThemeOption;
  selected: boolean;
  disabled: boolean;
  onChoose: () => void;
}

/** One selectable theme: a miniature of the workspace (sidebar + page, with the theme's accent) and its name. */
export const ThemeCard = ({ option, selected, disabled, onChoose }: ThemeCardProps) => (
  <div className="flex flex-col items-center">
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${option.label} theme`}
      disabled={disabled}
      onClick={onChoose}
      className={`flex h-24 w-full max-w-[200px] overflow-hidden rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forest)] disabled:cursor-wait ${
        selected ? "border-[var(--forest)] ring-2 ring-[rgb(var(--forest-rgb)/0.25)]" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <span className="relative h-full w-1/4" style={{ backgroundColor: option.sidebar }}>
        {option.accent && <span className="absolute left-1 top-4 h-5 w-1 rounded-full" style={{ backgroundColor: option.accent }} />}
      </span>
      <span className="flex h-full w-3/4 flex-col justify-end gap-1.5 p-3" style={{ backgroundColor: option.page }}>
        <span className="h-2 w-2/3 rounded-full" style={{ backgroundColor: option.sidebar, opacity: 0.85 }} />
        <span className="h-2 w-1/3 rounded-full" style={{ backgroundColor: option.accent ?? option.sidebar, opacity: 0.45 }} />
      </span>
    </button>
    <span className={`mt-3 text-[13px] font-medium ${selected ? "text-[var(--ink)]" : "text-[var(--sage)]"}`}>{option.label}</span>
    {selected && <span className="mt-0.5 text-[11px] font-medium text-[var(--forest)]">Active</span>}
  </div>
);
