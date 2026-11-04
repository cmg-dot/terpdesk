/**
 * What a job's setting reads as. A setting nobody entered is "Not stated", never a made-up one: for a long time every job
 * without a setting showed "Medical", which was wrong for DVR, legal, education and job-interview jobs. Pure.
 */
export const NOT_STATED = "Not stated";

/** The form's placeholder choice, which is not a setting. */
const PLACEHOLDER = "choose a setting";

/** The real setting text, or "" when there is none (empty, whitespace, or the form's placeholder). */
export const realSetting = (value: unknown): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" || text.toLowerCase() === PLACEHOLDER ? "" : text;
};

/** The setting to show: the entered one, else "Not stated". Takes the first real value of several candidates. */
export const settingLabel = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    const setting = realSetting(candidate);
    if (setting) return setting;
  }
  return NOT_STATED;
};
