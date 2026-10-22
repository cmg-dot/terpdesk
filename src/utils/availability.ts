export interface AvailabilitySchema {
  baseTimezone: string;
  weeklySchedule: {
    [day: string]: { available: boolean; startMinute: number; endMinute: number };
  };
  dateOverrides: {
    date: string; // YYYY-MM-DD
    available: boolean;
    startMinute?: number;
    endMinute?: number;
  }[];
}

export const checkInterpreterAvailability = (
  availability: AvailabilitySchema | null,
  targetStartUTC: string, // UTC ISO String
  targetEndUTC: string // UTC ISO String
) => {
  if (!availability) return true; // Default to available if no schedule is set
  
  const { baseTimezone, weeklySchedule, dateOverrides } = availability;
  
  const startD = new Date(targetStartUTC);
  const endD = new Date(targetEndUTC);
  
  // Convert UTC target to interpreter's local time using Intl
  const formatLocal = (d: Date, tz: string) => {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const parts = f.formatToParts(d);
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    let h = p.hour;
    if (h === '24') h = '00';
    
    const dateStr = `${p.year}-${p.month}-${p.day}`;
    // Safely get weekday in local timezone by parsing the local date string
    const weekday = new Date(dateStr + "T12:00:00").getDay(); // 0 = Sunday
    
    return {
      dateStr,
      weekday,
      minute: parseInt(h) * 60 + parseInt(p.minute)
    };
  };
  
  try {
    const localStart = formatLocal(startD, baseTimezone || "America/Los_Angeles");
    const localEnd = formatLocal(endD, baseTimezone || "America/Los_Angeles");
    
    // 1. Check Date Overrides
    const override = dateOverrides?.find(o => o.date === localStart.dateStr);
    if (override) {
      if (!override.available) return false;
      if (override.startMinute != null && localStart.minute < override.startMinute) return false;
      if (override.endMinute != null && localEnd.minute > override.endMinute) return false;
      return true;
    }
    
    // 2. Check Weekly Schedule
    if (!weeklySchedule) return true;
    
    const daySchedule = weeklySchedule[localStart.weekday.toString()];
    if (!daySchedule || !daySchedule.available) return false; // Day is toggled off completely
    
    if (localStart.minute < daySchedule.startMinute || localEnd.minute > daySchedule.endMinute) {
      return false; // Time falls outside of the active shift boundary
    }
    
    return true;
  } catch (e) {
    console.error("Availability Check Error:");
    return true; // Fail open
  }
};
