/**
 * A length of time as whole hours and minutes: "0 hr 45 min", "1 hr 15 min", "2 hr 0 min".
 * Used wherever service time is shown, so 45 minutes never reads as a rounded "0.8 hr".
 * Fractions of a minute are rounded to the nearest minute; negative time counts as none. Returns "-" for a value that
 * is not a number, so a missing time is never shown as zero.
 */
export function formatHoursMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "-";
  const whole = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(whole / 60)} hr ${whole % 60} min`;
}
