import { before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTableName } from "drizzle-orm";
import type { Table } from "drizzle-orm";
import { install, reset, state } from "../availability/harness";

/**
 * The reply-link step end to end against a stand-in database: who may set the link, what is held, what is kept, what the booked
 * interpreters are told, and that the link itself is never written to a log, an activity line or an audit row.
 */

let db: object;
let applyReplyMeetingLink: typeof import("@/lib/replyMeetingLinkStore").applyReplyMeetingLink;
let handleStateNotice: typeof import("@/lib/inboundMail/handle").handleStateNotice;
before(async () => {
  await install();
  db = (await import("@/db")).db;
  applyReplyMeetingLink = (await import("@/lib/replyMeetingLinkStore")).applyReplyMeetingLink;
  handleStateNotice = (await import("@/lib/inboundMail/handle")).handleStateNotice;
});

const LINK = "https://dshs-telehealth.zoom.us/j/83889756341?pwd=PsZu1TFiFU54Tfi93B6Rl7HhhdYGZ6.1";
const SRN = "202787804";
const REPLY = `Here is the link: ${LINK}\n\nJackie King\nDVR\n\n---------- Original Message ----------\nService Request #${SRN}\nOld: https://old.zoom.us/j/1111`;
const SUBJECT = `RE: Interpreter Request - 12/15/2026 - #${SRN}`;

type Written = { table: string; set: { data?: Record<string, unknown> } };
let written: Written[] = [];

const jobRow = (data: Record<string, unknown> = {}, status = "draft") => ({
  id: "11111111-1111-4111-8111-111111111111",
  status,
  title: `ODHH SRN #${SRN}`,
  createdAt: new Date("2026-12-15T18:00:00Z"),
  data: {
    intake: { odhhSrn: SRN },
    details: { formatCode: "virtual", format: "Virtual", platform: "Link in request email", startsAt: "2026-12-15T18:00:00.000Z", endsAt: "2026-12-15T19:00:00.000Z" },
    schedule: { startsAt: "2026-12-15T18:00:00.000Z", endsAt: "2026-12-15T19:00:00.000Z" },
    requester: { email: "DVR.aslaccess@dshs.wa.gov", billEmail: "dvr.languageaccess@dshs.wa.gov; billing@agency-contact.example" },
    ...data,
  },
});

beforeEach(() => {
  reset();
  written = [];
  state.rows.requests = [jobRow()];
  const fake = db as unknown as Record<string, unknown>;
  const tx = {
    select: () => ({ from: (t: Table) => ({ where: () => ({ for: async () => state.rows[getTableName(t)] ?? [] }) }) }),
    update: (t: Table) => ({
      set: (set: Written["set"]) => ({
        where: () => ({
          returning: async () => {
            written.push({ table: getTableName(t), set });
            return [{ ...(state.rows[getTableName(t)]?.[0] as object), data: set.data }];
          },
        }),
      }),
    }),
  };
  fake.transaction = async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx);
});

const input = (over: Partial<Parameters<typeof import("@/lib/replyMeetingLinkStore").applyReplyMeetingLink>[0]> = {}) => ({ srn: SRN, senderEmail: "jackie.king@dshs.wa.gov", bodyText: REPLY, authenticated: true, messageId: "m-1", ...over });
const activityKinds = () => state.inserted.filter((i) => i.table === "request_activity").map((i) => (i.values as { kind: string }).kind);
const everythingWritten = () => JSON.stringify(state.inserted);
const savedDetails = (): Record<string, unknown> => ((written[0]?.set.data ?? {}).details ?? {}) as Record<string, unknown>;

