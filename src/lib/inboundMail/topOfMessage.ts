/**
 * Where the sender's OWN words end and the quoted message begins. A reply that carries the state's whole 5-section form underneath
 * it is a reply, not a request form, so anything that reads intent must look only at what is above the quote. The breaks are the
 * ones real mail uses: Outlook's From/Sent/To/Subject block, "-----Original Message-----", Gmail's "On ... wrote:", ">" quoting,
 * a long underscore rule, and the state form's own first lines (for mail that pastes the form with no header at all). Pure.
 */

const BREAKS: readonly RegExp[] = [
  /^[ \t]*-{2,}[ \t]*(?:original|forwarded)[ \t]+message[ \t]*-{2,}[ \t]*$/im,
  /^[ \t]*>/m,
  /^[ \t]*_{5,}[ \t]*$/m,
  /^[ \t]*on\b[^\n]{5,200}(?:\n[ \t]*)?wrote:/im,
  /^[ \t]*from:[^\n]*\n(?:[^\n]*\n){0,3}?[ \t]*(?:sent|date|to|subject):/im,
  /^[ \t]*(?:THIS REQUEST REQUIRES PRE-AUTHORIZATION\.?|1\.[ \t]*INTERPRETER AGENCY)[ \t]*$/m,
];

const unix = (text: string): string => text.replace(/\r\n?/g, "\n");

/** The text above the first quote marker (the whole text when nothing is quoted), trimmed. */
export function topOfMessage(text: string): string {
  const body = unix(text);
  let cut = body.length;
  for (const pattern of BREAKS) {
    const hit = pattern.exec(body);
    if (hit && hit.index < cut) cut = hit.index;
  }
  return body.slice(0, cut).trim();
}

/** True when the message quotes an earlier one (so it is a reply or a forward, not a first message). */
export const quotesAnotherMessage = (text: string): boolean => topOfMessage(text).length < unix(text).trim().length;
