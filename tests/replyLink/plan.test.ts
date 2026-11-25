import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ReplyMeeting } from "@/lib/replyMeetingLink";
import type { LinkPlan } from "@/lib/replyMeetingLinkPlan";
import { currentMeetingLink, isJobContact, jobContactEmails, planReplyLink, redactMeetingChanges } from "@/lib/replyMeetingLinkPlan";

const LINK = "https://dshs-telehealth.zoom.us/j/83889756341?pwd=abc";
const meeting: ReplyMeeting = { link: LINK, host: "dshs-telehealth.zoom.us", platform: "Zoom", meetingId: null, passcode: null };
const job = (details: Record<string, unknown>, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ details: { formatCode: "virtual", ...details }, ...extra });

/** The details of a plan that applies (the test fails when it does not). */
const applied = (plan: LinkPlan): Record<string, unknown> => {
  assert.equal(plan.kind, "apply");
  return plan.kind === "apply" ? ((plan.data.details ?? {}) as Record<string, unknown>) : {};
};

describe("planReplyLink", () => {
  it("fills the blank link, writing both fields the readers use", () => {
    const plan = planReplyLink(job({ platform: "Link in request email" }), meeting);
    assert.equal(plan.kind, "apply");
    const details = applied(plan);
    assert.equal(details.meetingLink, LINK);
    assert.equal(details.virtualLink, LINK);
  });
  it("replaces the form's placeholder platform, and a generic one, with the real name", () => {
    for (const placeholder of ["Link in request email", "link in the request email", "Virtual", ""]) {
      const plan = planReplyLink(job({ platform: placeholder }), meeting);
      assert.equal(applied(plan).platform, "Zoom", placeholder);
    }
  });
  it("keeps a platform someone chose", () => {
    const plan = planReplyLink(job({ platform: "Microsoft Teams" }), meeting);
    assert.equal(applied(plan).platform, "Microsoft Teams");
  });
  it("fills the meeting ID and passcode only when blank", () => {
    const withIds = { ...meeting, meetingId: "838 8975 6341", passcode: "Abc123" };
    const blank = applied(planReplyLink(job({}), withIds));
    assert.equal(blank.meetingId, "838 8975 6341");
    assert.equal(blank.passcode, "Abc123");
    const set = applied(planReplyLink(job({ meetingId: "111", passcode: "keep" }), withIds));
    assert.equal(set.meetingId, "111");
    assert.equal(set.passcode, "keep");
  });
  it("never replaces a link already on the job, wherever it is kept", () => {
    assert.equal(planReplyLink(job({ meetingLink: "https://x.zoom.us/j/9" }), meeting).kind, "different");
    assert.equal(planReplyLink(job({ virtualLink: "https://x.zoom.us/j/9" }), meeting).kind, "different");
    assert.equal(planReplyLink(job({}, { meetingLink: "https://x.zoom.us/j/9" }), meeting).kind, "different");
    assert.equal(currentMeetingLink(job({ virtualLink: "https://x.zoom.us/j/9" })), "https://x.zoom.us/j/9");
  });
  it("treats the same link again as a repeat", () => {
    assert.equal(planReplyLink(job({ meetingLink: LINK }), meeting).kind, "same");
    assert.equal(planReplyLink(job({ meetingLink: `${LINK.toUpperCase()}/` }), { ...meeting, link: LINK.toUpperCase() }).kind, "same");
  });
  it("leaves a job that is not virtual to staff", () => {
    assert.equal(planReplyLink({ details: { formatCode: "in_person", format: "In person" } }, meeting).kind, "not_virtual");
    assert.equal(planReplyLink({}, meeting).kind, "not_virtual");
    assert.equal(planReplyLink({ details: { format: "Hybrid — in person and virtual" } }, meeting).kind, "apply");
  });
  it("does not change the data it was given", () => {
    const data = job({ platform: "Link in request email" });
    const copy = JSON.stringify(data);
    planReplyLink(data, meeting);
    assert.equal(JSON.stringify(data), copy);
  });
});

describe("who the job names", () => {
  const data = { requester: { email: "DVR.aslaccess@dshs.wa.gov", billEmail: "dvr.languageaccess@dshs.wa.gov; Other@Example.org" } };
  it("lists the requester and each billing address", () => {
    assert.deepEqual(jobContactEmails(data), ["dvr.aslaccess@dshs.wa.gov", "dvr.languageaccess@dshs.wa.gov", "other@example.org"]);
  });
  it("matches a sender without caring about case", () => {
    assert.equal(isJobContact(data, " OTHER@example.ORG "), true);
    assert.equal(isJobContact(data, "stranger@example.org"), false);
    assert.equal(isJobContact({}, "other@example.org"), false);
  });
});

describe("redactMeetingChanges", () => {
  it("names the link, ID and passcode but never copies them", () => {
    const out = redactMeetingChanges([
      { field: "Meeting link", from: "(none)", to: LINK },
      { field: "Meeting ID", from: "(none)", to: "838 8975 6341" },
      { field: "Passcode", from: "old", to: "Abc123" },
      { field: "Meeting platform", from: "Virtual", to: "Zoom" },
    ]);
    assert.deepEqual(out.map((c) => c.to), ["(added)", "(added)", "(added)", "Zoom"]);
    assert.equal(out[2].from, "(set)");
    assert.equal(JSON.stringify(out).includes("zoom.us"), false);
  });
});