describe("who may set the link", () => {
  it("a state address with authenticated mail sets it", async () => {
    const result = await applyReplyMeetingLink(input());
    assert.deepEqual(result, { outcome: "link_applied", requestId: jobRow().id });
    assert.equal(savedDetails().meetingLink, LINK);
    assert.equal(savedDetails().virtualLink, LINK);
    assert.equal(savedDetails().platform, "Zoom");
  });
  it("any Washington government address does too", async () => {
    assert.equal((await applyReplyMeetingLink(input({ senderEmail: "someone@hca.wa.gov" })))?.outcome, "link_applied");
  });
  it("so does an address the job names, even outside government", async () => {
    assert.equal((await applyReplyMeetingLink(input({ senderEmail: "Billing@Agency-Contact.example" })))?.outcome, "link_applied");
  });
  it("so does a registered agency user", async () => {
    state.rows.users = [{ id: "staff-1" }];
    assert.equal((await applyReplyMeetingLink(input({ senderEmail: "kari@ourteam.example" })))?.outcome, "link_applied");
  });
  it("a stranger is held: nothing changes, staff get a note, the link itself is not in it", async () => {
    const result = await applyReplyMeetingLink(input({ senderEmail: "stranger@example.org" }));
    assert.equal(result?.outcome, "link_held");
    assert.equal(written.length, 0);
    assert.ok(activityKinds().some((k) => k.startsWith("reply_link_note:")));
    assert.equal(everythingWritten().includes("83889756341"), false);
    assert.ok(everythingWritten().includes("dshs-telehealth.zoom.us"));
  });
  it("a state address whose mail was not authenticated is held too", async () => {
    const result = await applyReplyMeetingLink(input({ authenticated: false }));
    assert.equal(result?.outcome, "link_held");
    assert.equal(written.length, 0);
  });
  it("a held link is noted once per email: a redelivery adds nothing", async () => {
    await applyReplyMeetingLink(input({ senderEmail: "stranger@example.org" }));
    state.rows.request_activity = [{ id: "a1" }];
    state.inserted = [];
    await applyReplyMeetingLink(input({ senderEmail: "stranger@example.org" }));
    assert.equal(state.inserted.length, 0);
  });
});

describe("what it will not change", () => {
  it("keeps a link already on the job and tells staff about a different one", async () => {
    state.rows.requests = [jobRow({ details: { formatCode: "virtual", meetingLink: "https://x.zoom.us/j/9" } })];
    const result = await applyReplyMeetingLink(input());
    assert.equal(result?.outcome, "link_kept");
    assert.equal(written.length, 0);
    assert.ok(activityKinds().some((k) => k.startsWith("reply_link_note:")));
  });
  it("the same link again (a repeat delivery) is quiet", async () => {
    state.rows.requests = [jobRow({ details: { formatCode: "virtual", meetingLink: LINK } })];
    assert.equal((await applyReplyMeetingLink(input()))?.outcome, "link_kept");
    assert.equal(written.length, 0);
    assert.equal(state.inserted.length, 0);
  });
  it("a cancelled job is left alone", async () => {
    state.rows.requests = [jobRow({}, "Cancelled")];
    assert.equal(await applyReplyMeetingLink(input()), null);
    assert.equal(written.length, 0);
  });
  it("no job with that number: nothing happens", async () => {
    state.rows.requests = [];
    assert.equal(await applyReplyMeetingLink(input()), null);
  });
  it("a reply with no link, or only a quoted one, does nothing at all", async () => {
    assert.equal(await applyReplyMeetingLink(input({ bodyText: "Thanks!\n\n> Old: https://old.zoom.us/j/1111" })), null);
    assert.equal(state.ops.length, 0);
  });
  it("two different links go to staff, not onto the job", async () => {
    const result = await applyReplyMeetingLink(input({ bodyText: `A: ${LINK}\nB: https://other.zoom.us/j/222` }));
    assert.equal(result?.outcome, "link_review");
    assert.equal(written.length, 0);
  });
  it("a job that is not virtual goes to staff", async () => {
    state.rows.requests = [jobRow({ details: { formatCode: "in_person", format: "In person" } })];
    assert.equal((await applyReplyMeetingLink(input()))?.outcome, "link_review");
    assert.equal(written.length, 0);
  });
  it("never throws: a database failure is swallowed", async () => {
    state.failAlways.add("requests");
    assert.equal(await applyReplyMeetingLink(input()), null);
  });
});

