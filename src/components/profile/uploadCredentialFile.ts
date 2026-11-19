import type { CredentialFileActions } from "@/components/profile/CredentialFileUpload";
import { CREDENTIAL_FILE_TYPES, MAX_CREDENTIAL_FILE_BYTES } from "@/lib/validation/file";
import type { CredentialFile } from "@/lib/validation/file";
import { uploadToStorage } from "@/lib/uploadToStorage";

/** A message when the file cannot be a credential file (type or size), else null. Checked on choosing a file and again before upload. */
export function checkCredentialFile(file: File): string | null {
  if (!(file.type in CREDENTIAL_FILE_TYPES)) return "Choose a PDF, JPEG or PNG file.";
  if (file.size > MAX_CREDENTIAL_FILE_BYTES) return "That file is larger than 10 MB. Choose a smaller one.";
  return null;
}

export type CredentialUploadOutcome = { ok: true; file: CredentialFile } | { ok: false; error: string };

/**
 * The three steps of attaching a file to a credential, in order: a signed link, the direct upload to storage, then saving the
 * file against the credential. Shared by the "Add a supporting file" box and the insurance Add form. `onStatus` reports each step.
 */
export async function uploadCredentialFile(
  actions: Pick<CredentialFileActions, "presign" | "save">,
  credentialId: string,
  file: File,
  onStatus?: (status: string) => void,
): Promise<CredentialUploadOutcome> {
  const problem = checkCredentialFile(file);
  if (problem) return { ok: false, error: problem };
  try {
    onStatus?.("Preparing upload…");
    const presign = await actions.presign({ credentialId, fileName: file.name, fileType: file.type, fileSize: file.size });
    if (!presign.success) return { ok: false, error: presign.error };

    onStatus?.("Uploading…");
    const put = await uploadToStorage(presign.uploadUrl, file);
    if (!put.ok) return { ok: false, error: put.message };

    onStatus?.("Saving…");
    const saved = await actions.save({ credentialId, key: presign.key, fileName: file.name });
    if (!saved.success) return { ok: false, error: saved.error };
    return { ok: true, file: saved.file };
  } catch {
    return { ok: false, error: "The upload failed. Check your connection and try again." };
  }
}
