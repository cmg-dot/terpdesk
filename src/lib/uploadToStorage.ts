/**
 * The browser half of every file upload (prep notes, profile photos, credential files): PUT the file straight to S3
 * through the short-lived signed address the server issued. Client-safe.
 *
 * It exists so a refused upload says WHY. S3 answers a refusal with a small XML error whose <Code> is the real reason
 * ("AccessDenied" when the storage key may not write there, "SignatureDoesNotMatch", "EntityTooLarge", ...), and the
 * bucket's CORS rules let this site read it. A request the browser itself blocks (storage address not allowed to receive
 * uploads from this site) never gets an answer at all and is reported separately.
 */

export type StorageUploadResult = { ok: true } | { ok: false; message: string };

const SAFE_CODE = /^[A-Za-z][A-Za-z0-9]{2,40}$/;

/** The <Code> from an S3 error body, or null. Only a plain word is accepted, so nothing odd is ever shown. */
export const storageErrorCode = (body: string): string | null => {
  const code = /<Code>([^<]{1,60})<\/Code>/.exec(body)?.[1]?.trim();
  return code && SAFE_CODE.test(code) ? code : null;
};

const refusalMessage = (status: number, code: string | null): string => {
  const reason = code ?? `HTTP ${status}`;
  const hint =
    code === "RequestTimeTooSkewed"
      ? " This device's clock looks wrong; fix the date and time and try again."
      : code === "AccessDenied" || (status === 403 && code === null)
        ? " File storage did not allow this upload, so the storage access settings need a change."
        : " Please try again.";
  return `The upload failed (storage said: ${reason}).${hint} If it keeps happening, tell your agency and mention "${reason}".`;
};

export async function uploadToStorage(uploadUrl: string, file: File): Promise<StorageUploadResult> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  } catch {
    // No answer at all: no connection, or the browser blocked the request (the bucket's CORS rules don't list this site).
    console.error("[upload] the browser could not complete the request to file storage");
    return {
      ok: false,
      message:
        "The upload failed: we couldn't reach file storage. Check your connection and try again. If it keeps happening, tell your agency (the storage settings may not allow uploads from this site address).",
    };
  }
  if (response.ok) return { ok: true };
  const code = storageErrorCode(await response.text().catch(() => ""));
  console.error(`[upload] file storage refused the upload: HTTP ${response.status}${code ? ` ${code}` : ""}`);
  return { ok: false, message: refusalMessage(response.status, code) };
}
