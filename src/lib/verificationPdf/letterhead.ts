import { DEFAULT_AGENCY_NAME, IS_ASL_PROFESSIONALS } from "@/lib/agency";

/**
 * Who the Independent Contractor Invoice is from. Production prints Kari Owen's letterhead exactly as on her form. Any other
 * deployment (the demo) never prints her name, logo or contact details: it prints its own agency name (NEXT_PUBLIC_AGENCY_NAME)
 * and only the AGENCY_INVOICE_* lines it sets; a blank line is left out. SERVER ONLY (the AGENCY_INVOICE_* values are not public).
 */
export interface Letterhead {
  name: string;
  tagline: string;
  contactName: string;
  contactTitle: string;
  phone: string;
  fax: string;
  email: string;
  /** The footer's "Send completed invoice to: ..." text. */
  sendTo: string;
  /** Kari's hands mark, drawn only on her own invoices. */
  showMark: boolean;
}

const ASL_PROFESSIONALS_LETTERHEAD: Letterhead = {
  name: "ASL Professionals",
  tagline: "American Sign Language Interpreting Service",
  contactName: "Kari Owen",
  contactTitle: "Owner",
  phone: "(253) 759-7653 Voice",
  fax: "(509) 895-7136 Fax",
  email: "aslprofessionals@comcast.net",
  sendTo: "ASL Professionals, P O Box 265  Henderson, TN  38340",
  showMark: true,
};

const env = (key: string): string => process.env[key]?.trim() ?? "";

export function invoiceLetterhead(): Letterhead {
  if (IS_ASL_PROFESSIONALS) return ASL_PROFESSIONALS_LETTERHEAD;
  const mailingAddress = env("AGENCY_INVOICE_MAILING_ADDRESS");
  return {
    name: DEFAULT_AGENCY_NAME,
    tagline: env("AGENCY_INVOICE_TAGLINE") || "American Sign Language Interpreting Services",
    contactName: env("AGENCY_INVOICE_CONTACT_NAME"),
    contactTitle: env("AGENCY_INVOICE_CONTACT_TITLE"),
    phone: env("AGENCY_INVOICE_PHONE"),
    fax: env("AGENCY_INVOICE_FAX"),
    email: env("AGENCY_INVOICE_EMAIL"),
    sendTo: mailingAddress ? `${DEFAULT_AGENCY_NAME}, ${mailingAddress}` : DEFAULT_AGENCY_NAME,
    showMark: false,
  };
}
