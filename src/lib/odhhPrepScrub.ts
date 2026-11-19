/**
 * Preparation notes are shown to booked interpreters. The state's Appointment Note sometimes carries a bare 8-digit number with no
 * label (a case, claim or client number): it is not guidance for the interpreter and may identify the client, so it is taken out of
 * the preparation notes and kept in the agency-private notes instead. Pure.
 *
 * Only a bare run of exactly eight digits is moved. Left as they are: a longer or shorter number (a phone, a meeting id written in
 * groups), digits inside a link, a date, a time or a code ("1234-5678"), and a number right after a meeting / passcode / conference
 * label (join details the interpreter needs).
 */

export const PREP_ID_LABEL = "Number(s) from the appointment note:";
const MOVED_MARK = "[number moved to agency notes]";

// Exactly 8 digits, not touching another digit, a letter, or the punctuation of a link, date, time or code.
const BARE_EIGHT = /(?<![\w./:#=?&@-])\d{8}(?![\w/:@-]|\.\d)/g;
const JOIN_LABEL = /\b(?:meeting|webinar|conference|passcode|password|pin|access\s+code)\b[^\n]{0,20}$/i;
const IN_LINK = /https?:\/\/\S*$/i;

export interface PrepScrub {
  /** The note with each moved number replaced by a short marker. */
  text: string;
  /** The numbers moved, in order, without repeats. */
  moved: string[];
}

export function scrubPrepIds(note: string): PrepScrub {
  const moved: string[] = [];
  const text = note.replace(BARE_EIGHT, (digits: string, offset: number) => {
    const before = note.slice(Math.max(0, offset - 40), offset);
    if (JOIN_LABEL.test(before) || IN_LINK.test(before)) return digits;
    if (!moved.includes(digits)) moved.push(digits);
    return MOVED_MARK;
  });
  return { text, moved };
}
