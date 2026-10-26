import type { LegalDocument } from "@/components/legal/LegalPage";

/** Approved Privacy Policy text. Edit the wording here; the page layout lives in LegalPage. */
export const privacyPolicy: LegalDocument = {
  title: "terpDESK Privacy Policy",
  effectiveDate: "October 27, 2026",
  sections: [
    {
      heading: "Who we are",
      blocks: [
        {
          kind: "p",
          text: "terpDESK is owned and operated by Christy McDade Interpreting Services, a Washington-based business (“terpDESK,” “we,” “us,” or “our”). This Privacy Policy explains how we collect, use, disclose, and retain personal information through myterpdesk.com and the terpDESK platform. terpDESK provides tools for interpreting agencies and interpreters, including scheduling, assignment coordination, email-request importing, document management, service records, and available billing-preparation features.",
        },
      ],
    },
    {
      heading: "Our role in handling information",
      blocks: [
        { kind: "p", text: "We handle information in two main capacities:" },
        {
          kind: "list",
          items: [
            { text: "For our own business operations, such as managing accounts, subscriptions, support inquiries, and website security." },
            { text: "On behalf of agency customers, such as processing appointment information, interpreter assignments, uploaded documents, and service records under their instructions and applicable agreements." },
          ],
        },
        {
          kind: "p",
          text: "Agencies determine what information they submit and how they use their workspaces. Their own privacy notices and obligations may also apply. This policy is not an agency’s HIPAA Notice of Privacy Practices and does not replace a Business Associate Agreement where one is required.",
        },
      ],
    },
    {
      heading: "Information we collect",
      blocks: [
        { kind: "p", text: "Depending on how you use terpDESK, we may process:" },
        {
          kind: "list",
          items: [
            { label: "Account and profile information:", text: "Names, email addresses, phone numbers, agency affiliations, account roles, profile information, credentials, and subscription details." },
            { label: "Scheduling and service information:", text: "Assignment dates, times, locations, availability, interpreter assignments, client contact information, service requirements, notes, hours worked, mileage, signatures, and related records." },
            { label: "Documents and communications:", text: "Prep materials, credential documents, service-verification records, forwarded request emails, attachments, and support correspondence." },
            { label: "Agency-submitted records:", text: "May contain sensitive information, including health-related information, depending on the services being coordinated. Customers must only submit information they are authorized to provide." },
            { label: "Subscription and payment information:", text: "Subscription status, charges, and transaction references. Payment-card details are entered exclusively through Stripe; terpDESK does not directly receive or store full credit card numbers." },
            { label: "Technical information:", text: "Functional cookies used for login and session management. Vercel hosting automatically collects standard access and error logs, including IP addresses and browser user-agent strings, strictly for security and troubleshooting." },
          ],
        },
        { kind: "p", text: "We receive information from users, agency customers, authorized forwarded emails, and the service providers involved in operating the platform." },
      ],
    },
    {
      heading: "How email importing works",
      blocks: [
        {
          kind: "p",
          text: "terpDESK processes messages explicitly forwarded to its designated AWS email-import address. It does not connect to or browse users’ mailboxes. The import feature uses programmed text-matching rules to extract assignment information. It does not use third-party AI to read or interpret requests.",
        },
        {
          kind: "p",
          text: "People forwarding messages must have permission to share their contents and should include only information needed for the relevant work. Imported information should be reviewed for accuracy before it is relied upon.",
        },
      ],
    },
    {
      heading: "How we use information",
      blocks: [
        { kind: "p", text: "We use information to:" },
        {
          kind: "list",
          items: [
            { text: "Create and manage accounts and agency connections." },
            { text: "Provide scheduling, assignment, document, and service-record features." },
            { text: "Process forwarded job requests." },
            { text: "Send assignment offers, account messages, and service notifications." },
            { text: "Prepare available billing records, timesheets, and exports." },
            { text: "Manage subscriptions and payments." },
            { text: "Respond to support inquiries." },
            { text: "Maintain security, investigate misuse, and troubleshoot problems." },
            { text: "Meet applicable legal and contractual obligations." },
          ],
        },
        { kind: "p", text: "Agency-controlled information is processed according to applicable customer agreements and instructions." },
      ],
    },
    {
      heading: "When information is disclosed",
      blocks: [
        { kind: "p", text: "Information may be disclosed to:" },
        {
          kind: "list",
          items: [
            { label: "Authorized agency users and interpreters:", text: "Access depends on account roles, agency relationships, assignments, and permissions. An interpreter’s connection to multiple agencies does not authorize one agency to access another agency’s private records." },
            { label: "Service providers:", text: "Providers process information as needed to support platform functions. Current providers include: Vercel (application hosting), Neon (PostgreSQL database hosting), Amazon Web Services (SES and Lambda for email processing, S3 for file storage and backups), and Stripe (subscription payments)." },
            { label: "Legal and security recipients:", text: "We may disclose information when legally required or permitted, including to respond to valid legal process or address fraud, security incidents, or threats to rights and safety, subject to applicable restrictions." },
            { label: "Business successors:", text: "Information may be transferred in connection with a merger, acquisition, or transfer of the business, subject to applicable law and contractual restrictions." },
          ],
        },
        { kind: "p", text: "terpDESK does not sell personal information, share it for targeted advertising, or permit providers to use customer information for their own independent purposes." },
      ],
    },
    {
      heading: "Cookies and tracking",
      blocks: [
        {
          kind: "p",
          text: "terpDESK uses strictly necessary functional cookies to maintain login sessions and provide account functionality. We do not use advertising pixels, marketing cookies, or session recordings across our website, application, or payment flows. Blocking necessary cookies may prevent account features from working.",
        },
      ],
    },
    {
      heading: "Security and health information",
      blocks: [
        { kind: "p", text: "We use access controls and other safeguards intended to protect information against unauthorized access, use, alteration, or disclosure. No system can guarantee absolute security." },
        { kind: "p", text: "Where terpDESK processes protected health information as a business associate or subcontractor, the applicable Business Associate Agreement governs that processing. Customers must not submit protected health information until the necessary agreements and service arrangements are in place." },
        { kind: "p", text: "Please do not include patient records or other sensitive assignment details in general privacy or support emails. Contact us first for an appropriate method of communication." },
      ],
    },
    {
      heading: "Retention and deletion",
      blocks: [
        { kind: "p", text: "We retain information for the purposes described in this policy, subject to applicable law, customer agreements, and documented retention schedules." },
        {
          kind: "list",
          items: [
            { text: "Following termination, agencies have 30 calendar days to complete a data export. After 30 days, active customer data is permanently hard-deleted from our databases." },
            { text: "Forwarded emails and attachments are processed and removed from AWS temporary storage within 7 days." },
            { text: "System logs and automated backups are retained for up to 30 days before being overwritten." },
            { text: "Some records may need to be retained to meet legal obligations or resolve disputes. Applicable BAAs and legal requirements govern the return, retention, or destruction of protected health information." },
          ],
        },
      ],
    },
    {
      heading: "Your choices and privacy requests",
      blocks: [
        {
          kind: "p",
          text: "You may contact us to request access to, correction of, or deletion of personal information, or to ask about other rights available under applicable law. We may need to verify your identity and authority before acting on a request. For information maintained on behalf of an agency, we may direct your request to that agency or assist it in responding. Deleting an interpreter account does not necessarily delete records an agency is authorized or required to retain.",
        },
      ],
    },
    {
      heading: "Children and service recipients",
      blocks: [
        {
          kind: "p",
          text: "terpDESK accounts are intended for authorized adult users. Authorized commercial clients (e.g., hospital or school coordinators) may submit requests directly via public intake forms. Patients and minors do not submit requests directly. Agency records may include information about minors receiving interpreting services; that information must be handled under the agency’s authority and applicable agreements.",
        },
      ],
    },
    {
      heading: "Service location",
      blocks: [
        { kind: "p", text: "terpDESK currently serves U.S.-based customers. All data hosting, backups, and processing occurs exclusively in the United States." },
      ],
    },
    {
      heading: "Changes to this policy",
      blocks: [
        { kind: "p", text: "We may update this policy as our services or practices change. We will update the effective date and provide any additional notice or obtain consent required by applicable law." },
      ],
    },
    {
      heading: "Contact",
      blocks: [
        {
          kind: "contact",
          contact: {
            name: "Christy McDade Interpreting Services",
            attention: "Attn: terpDESK Privacy",
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
