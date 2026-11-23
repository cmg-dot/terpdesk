/** What the weekly-hours form sends to the availability actions (shared by the browser and the server). */

export interface AvailabilityRuleInput {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityExceptionInput {
  date: string;
  available: boolean;
  startMinute?: number;
  endMinute?: number;
}
