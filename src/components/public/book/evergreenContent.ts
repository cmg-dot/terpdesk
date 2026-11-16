/**
 * Everything the demo agency website (/book) says. "Evergreen Interpreting Group" is fictional: its name is fixed here, not read from
 * NEXT_PUBLIC_AGENCY_NAME, so the page can never show a real agency's name. Phone numbers are in the reserved 555-01xx range and the
 * email domain is a reserved .example one.
 *
 * The featured interpreters are the demo roster's own fictional profiles (scripts/demo/fixtures.ts), written exactly as the roster has
 * them, so a "Request <name>" submission matches someone staff can offer the job to. The two demo team members are left out.
 */

export const SITE = {
  name: "Evergreen Interpreting Group",
  phone: "(360) 555-0194",
  phoneHref: "tel:+13605550194",
  email: "scheduling@evergreen-interpreting.example",
  location: "Olympia, Washington",
  hours: "Monday to Friday, 8 AM to 5 PM Pacific",
  coordinator: { name: "Jordan Ellis", role: "Scheduling coordinator" },
} as const;

export const NAV = [
  { href: "#overview", label: "Overview" },
  { href: "#services", label: "Services" },
  { href: "#interpreters", label: "Interpreters" },
  { href: "#about", label: "About" },
] as const;

export type ServiceKey = "onsite" | "vri" | "team";

export interface Service {
  key: ServiceKey;
  title: string;
  body: string;
  points: readonly string[];
}

export const SERVICES = [
  {
    key: "onsite",
    title: "On-site interpreting",
    body: "A credentialed interpreter in the room for medical visits, classes, legal meetings and workplace conversations.",
    points: ["Clinics, schools, courts and offices", "Deaf interpreters (CDI) teamed in when needed", "Parking and entrance details passed on"],
  },
  {
    key: "vri",
    title: "Video remote interpreting",
    body: "An interpreter joins on Zoom, Teams or your own platform, booked as easily as an in-person job.",
    points: ["Any platform you already use", "Ideal for short or same-week sessions", "Link details confirmed with the interpreter"],
  },
  {
    key: "team",
    title: "Team and recurring requests",
    body: "Teams of two for long or complex sessions, and standing appointments scheduled from a single request.",
    points: ["Team interpreting for sessions over two hours", "Weekly classes and ongoing care", "The same interpreter whenever possible"],
  },
] as const satisfies readonly Service[];

export type Credential = "NIC" | "NIC Advanced" | "NIC Master" | "CDI" | "SC:L";
export type Modality = "On-site" | "VRI";

export interface FeaturedInterpreter {
  /** Exactly as the demo roster spells it: the request page matches the requested name against the roster. */
  name: string;
  initials: string;
  credentials: readonly Credential[];
  languages?: string;
  areas: readonly string[];
  modalities: readonly Modality[];
  /** The roster's weekly availability pattern (scripts/demo/people.ts). */
  availability: string;
  specialties: readonly string[];
  bio: string;
}

export const INTERPRETERS = [
  {
    name: "Sofia Ramirez",
    initials: "SR",
    credentials: ["NIC Master"],
    languages: "Trilingual: ASL, English, Spanish",
    areas: ["Seattle", "Renton"],
    modalities: ["On-site", "VRI"],
    availability: "Weekdays, 8 AM to 5 PM",
    specialties: ["Community", "Legal", "Spanish-speaking families"],
    bio: "Trilingual interpreter for community and legal settings.",
  },
  {
    name: "Daniel Whitecloud",
    initials: "DW",
    credentials: ["CDI"],
    areas: ["Olympia", "Lacey"],
    modalities: ["On-site", "VRI"],
    availability: "Weekdays, 8 AM to 5 PM",
    specialties: ["Team assignments", "Mental health"],
    bio: "Certified Deaf Interpreter; team and mental-health work.",
  },
  {
    name: "Grace Okafor",
    initials: "GO",
    credentials: ["NIC"],
    areas: ["Anywhere, online"],
    modalities: ["VRI"],
    availability: "Weekdays, 9 AM to 6 PM",
    specialties: ["Video remote", "Virtual meetings"],
    bio: "Remote VRI and virtual meetings.",
  },
  {
    name: "Liam Hartley",
    initials: "LH",
    credentials: ["NIC Advanced", "SC:L"],
    areas: ["Kent", "Auburn"],
    modalities: ["On-site", "VRI"],
    availability: "Weekdays, 8 AM to 5 PM",
    specialties: ["Legal", "Court-adjacent"],
    bio: "Legal and court-adjacent assignments.",
  },
] as const satisfies readonly FeaturedInterpreter[];

export const ABOUT = {
  heading: "Rooted in the Pacific Northwest",
  paragraphs: [
    "Evergreen Interpreting Group schedules ASL interpreters and Certified Deaf Interpreters for clinics, schools, courts and workplaces from Everett to Olympia, and anywhere online.",
    "Every request is read by a person on our scheduling team. We match the setting to an interpreter's credentials and experience, and we confirm the details with you before anyone is booked.",
  ],
  commitments: [
    { title: "Credentialed interpreters", body: "NIC, CDI and specialist-certified interpreters, matched to the setting." },
    { title: "Confirmed before it's booked", body: "We check the date, place and needs with you, then confirm the interpreter." },
    { title: "Deaf-centered", body: "Communication preferences travel with every request to the interpreter." },
  ],
} as const;

export const NEXT_STEPS = [
  { title: "We review your request", body: "A coordinator reads it the same business day." },
  { title: "We match an interpreter", body: "Chosen for the setting, credentials and location." },
  { title: "You get a confirmation", body: "With the interpreter's name before the appointment." },
] as const;
