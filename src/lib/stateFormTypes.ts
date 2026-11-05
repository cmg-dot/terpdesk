/** The state's request form as the request page shows it: five numbered sections of label / value rows. Pure data, no markup. */

export interface FormRow {
  /** The label as the state prints it ("Billing Organization Name"). Empty for a plain line of text. */
  label: string;
  /** The value, or null when the form left it blank (or the job has nothing on file). */
  value: string | null;
}

export interface FormSection {
  number: 1 | 2 | 3 | 4 | 5;
  /** "ACCOUNT INFORMATION", "PATIENT INFORMATION", ... as the state words it. */
  title: string;
  /** A short tag from the heading, e.g. "Crucial Appointment". */
  tag: string | null;
  rows: FormRow[];
  /** Section 5 holds the person's details (gender, hearing identity, provider number): staff only. */
  private: boolean;
}

export interface StateFormView {
  /** "email": read from the state's email as it arrived. "records": built from what the job has on file. */
  source: "email" | "records";
  sections: FormSection[];
  /** Notices printed above the form ("This request requires pre-authorization."). */
  banners: string[];
  /** When the state sent the email ("07/27/2026 1:45 PM PDT"), when known. */
  sentAt: string | null;
}

export const SECTION_TITLES: Record<1 | 2 | 3 | 4, string> = {
  1: "INTERPRETER AGENCY",
  2: "ACCOUNT INFORMATION",
  3: "APPOINTMENT INFORMATION",
  4: "APPOINTMENT LOCATION",
};

export const PRE_AUTHORIZATION_BANNER = "This request requires pre-authorization.";
