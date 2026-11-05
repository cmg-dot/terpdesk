/**
 * The state identifiers a request form sends for the chosen funding program. A key is left out (not sent as `undefined`)
 * when the program does not use it, so saving a job never blanks an identifier that is already on file. The SRN belongs to
 * both state programs: every Apple Health job from the state's form has one.
 */

export interface ProgramFormFields {
  program: string;
  odhhSrn: string;
  odhhAccessCode: string;
  providerOneNumber: string;
}

export interface ProgramIdentifiers {
  odhhSrn?: string;
  odhhAccessCode?: string;
  providerOneNumber?: string;
}

export function programIdentifiers(form: ProgramFormFields): ProgramIdentifiers {
  if (form.program === "WA ODHH") return { odhhSrn: form.odhhSrn, odhhAccessCode: form.odhhAccessCode };
  if (form.program === "WA Apple Health") return { odhhSrn: form.odhhSrn, providerOneNumber: form.providerOneNumber };
  return {};
}
