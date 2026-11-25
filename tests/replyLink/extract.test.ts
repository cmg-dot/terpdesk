import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ownWords, readReplyMeeting } from "@/lib/replyMeetingLink";
import type { ReplyMeeting } from "@/lib/replyMeetingLink";

const ZOOM = "https://dshs-telehealth.zoom.us/j/83889756341?pwd=PsZu1TFiFU54Tfi93B6Rl7HhhdYGZ6.1";
const OLD = "https://old-meeting.zoom.us/j/11111111111?pwd=OLDOLDOLD";

const QUOTED = ["1. INTERPRETER AGENCY", "Service Request #202787804", "3. APPOINTMENT INFORMATION", "Appointment Date: 12/15/2026", "Virtual Meeting/Platform: Link in request email"].join("\n");

const found = (body: string): ReplyMeeting => {
  const read = readReplyMeeting(body);
  assert.equal(read.kind, "found");
  return (read as { kind: "found"; meeting: ReplyMeeting }).meeting;
};

describe("the link in a reply", () => {
  it("reads the reply from #202787804 (Original Message divider, signature)", () => {
    const body = `Here is the link: ${ZOOM}\n\nJackie King\nVocational Rehabilitation Counselor\nDVR\n\n---------- Original Message ----------\nFrom: SignLanguageInterpreters@dshs.wa.gov\nSubject: Interpreter Request - 12/15/2026 - #202787804\n\n${QUOTED}`;
    const meeting = found(body);
    assert.equal(meeting.link, ZOOM);
    assert.equal(meeting.host, "dshs-telehealth.zoom.us");
    assert.equal(meeting.platform, "Zoom");
  });
  it("never reads a link that is only in the quoted history", () => {
    for (const quote of [`---------- Original Message ----------\nJoin: ${OLD}`, `On Mon, Nov 23, 2026 at 9:00 AM Jackie King <jk@dshs.wa.gov> wrote:\n> Join: ${OLD}`, `> Join: ${OLD}`, `From: Jackie King\nSent: Monday, November 23, 2026 9:00 AM\nTo: Agency\nSubject: Interpreter Request\n\nJoin: ${OLD}`, `________________________________\nJoin: ${OLD}`]) {
      assert.equal(readReplyMeeting(`Thanks, will send the link soon.\n\n${quote}`).kind, "none", quote.slice(0, 30));
    }
  });
  it("takes the new link, not the old one quoted below it", () => {
    assert.equal(found(`New link: ${ZOOM}\n\n> Old link: ${OLD}`).link, ZOOM);
  });
  it("ignores a link in the signature", () => {
    assert.equal(readReplyMeeting(`Will send it.\n\n-- \nJackie King\nJoin my room: ${ZOOM}`).kind, "none");
    assert.equal(readReplyMeeting(`Will send it.\n\nSent from my iPhone\n${ZOOM}`).kind, "none");
  });
  it("reads an HTML reply, taking the address from the anchor, and leaves a quote block alone", () => {
    const html = `<div>Here is the link: <a href="${ZOOM.replace("&", "&amp;")}">click here</a></div><div class="gmail_quote"><blockquote>Old: <a href="${OLD}">${OLD}</a></blockquote></div>`;
    assert.equal(found(html).link, ZOOM);
  });
  it("unwraps an Outlook Safe Links address", () => {
    const wrapped = `https://nam10.safelinks.protection.outlook.com/?url=${encodeURIComponent(ZOOM)}&data=05%7C01&sdata=abc`;
    assert.equal(found(`<p>Here: <a href="${wrapped}">${ZOOM}</a></p>`).link, ZOOM);
  });
  it("reads Teams and Meet links, with the platform", () => {
    assert.equal(found("Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=x").platform, "Microsoft Teams");
    assert.equal(found("Join: https://meet.google.com/abc-defg-hij").platform, "Google Meet");
  });
  it("drops punctuation that follows the link", () => {
    assert.equal(found(`Join (${ZOOM}).`).link, ZOOM);
    assert.equal(found(`Join at ${ZOOM},`).link, ZOOM);
  });
  it("reads the meeting ID and passcode written beside it", () => {
    const meeting = found(`Link: https://us02web.zoom.us/j/83889756341\nMeeting ID: 838 8975 6341\nPasscode: Abc123`);
    assert.equal(meeting.meetingId, "838 8975 6341");
    assert.equal(meeting.passcode, "Abc123");
  });
  it("counts the same link twice (link and anchor text) as one", () => {
    assert.equal(found(`<a href="${ZOOM}">${ZOOM}</a>`).link, ZOOM);
  });
  it("never guesses between two different meeting links", () => {
    assert.equal(readReplyMeeting(`Option A: ${ZOOM}\nOption B: ${OLD}`).kind, "ambiguous");
  });
});

describe("what is not a meeting link", () => {
  it("a link to another site, even one that mentions a meeting host", () => {
    assert.equal(readReplyMeeting("See https://evil.example.com/redirect?to=zoom.us/j/1").kind, "none");
    assert.equal(readReplyMeeting("Join https://zoom.us.evil.example.com/j/1").kind, "none");
    assert.equal(readReplyMeeting("Join https://notzoom.us/j/1").kind, "none");
  });
  it("a plain http link", () => assert.equal(readReplyMeeting("Join http://us02web.zoom.us/j/83889756341").kind, "none"));
  it("a reply with no link", () => assert.equal(readReplyMeeting("Thanks, see you then.").kind, "none"));
  it("an empty body", () => assert.equal(readReplyMeeting("").kind, "none"));
  it("an absurdly long link", () => assert.equal(readReplyMeeting(`https://us02web.zoom.us/j/1?x=${"a".repeat(2000)}`).kind, "none"));
});

describe("ownWords", () => {
  it("is only the sender's text above the quote and the signature", () => {
    assert.equal(ownWords(`Hello\n\n-- \nSig\n\n> quoted`), "Hello");
  });
});
