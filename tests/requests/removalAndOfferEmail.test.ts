import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { announceBookingRemoval, removalCopy } from "@/lib/bookingRemoval";
import type { RemovalEffects, RemovalJob } from "@/lib/bookingRemoval";
import { OFFER_EMAIL_IN_PERSON_NOTE, OFFER_EMAIL_VIRTUAL_NOTE, buildOfferEmail } from "@/lib/jobEmails";
import { summarizeJob } from "@/lib/jobSummary";
import type { NotificationInput } from "@/lib/notifications";
import { offerCardTitle } from "@/lib/offerPlace";
import type { ActivityInput } from "@/lib/requestActivity";
import { sendEmail } from "@/lib/timesheetEmail";

const ADDRESS = "4800 Sand Point Way NE, Seattle, WA 98105";
/** Values that must never be in an interpreter email (made up). */
const NEVER_EMAILED = [ADDRESS, "OTOLARYNGOLOGY CLINIC", "Seattle Children's Hospital", "202787460", "Test Client Person", "123456789WA"];
const job: RemovalJob = {
  id: "5a8c56a4-0000-4000-8000-000000000001",
  title: "ODHH SRN #202787460",
  createdAt: new Date("2026-11-24T17:00:00Z"),
  data: {
    intake: { program: "WA ODHH", odhhSrn: "202787460", providerOneNumber: "123456789WA" },
    requester: { org: "Seattle Children's Hospital" },
    details: { format: "In person", deafParticipant: "Test Client Person", timeZone: "America/Los_Angeles" },
    onsite: { venue: "OTOLARYNGOLOGY CLINIC", room: "Ocean 8", address: ADDRESS },
    schedule: { startsAt: "2026-11-24T17:00:00.000Z", endsAt: "2026-11-24T18:00:00.000Z" },
  },
};
const absentFrom = (text: string) => {
  for (const value of NEVER_EMAILED) assert.ok(!text.includes(value) && !text.includes(value.replace("'", "&#39;")), `in the email: ${value}`);
};

describe("the offer email", () => {
  it("tells an in-person interpreter to click through for the location, with the place itself left out of the email", () => {
    const email = buildOfferEmail(summarizeJob(job), "https://x.test/accept", "https://x.test/decline", "Mon, Nov 23, 9:00 AM PST");
    assert.ok(email.text.includes(OFFER_EMAIL_IN_PERSON_NOTE));
    assert.ok(email.html.includes(OFFER_EMAIL_IN_PERSON_NOTE));
    assert.ok(!email.text.includes("The exact location is shared after you accept"));
    absentFrom(`${email.subject}${email.html}${email.text}`);
  });

  it("keeps the virtual wording", () => {
    const virtual = { ...job, data: { ...(job.data as Record<string, unknown>), details: { format: "Virtual", timeZone: "America/Los_Angeles" } } };
    assert.ok(buildOfferEmail(summarizeJob(virtual), "a", "d", null).text.includes(OFFER_EMAIL_VIRTUAL_NOTE));
  });
});

describe("the email link's 'Offer Accepted!' card", () => {
  it("titles a state job 'ODHH <SRN> - <organization>', and any other job by its own title", () => {
    assert.equal(offerCardTitle(job), "ODHH 202787460 - Seattle Children's Hospital");
    assert.equal(offerCardTitle({ title: "Team meeting", data: { requester: { org: "WA ODHH" } } }), "Team meeting");
  });
});

