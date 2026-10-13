import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

export function wallClockToUtc(localString: string, zone: string): string {
  return fromZonedTime(localString, zone).toISOString();
}

export function utcToWallClock(isoString: string, zone: string): string {
  return formatInTimeZone(isoString, zone, "yyyy-MM-dd'T'HH:mm");
}

export function getIanaZone(tz?: string): string {
  if (!tz || typeof tz !== 'string') return 'America/Los_Angeles';
  const trimmed = tz.trim();
  const lower = trimmed.toLowerCase();

  // Hawaii
  if (lower.includes('hawaii') || lower.includes('honolulu') || lower === 'hst' || lower === 'hdt' || lower === 'hast') {
    return 'Pacific/Honolulu';
  }
  // Alaska
  if (lower.includes('alaska') || lower.includes('anchorage') || lower === 'akdt' || lower === 'akst' || lower === 'akt') {
    return 'America/Anchorage';
  }
  // Pacific
  if (lower.includes('pacific') || lower.includes('seattle') || lower.includes('los angeles') || lower === 'pdt' || lower === 'pst' || lower === 'pt') {
    return 'America/Los_Angeles';
  }
  // Arizona (Mountain Standard Time - no DST)
  if (lower.includes('arizona') || lower.includes('phoenix')) {
    return 'America/Phoenix';
  }
  // Mountain
  if (lower.includes('mountain') || lower.includes('denver') || lower === 'mdt' || lower === 'mst' || lower === 'mt') {
    return 'America/Denver';
  }
  // Central
  if (lower.includes('central') || lower.includes('chicago') || lower === 'cdt' || lower === 'cst' || lower === 'ct') {
    return 'America/Chicago';
  }
  // Eastern
  if (lower.includes('eastern') || lower.includes('new york') || lower === 'edt' || lower === 'est' || lower === 'et') {
    return 'America/New_York';
  }
  // UTC / GMT
  if (lower === 'utc' || lower === 'gmt') {
    return 'UTC';
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return trimmed;
  } catch (e) {
    return 'America/Los_Angeles';
  }
}

export function buildAppointmentUtcTimes(params: {
  date: string;
  startTime: string;
  endDate?: string;
  endTime: string;
  timeZone?: string;
}): { startsAt: string; endsAt: string; ianaZone: string } {
  const ianaZone = getIanaZone(params.timeZone);
  const cleanStartDate = params.date?.trim() || new Date().toISOString().split('T')[0];
  const cleanStartTime = params.startTime?.trim() || '09:00';
  const cleanEndTime = params.endTime?.trim() || '10:00';
  const cleanEndDate = params.endDate?.trim() || cleanStartDate;

  const startUtc = fromZonedTime(`${cleanStartDate}T${cleanStartTime}:00`, ianaZone);
  const endUtc = fromZonedTime(`${cleanEndDate}T${cleanEndTime}:00`, ianaZone);

  return {
    startsAt: startUtc.toISOString(),
    endsAt: endUtc.toISOString(),
    ianaZone
  };
}

export function resolveRequestTimes(row: { createdAt?: Date | string | null; data?: any } | any): { startsAt: string; endsAt: string } {
  if (!row) {
    const fallbackStart = new Date().toISOString();
    return { startsAt: fallbackStart, endsAt: new Date(Date.now() + 3600000).toISOString() };
  }
  const rowData = (row.data as any) || row || {};
  const details = rowData.details || row.details || {};
  const tz = details.timeZone || details.timezone || rowData.timeZone || rowData.timezone || row.timeZone;
  const ianaZone = getIanaZone(tz);

  let startsAt: string =
    rowData.customStartsAt ||
    rowData.startsAt ||
    details.customStartsAt ||
    details.startsAt ||
    row.startsAt;

  if (!startsAt && details.startDate && details.startTime) {
    try {
      startsAt = fromZonedTime(`${details.startDate}T${details.startTime}:00`, ianaZone).toISOString();
    } catch (e) {}
  }

  if (!startsAt) {
    startsAt = row.createdAt
      ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString())
      : new Date().toISOString();
  }

  let endsAt: string | undefined =
    rowData.customEndsAt ||
    rowData.endsAt ||
    details.customEndsAt ||
    details.endsAt ||
    row.endsAt;

  if (!endsAt && details.endDate && details.endTime) {
    try {
      endsAt = fromZonedTime(`${details.endDate}T${details.endTime}:00`, ianaZone).toISOString();
    } catch (e) {}
  } else if (!endsAt && details.startDate && details.endTime) {
    try {
      endsAt = fromZonedTime(`${details.startDate}T${details.endTime}:00`, ianaZone).toISOString();
    } catch (e) {}
  }

  if (!endsAt) {
    endsAt = new Date(new Date(startsAt).getTime() + 3600000).toISOString();
  }

  return { startsAt, endsAt };
}

/**
 * Strictly parses a wall-clock date and time in a specified IANA timezone into an absolute UTC Date.
 * NEVER allows the host browser/server local timezone to skew or offset the output.
 */
export function wallClockToUtcDate(params: {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm or HH:mm:ss
  timeZone: string;
}): Date {
  const { dateStr, timeStr, timeZone } = params;
  const safeZone = getIanaZone(timeZone);

  const cleanDate = dateStr.trim().split("T")[0];
  const [yearStr, monthStr, dayStr] = cleanDate.split("-");
  const [hourStr, minStr, secStr] = timeStr.trim().split(":");

  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr || "0", 10);
  const minute = parseInt(minStr || "0", 10);
  const second = parseInt(secStr || "0", 10);

  const tentativeUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const getTzRenderedMs = (utcMs: number): number => {
    const d = new Date(utcMs);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let y = year, m = month, dy = day, h = 0, min = 0, s = 0;
    for (const part of parts) {
      if (part.type === "year") y = parseInt(part.value, 10);
      if (part.type === "month") m = parseInt(part.value, 10);
      if (part.type === "day") dy = parseInt(part.value, 10);
      if (part.type === "hour") h = parseInt(part.value, 10) % 24;
      if (part.type === "minute") min = parseInt(part.value, 10);
      if (part.type === "second") s = parseInt(part.value, 10);
    }
    return Date.UTC(y, m - 1, dy, h, min, s);
  };

  const renderedTzMs1 = getTzRenderedMs(tentativeUtcMs);
  const offsetMs1 = renderedTzMs1 - tentativeUtcMs;
  const actualUtcMs1 = tentativeUtcMs - offsetMs1;

  const renderedTzMs2 = getTzRenderedMs(actualUtcMs1);
  const offsetMs2 = renderedTzMs2 - actualUtcMs1;
  const finalUtcMs = tentativeUtcMs - offsetMs2;

  return new Date(finalUtcMs);
}


