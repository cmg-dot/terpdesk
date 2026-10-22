"""
terpDESK ODHH email forwarder (AWS Lambda, Python 3.9+).

Receives an inbound ODHH email, works out whether it is a JOB OFFER or a SERVICE VERIFICATION (the state's receipt,
which acts as the timesheet), and POSTs it to the terpDESK intake API:

    POST {INTAKE_URL}      header  x-api-key: {INTAKE_WEBHOOK_SECRET}
    {
      "type": "job_offer" | "timesheet",
      "email": "<sender address>", "subject": "<subject>", "rawContent": "<email text>",
      "verification": { ... }        # only for "timesheet": the fields extracted below
    }

Job offers are forwarded unchanged: the Next.js API parses them (src/lib/odhhEmailParser.ts). For a service
verification this function extracts SRN, actual start/end time, total miles and other fee(s) with regex and sends
them as hints; the API re-reads rawContent itself and only uses these to fill gaps.

Environment variables: INTAKE_URL (e.g. https://your-app.vercel.app/api/intake), INTAKE_WEBHOOK_SECRET (same value
as the Next.js app; store it encrypted or in Secrets Manager), DECODE_BODY ("true" by default).

HIPAA: this function never logs the email, its subject/sender, or any extracted value, only the type, the HTTP
status and the outcome the API reports.
"""
import json
import os
import re
import urllib.error
import urllib.request
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from urllib.parse import unquote_plus

INTAKE_URL = os.environ.get("INTAKE_URL", "")
API_KEY = os.environ.get("INTAKE_WEBHOOK_SECRET", "")
DECODE_BODY = os.environ.get("DECODE_BODY", "true").lower() != "false"
HTTP_TIMEOUT_SECONDS = 20

# ---------------------------------------------------------------------------
# Type detection
# ---------------------------------------------------------------------------
VERIFICATION_MARKER = "SERVICE VERIFICATION"  # case-sensitive, as ODHH prints it


def detect_type(*texts):
    """'timesheet' if any text contains SERVICE VERIFICATION, otherwise 'job_offer'."""
    return "timesheet" if any(VERIFICATION_MARKER in (t or "") for t in texts) else "job_offer"


# ---------------------------------------------------------------------------
# SERVICE VERIFICATION extraction (mirrors src/lib/odhhVerificationParser.ts)
# ---------------------------------------------------------------------------
def _field(*labels):
    """Line-anchored 'Label: value' matcher."""
    return re.compile(r"^[ \t]*(?:%s)[ \t]*:[ \t]*(.+?)[ \t]*$" % "|".join(labels), re.IGNORECASE | re.MULTILINE)


SRN_PATTERNS = [
    re.compile(r"Service\s+Request\s*(?:#|No\.?|Number)\s*:?\s*#?\s*([A-Za-z0-9-]+)", re.IGNORECASE),
    re.compile(r"\bSRN\s*[:#]?\s*#?\s*([A-Za-z0-9-]+)", re.IGNORECASE),
]
ACTUAL_START = _field(r"Actual[ \t]+Start(?:[ \t]+Time)?", r"Actual[ \t]+Time[ \t]+In")
ACTUAL_END = _field(r"Actual[ \t]+End(?:[ \t]+Time)?", r"Actual[ \t]+Stop(?:[ \t]+Time)?", r"Actual[ \t]+Time[ \t]+Out")
TOTAL_MILES = _field(r"Total[ \t]+Mile(?:s|age)", r"To[ \t]+Mile(?:s|age)", r"Travel[ \t]+Mile(?:s|age)", r"Mile(?:s|age)")
OTHER_FEES = _field(r"Other[ \t]+Fee(?:s|\(s\))", r"Additional[ \t]+Fee(?:s|\(s\))")


def _first(pattern, text):
    match = pattern.search(text)
    return match.group(1).strip() if match else None


def extract_verification(text):
    """The five fields as the strings found in the email (None when absent). The API validates them again."""
    srn = None
    for pattern in SRN_PATTERNS:
        srn = _first(pattern, text)
        if srn:
            break
    return {
        "srn": srn,
        "actualStartTime": _first(ACTUAL_START, text),
        "actualEndTime": _first(ACTUAL_END, text),
        "totalMiles": _first(TOTAL_MILES, text),
        "otherFees": _first(OTHER_FEES, text),
    }


# ---------------------------------------------------------------------------
# Reading the email
# ---------------------------------------------------------------------------
def load_raw_email(event):
    """
    Returns the raw RFC-822 message bytes. Supports an S3 trigger (SES receipt rule -> S3 -> Lambda), which is how the
    full body reaches Lambda. ADAPT THIS FUNCTION if your trigger differs. For manual tests you may pass
    {"rawEmail": "..."} directly.
    """
    if isinstance(event.get("rawEmail"), str):
        return event["rawEmail"].encode("utf-8")
    record = (event.get("Records") or [{}])[0]
    if "s3" in record:
        import boto3  # provided by the Lambda runtime

        obj = boto3.client("s3").get_object(
            Bucket=record["s3"]["bucket"]["name"], Key=unquote_plus(record["s3"]["object"]["key"])
        )
        return obj["Body"].read()
    raise ValueError("Unsupported event: expected an S3 record or a rawEmail field")


def parse_email(raw_bytes):
    """(sender_address, subject, text). With DECODE_BODY the MIME structure is unpacked, so quoted-printable text,
    boundaries and Content-* headers never reach the API; otherwise the raw message is sent as before."""
    message = BytesParser(policy=policy.default).parsebytes(raw_bytes)
    sender = parseaddr(str(message.get("from", "")))[1]
    subject = str(message.get("subject", ""))
    text = raw_bytes.decode("utf-8", errors="replace")
    if DECODE_BODY:
        try:
            body = message.get_body(preferencelist=("plain", "html"))
            if body is not None:
                text = body.get_content()
        except Exception:  # fall back to the raw message rather than lose the email
            pass
    return sender, subject, text


# ---------------------------------------------------------------------------
# Sending to terpDESK
# ---------------------------------------------------------------------------
def post_to_intake(payload):
    request = urllib.request.Request(
        INTAKE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-api-key": API_KEY},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return response.status, _json(response.read())
    except urllib.error.HTTPError as error:
        return error.code, _json(error.read())


def _json(raw):
    try:
        parsed = json.loads(raw or b"{}")
        return parsed if isinstance(parsed, dict) else {}
    except ValueError:
        return {}


def lambda_handler(event, context):
    if not INTAKE_URL or not API_KEY:
        raise RuntimeError("INTAKE_URL and INTAKE_WEBHOOK_SECRET must be set")

    sender, subject, text = parse_email(load_raw_email(event))
    email_type = detect_type(subject, text)

    payload = {"type": email_type, "email": sender, "subject": subject, "rawContent": text}
    if email_type == "timesheet":
        payload["verification"] = extract_verification(text)

    status, body = post_to_intake(payload)

    # Counts and outcomes only: never the email or any value read from it.
    print(json.dumps({"type": email_type, "status": status, "outcome": body.get("outcome"), "missingFields": body.get("missingFields")}))

    # 5xx and auth/config failures: raise so Lambda retries / dead-letters. Other 4xx (e.g. 422: the email cannot be
    # read) would fail identically on retry, so they are logged above and not retried.
    if status >= 500 or status in (401, 403):
        raise RuntimeError("terpDESK intake rejected the request (HTTP %d)" % status)
    return {"statusCode": status, "type": email_type, "outcome": body.get("outcome")}
