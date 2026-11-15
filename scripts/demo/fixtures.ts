import type { ClientData, ClientType } from "@/db/schema";

/**
 * The demo agency's fictional people and clients. Every name, address and number is made up: phone numbers use the 555-01xx range
 * reserved for fiction and client emails the reserved example.org domain (the app never emails client contacts). Interpreter emails
 * are plus-addresses of ONE inbox the demo team reads, so every offer or magic link the demo sends arrives there and nowhere else.
 */

export type InterpreterKey = "jordan" | "priya" | "marcus" | "sofia" | "hannah" | "daniel" | "grace" | "liam";
export type ClientKey = "harborview" | "pscc" | "cascadia" | "olympic" | "soundTransit";

export interface DemoInterpreter {
  key: InterpreterKey;
  name: string;
  email: string;
  /** The two primary demo interpreters sign in (DEMO_TERP1_EMAIL / DEMO_TERP2_EMAIL); the rest are agency-added profiles. */
  login: boolean;
  phone: string;
  city: string;
  serviceAreas: string[];
  certification: string;
  bio: string;
  rates: { state: string; nonState: string };
}

export interface DemoClient {
  key: ClientKey;
  name: string;
  type: ClientType;
  venue: string;
  address: string;
  building: string;
  parking: string;
  entrance: string;
  onsiteContact: string;
  onsitePhone: string;
  requester: { name: string; email: string; phone: string };
}

/** ("someone@example.com", "marcus") -> "someone+marcus@example.com"; any existing "+tag" on the inbox is dropped first. */
function plusAddress(inbox: string, tag: string): string {
  const [local, domain] = inbox.split("@");
  return `${local.split("+")[0]}+${tag}@${domain}`;
}

export interface FixtureEnv {
  terp1Email: string;
  terp2Email: string;
}

export function demoInterpreters({ terp1Email, terp2Email }: FixtureEnv): DemoInterpreter[] {
  const tagged = (tag: string) => plusAddress(terp1Email, tag);
  const person = (key: InterpreterKey, name: string, email: string, login: boolean, n: number, city: string, areas: string[], cert: string, bio: string): DemoInterpreter => ({
    key, name, email, login, phone: `(206) 555-01${String(10 + n).padStart(2, "0")}`, city, serviceAreas: areas, certification: cert, bio,
    rates: { state: (55 + n).toFixed(2), nonState: (68 + n * 2).toFixed(2) },
  });
  return [
    person("jordan", "Jordan Ellis", terp1Email, true, 1, "Seattle", ["Seattle", "Bellevue"], "NIC Advanced", "Medical and mental-health settings; 9 years in the field."),
    person("priya", "Priya Natarajan", terp2Email, true, 2, "Tacoma", ["Tacoma", "Olympia"], "NIC; BEI Basic", "Educational interpreting and pediatric appointments."),
    person("marcus", "Marcus Bell", tagged("marcus"), false, 3, "Everett", ["Everett", "Lynnwood"], "NIC", "Higher education, conferences and workplace meetings."),
    person("sofia", "Sofia Ramirez", tagged("sofia"), false, 4, "Seattle", ["Seattle", "Renton"], "NIC Master; trilingual (ASL/English/Spanish)", "Trilingual interpreter for community and legal settings."),
    person("hannah", "Hannah Cho", tagged("hannah"), false, 5, "Bellevue", ["Bellevue", "Redmond"], "NIC Advanced", "Healthcare, technical and workplace assignments."),
    person("daniel", "Daniel Whitecloud", tagged("daniel"), false, 6, "Olympia", ["Olympia", "Lacey"], "CDI", "Certified Deaf Interpreter; team and mental-health work."),
    person("grace", "Grace Okafor", tagged("grace"), false, 7, "Seattle", ["Virtual Only"], "NIC", "Remote VRI and virtual meetings."),
    person("liam", "Liam Hartley", tagged("liam"), false, 8, "Kent", ["Kent", "Auburn"], "NIC Advanced; SC:L", "Legal and court-adjacent assignments."),
  ];
}

export const DEMO_CLIENTS: DemoClient[] = [
  {
    key: "harborview", name: "Harborview Medical Clinic", type: "private_hospital",
    venue: "Harborview Medical Clinic", address: "1200 Harbor Crest Ave, Seattle, WA 98104", building: "East Pavilion, 3rd floor",
    parking: "Visitor garage on Crest Ave; validate at the front desk", entrance: "Main lobby, East Pavilion",
    onsiteContact: "Dana Whitfield, RN", onsitePhone: "(206) 555-0142",
    requester: { name: "Dana Whitfield", email: "scheduling@harborview-clinic.example.org", phone: "(206) 555-0142" },
  },
  {
    key: "pscc", name: "Puget Sound Community College", type: "organization",
    venue: "Puget Sound Community College", address: "4500 College Way N, Seattle, WA 98103", building: "Hawthorne Hall, Room 214",
    parking: "Lot C (visitor permits at the kiosk)", entrance: "North entrance by the library",
    onsiteContact: "Professor Alan Reyes", onsitePhone: "(206) 555-0157",
    requester: { name: "Morgan Lee, Disability Services", email: "access@pscc.example.org", phone: "(206) 555-0150" },
  },
  {
    key: "cascadia", name: "Cascadia Behavioral Health", type: "organization",
    venue: "Cascadia Behavioral Health", address: "880 Cedar Ridge Blvd, Bellevue, WA 98004", building: "Suite 300",
    parking: "Free surface lot behind the building", entrance: "Side door on Cedar Ridge; buzz suite 300",
    onsiteContact: "Renee Park, LMHC", onsitePhone: "(425) 555-0163",
    requester: { name: "Renee Park", email: "intake@cascadia-bh.example.org", phone: "(425) 555-0163" },
  },
  {
    key: "olympic", name: "Olympic Pediatrics", type: "organization",
    venue: "Olympic Pediatrics", address: "2150 Fir Street, Tacoma, WA 98402", building: "Clinic B",
    parking: "Street parking on Fir St", entrance: "Front desk, Clinic B",
    onsiteContact: "Lisa Grant, Practice Manager", onsitePhone: "(253) 555-0171",
    requester: { name: "Lisa Grant", email: "frontdesk@olympic-peds.example.org", phone: "(253) 555-0171" },
  },
  {
    key: "soundTransit", name: "Sound Transit Accessibility", type: "organization",
    venue: "Sound Transit Accessibility Office", address: "401 Union Station Plaza, Seattle, WA 98104", building: "Conference Room 5B",
    parking: "Union Station garage", entrance: "Plaza level, security desk",
    onsiteContact: "Terrence Moody, ADA Coordinator", onsitePhone: "(206) 555-0188",
    requester: { name: "Terrence Moody", email: "ada@soundtransit-access.example.org", phone: "(206) 555-0188" },
  },
];

/** The client record the Clients page reads (one default requester contact and one default location). */
export function clientData(c: DemoClient): ClientData {
  return {
    generalEmail: c.requester.email,
    generalPhone: c.requester.phone,
    billingOrganization: c.name,
    billingAddress: c.address,
    contacts: [{ id: `${c.key}-contact`, type: "Requester contact", name: c.requester.name, email: c.requester.email, phone: c.requester.phone, isDefault: true }],
    locations: [{ id: `${c.key}-location`, name: c.venue, streetAddress: c.address, roomOrSuite: c.building, parking: c.parking, entrance: c.entrance, isDefault: true }],
  };
}
