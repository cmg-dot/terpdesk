interface CountBadgeProps {
  count: number;
  /** Spoken label, e.g. "unread emails". */
  label: string;
}

/** A small red count pill (99+ when large). Renders nothing for zero. */
export const CountBadge = ({ count, label }: CountBadgeProps) =>
  count > 0 ? (
    <span
      aria-label={`${count} ${label}`}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-[#9E3929] px-1.5 text-[11px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  ) : null;