describe("booked interpreters", () => {
  const booked = () => {
    state.rows.offers = [{ id: "o1", offerId: "o1", interpreterId: "i1" }];
    state.rows.interpreters = [{ userId: "u1", email: "terp@example.invalid" }];
  };
  it("are told, flagged as updated, and never get the link copied into a log", async () => {
    booked();
    assert.equal((await applyReplyMeetingLink(input()))?.outcome, "link_applied");
    assert.ok(written[0].set.data?.detailsUpdate, "the job carries the Updated flag");
    assert.ok(activityKinds().includes("details_updated"));
    const notified = state.inserted.filter((i) => i.table === "notifications").map((i) => i.values as { title: string });
    assert.ok(notified.some((n) => n.title === "Job details updated"));
    const logged = JSON.stringify(state.inserted.filter((i) => i.table !== "requests"));
    assert.equal(logged.includes("83889756341"), false);
    assert.equal(logged.includes("PsZu1TFiFU54"), false);
    assert.ok(logged.includes("\"field\":\"Meeting link\"") && logged.includes("\"to\":\"(added)\""), "the change is named, not copied");
  });
  it("nobody is told when no one is booked, and the agency line names only the host", async () => {
    await applyReplyMeetingLink(input());
    assert.equal(activityKinds().includes("details_updated"), false);
    assert.equal(written[0].set.data?.detailsUpdate, undefined);
    const line = state.inserted.find((i) => (i.values as { kind?: string }).kind === "meeting_link_from_reply")?.values as { message: string; audience: string };
    assert.equal(line.audience, "agency");
    assert.equal(line.message, "Meeting link added from an email reply (dshs-telehealth.zoom.us).");
  });
  it("a pending offer is not told: only an accepted one counts", async () => {
    state.rows.offers = [];
    await applyReplyMeetingLink(input());
    assert.equal(state.inserted.some((i) => i.table === "notifications" && (i.values as { title: string }).title === "Job details updated"), false);
  });
});

describe("handleStateNotice (both doors)", () => {
  const mail = (over: Partial<Parameters<typeof import("@/lib/inboundMail/handle").handleStateNotice>[0]> = {}) => ({ senderEmail: "jackie.king@dshs.wa.gov", subject: SUBJECT, bodyText: REPLY, authenticated: true, messageId: null, receivedAt: new Date("2026-11-25T00:00:00Z"), ...over });
  it("a requester's reply with the link sets it and says so", async () => {
    const handled = await handleStateNotice(mail({ senderEmail: "billing@agency-contact.example" }));
    assert.equal(handled?.outcome, "link_applied");
    assert.equal(savedDetails().meetingLink, LINK);
  });
  it("a reply from the state sets it and then carries on to the form flow, as before", async () => {
    const handled = await handleStateNotice(mail());
    assert.equal(handled, null);
    assert.equal(savedDetails().meetingLink, LINK);
  });
  it("a reply with no link is still ignored", async () => {
    const handled = await handleStateNotice(mail({ senderEmail: "billing@agency-contact.example", bodyText: "Thanks!" }));
    assert.equal(handled?.outcome, "ignored_reply");
    assert.equal(written.length, 0);
  });
  it("a message that is not a reply is never read for a link", async () => {
    const handled = await handleStateNotice(mail({ subject: `Interpreter Request - 12/15/2026 - #${SRN}`, bodyText: `Link: ${LINK}\n${SRN}` }));
    assert.equal(handled, null);
    assert.equal(written.length, 0);
  });
  it("a cancellation notice is never read for a link", async () => {
    const handled = await handleStateNotice(mail({ subject: `RE: Request Cancellation - SRN #${SRN}`, bodyText: `Cancelled On 11/9/2026 11:34:58 AM\nBy king\nService Request #${SRN}\n${LINK}` }));
    assert.equal(written.length, 0);
    assert.notEqual(handled?.outcome, "link_applied");
  });
  it("both doors go through this one handler", () => {
    for (const file of ["src/app/api/intake/route.ts", "src/lib/inboxFormIngest.ts"]) assert.ok(readFileSync(file, "utf8").includes("handleStateNotice("), file);
  });
});
