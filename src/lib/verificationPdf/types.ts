/**
 * What the Independent Contractor Invoice shows: every value already formatted as text, so the drawing code only places it.
 * The form is Kari Owen's ("ASL Professionals", Independent Contractor Invoice); each field below is a line on that form.
 */
export interface VerificationPdfData {
  /** "01/10/2024" in the job's own zone. */
  dateOfService: string;
  contact: string;
  phone: string;
  interpreter: string;
  /** The other interpreters booked on the job, comma separated (empty on a single-interpreter job). */
  team: string;
  /** The deaf participant. Agency-only: this PDF is never emailed. */
  client: string;
  location: string;
  situation: string;
  /** "10:00 AM" in the job's own zone. */
  scheduledBegin: string;
  scheduledEnd: string;
  /** The billed time as the hours-review screen computes it (worked time raised to the billing minimum): "2", "2.5". */
  billedHours: string;
  /** The mileage as the interpreter entered it: "0", "12.5". */
  mileage: string;
  notes: string;
  interpreterSignature: Uint8Array | null;
  /** The date the interpreter submitted the hours. */
  interpreterSignedDate: string;
  /** "Authorized by": the on-site contact's printed name, signature and the date they signed. */
  authorizedName: string;
  authorizedSignature: Uint8Array | null;
  authorizedDate: string;
}
