import type { LegalDocument } from "@/components/legal/LegalPage";

/** Approved Terms & Conditions text. Edit the wording here; the page layout lives in LegalPage. */
export const termsAndConditions: LegalDocument = {
  title: "terpDESK Terms & Conditions",
  effectiveDate: "October 27, 2026",
  sections: [
    {
      heading: "Agreement and operator",
      blocks: [
        {
          kind: "p",
          text: "These Terms & Conditions govern access to and use of terpDESK, operated by Christy McDade Interpreting Services (“terpDESK,” “we,” “us,” or “our”). By affirmatively accepting these Terms during registration or subscription, you agree to them. If you accept on behalf of an agency or other organization, you represent that you have authority to bind it.",
        },
        {
          kind: "p",
          text: "An accepted agency service agreement or order form controls over conflicting provisions of these Terms concerning that agency’s commercial arrangement. An applicable Business Associate Agreement controls concerning protected health information.",
        },
      ],
    },
    {
      heading: "What terpDESK provides",
      blocks: [
        {
          kind: "p",
          text: "terpDESK provides software tools for coordinating interpreting work, including available scheduling, email-import, assignment, document, service-record, and billing-preparation features. terpDESK does not itself provide interpreting services, employ interpreters on behalf of agencies, guarantee assignments, or process payroll payments for interpreting work. Billing records and exports do not replace accounting, tax, payroll, or legal advice.",
        },
      ],
    },
    {
      heading: "Accounts and authorized access",
      blocks: [
        {
          kind: "p",
          text: "Account holders must be at least 18 and provide accurate registration information. You must protect your credentials and job-response links, use only authorized access, and promptly report suspected account compromise. Agencies are responsible for assigning appropriate access to staff and interpreters and removing access when it is no longer authorized.",
        },
      ],
    },
    {
      heading: "Customer responsibilities",
      blocks: [
        { kind: "p", text: "You are responsible for:" },
        {
          kind: "list",
          items: [
            { text: "Having authority to submit personal information, documents, and emails." },
            { text: "Providing required notices and obtaining necessary permissions." },
            { text: "Maintaining accurate assignments, credentials, rates, and service records." },
            { text: "Reviewing imported information and calculations." },
            { text: "Determining interpreter qualifications and suitability." },
            { text: "Meeting your own contractual, employment, tax, and regulatory obligations." },
          ],
        },
        { kind: "p", text: "Using terpDESK does not transfer those responsibilities to us." },
      ],
    },
    {
      heading: "Email imports and assignment responses",
      blocks: [
        {
          kind: "p",
          text: "terpDESK imports information from emails explicitly forwarded to its designated import address using programmed extraction rules. Formatting changes, incomplete messages, and other conditions can produce incomplete or incorrect results. Users must verify imported information before relying on it for staffing, service delivery, or billing.",
        },
        {
          kind: "p",
          text: "Interpreters may respond to eligible assignment offers by email links. They must protect those links and confirm the assignment status shown by the service. Email delivery and processing may be delayed or fail. terpDESK is not an emergency-response service.",
        },
      ],
    },
    {
      heading: "Agency fees",
      blocks: [
        {
          kind: "p",
          text: "Agency subscription fees, fixed charges, usage charges, payment schedules, and billing automation rules (including automated ODHH parsing, 1.5x non-state multipliers, 15-minute rounding, and vendor/insurance fees) are specified in the agency’s accepted proposal or service agreement. Additional services or development work require separate agreement.",
        },
      ],
    },
    {
      heading: "Interpreter subscriptions",
      blocks: [
        {
          kind: "p",
          text: "Interpreter subscriptions cost $9 per month following a 30-day free trial. The trial automatically converts to a paid subscription billed monthly via Stripe. The subscription renews monthly until canceled. Users may cancel anytime directly through their account dashboard prior to the next billing cycle. We do not offer refunds for partial months; access will be retained through the end of the paid period.",
        },
      ],
    },
    {
      heading: "Billing records and exports",
      blocks: [
        {
          kind: "p",
          text: "terpDESK may prepare timesheets, service records, billing calculations, and accounting exports (e.g., bi-weekly QuickBooks exports) based on customer-provided information and configuration. Customers must review and approve these records before invoicing, paying interpreters, or importing data into accounting systems. terpDESK does not guarantee reimbursement, payer acceptance, payment collection, or the accuracy of customer-configured rates.",
        },
      ],
    },
    {
      heading: "Customer information and ownership",
      blocks: [
        {
          kind: "p",
          text: "As between the customer and terpDESK, customers retain their rights in information and documents they submit. These Terms do not override individuals’ privacy rights. Customers grant terpDESK limited permission to host, process, transmit, and otherwise handle that information as needed to provide the service and meet applicable obligations. terpDESK and its licensors retain their rights in the software, branding, and service materials.",
        },
      ],
    },
    {
      heading: "Privacy and protected health information",
      blocks: [
        {
          kind: "p",
          text: "Our Privacy Policy describes platform information practices. Customers may submit protected health information only after the necessary BAA and appropriate service arrangements are in effect. These Terms do not replace a BAA. Each party remains responsible for the legal and contractual obligations applicable to its role. Use of terpDESK alone does not establish an agency’s HIPAA compliance.",
        },
      ],
    },
    {
      heading: "Acceptable use",
      blocks: [
        { kind: "p", text: "You may not:" },
        {
          kind: "list",
          items: [
            { text: "Access records or accounts without authorization." },
            { text: "Upload malicious software or interfere with service security." },
            { text: "Use the service for unlawful, fraudulent, or abusive activity." },
            { text: "Submit information you lack authority to share." },
            { text: "Falsify credentials, service records, signatures, or billing information." },
            { text: "Circumvent access restrictions." },
          ],
        },
      ],
    },
    {
      heading: "Availability and support",
      blocks: [
        {
          kind: "p",
          text: "We work to maintain the service, but interruptions can occur due to maintenance, provider outages, security events, or other causes. Any specific uptime, support-response, or recovery commitments must appear in an applicable written agreement.",
        },
      ],
    },
    {
      heading: "Suspension and termination",
      blocks: [
        {
          kind: "p",
          text: "We may restrict access when reasonably necessary to address security threats, unlawful use, or a material breach of these Terms. Any suspension for unpaid fees will follow the applicable subscription or agency agreement. Upon cancellation, agencies are granted a 30-day window to export their data before it is permanently deleted from the platform. Termination does not eliminate valid outstanding payment obligations or override applicable data-return, retention, or BAA requirements.",
        },
      ],
    },
    {
      heading: "Warranties and liability",
      blocks: [
        {
          kind: "p",
          text: "Except for express commitments in a signed agreement and rights that cannot legally be excluded, terpDESK is provided without a guarantee that it will be uninterrupted, error-free, or suitable for every customer workflow. Customers remain responsible for reviewing scheduling and financial outputs.",
        },
      ],
    },
    {
      heading: "Governing law and disputes",
      blocks: [{ kind: "p", text: "These Terms are governed by Washington law, subject to applicable mandatory legal protections." }],
    },
    {
      heading: "Changes to these Terms",
      blocks: [
        {
          kind: "p",
          text: "We will provide notice of material changes and obtain renewed acceptance where required. Changes will not retroactively alter an accepted agency agreement without the agreement or legal authority required to do so.",
        },
      ],
    },
    {
      heading: "Contact",
      blocks: [
        {
          kind: "contact",
          contact: {
            name: "Christy McDade Interpreting Services",
            attention: "Attn: terpDESK Support",
            address: "6949 Compass St. SE, Lacey, WA 98513",
            email: "info@my-deva.com",
            phone: "253-394-3781",
            website: "myterpdesk.com",
          },
        },
      ],
    },
  ],
};