describe("Remove booking: telling the interpreter and keeping a record", () => {
  const savedSilent = process.env.EMAIL_SILENT_MODE;
  afterEach(() => {
    if (savedSilent === undefined) delete process.env.EMAIL_SILENT_MODE;
    else process.env.EMAIL_SILENT_MODE = savedSilent;
  });

  const run = async (over: Partial<RemovalEffects> = {}) => {
    const seen = { activity: [] as ActivityInput[], audit: [] as { action: string; details: string; userId: string }[], notify: [] as { id: string; input: NotificationInput }[], email: [] as { to: string; subject: string; html: string; text: string }[] };
    const fx: RemovalEffects = {
      loadJob: async (id) => (id === job.id ? job : null),
      interpreter: async () => ({ email: "interp@example.org", name: "Sample Interpreter" }),
      notify: async (id, input) => void seen.notify.push({ id, input }),
      email: async (to, subject, html, text) => void seen.email.push({ to, subject, html, text }),
      activity: async (entry) => void seen.activity.push(entry),
      audit: async (entry) => void seen.audit.push(entry),
      baseUrl: () => "https://app.test",
      ...over,
    };
    const told = await announceBookingRemoval([{ requestId: job.id, offerId: "offer-9", interpreterId: "interp-1", positionNumber: 1 }], { userId: "staff-1", email: "staff@example.org", name: "Josie" }, fx);
    return { told, seen };
  };

  it("records an agency history line and an audit row naming the staff member, the interpreter and the position", async () => {
    const { told, seen } = await run();
    assert.equal(told, 1);
    assert.deepEqual(seen.activity[0], { requestId: job.id, interpreterId: "interp-1", audience: "agency", kind: "booking_removed", message: "Josie removed Sample Interpreter from Position 1", actorLabel: "Josie" });
    assert.equal(seen.audit[0].action, "booking_removed");
    assert.equal(seen.audit[0].userId, "staff-1");
    assert.equal(seen.audit[0].details, `requestId=${job.id}; offerId=offer-9; interpreterId=interp-1; position=1`);
  });

  it("puts a removal banner in the interpreter's app naming the job's header and when it was", async () => {
    const { seen } = await run();
    const n = seen.notify[0];
    assert.equal(n.id, "interp-1");
    assert.equal(n.input.kind, "booking_removed");
    assert.equal(n.input.href, "/jobs");
    assert.equal(n.input.title, "Removed from a booking");
    assert.ok(n.input.message.startsWith("You have been removed from ODHH 202787460 - Seattle Children's Hospital on Tue, Nov 24, 2026 at 9:00 AM"));
  });

  it("emails only the APT reference, the date and time and links to their jobs and calendar", async () => {
    const { seen } = await run();
    const e = seen.email[0];
    assert.equal(e.to, "interp@example.org");
    assert.match(e.subject, /^Removed from booking APT-[A-Z0-9]+ - terpDESK$/);
    assert.ok(e.text.includes("Tue, Nov 24, 2026 at 9:00 AM"));
    assert.ok(e.html.includes("https://app.test/jobs") && e.html.includes("https://app.test/interpreter-calendar"));
    absentFrom(`${e.subject}${e.html}${e.text}`);
    assert.ok(!/—/.test(`${e.subject}${e.text}${seen.notify[0].input.message}`), "no em-dash in the copy");
  });

  it("skips the email when the interpreter has no address, and skips a job that no longer exists", async () => {
    assert.equal((await run({ interpreter: async () => ({ email: null, name: "Sample Interpreter" }) })).seen.email.length, 0);
    const gone = await run({ loadJob: async () => null });
    assert.equal(gone.told, 0);
    assert.equal(gone.seen.notify.length + gone.seen.activity.length + gone.seen.audit.length, 0);
  });

  it("never throws: a failing step is logged and the removal stands", async () => {
    const { told } = await run({ notify: async () => { throw new Error("db down"); } });
    assert.equal(told, 0);
  });

  it("sends nothing in Silent Mode (the live email step is sendEmail)", async () => {
    process.env.EMAIL_SILENT_MODE = "true";
    assert.equal(await sendEmail("interp@example.org", "s", "<p>h</p>", "t"), "suppressed");
  });

  it("builds the copy without an em-dash", () => {
    const c = removalCopy({ headline: "ODHH 1 - Org", reference: "APT-1", dateLabel: "Tue, Nov 24, 2026", timeLabel: "9:00 AM", jobsUrl: "j", calendarUrl: "c" });
    assert.ok(!/—/.test(`${c.bannerTitle}${c.bannerMessage}${c.subject}${c.text}`));
  });
});
