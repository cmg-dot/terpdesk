import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export function wallClockToUtc(localString: string, zone: string): string {
  return fromZonedTime(localString, zone).toISOString();
}

export function utcToWallClock(isoString: string, zone: string): string {
  return formatInTimeZone(isoString, zone, "yyyy-MM-dd'T'HH:mm");
}

export function getIanaZone(tz?: string): string {
  if (!tz || typeof tz !== 'string') return 'America/Los_Angeles';
  const lower = tz.toLowerCase();
  if (lower.includes('hawaii')) return 'Pacific/Honolulu';
  if (lower.includes('alaska')) return 'America/Anchorage';
  if (lower.includes('pacific')) return 'America/Los_Angeles';
  if (lower.includes('arizona')) return 'America/Phoenix';
  if (lower.includes('mountain')) return 'America/Denver';
  if (lower.includes('central')) return 'America/Chicago';
  if (lower.includes('eastern')) return 'America/New_York';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return tz;
  } catch (e) {
    return 'America/Los_Angeles';
  }
}
