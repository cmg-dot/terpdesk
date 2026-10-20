"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { presignProfilePhoto, saveProfilePhoto } from "@/app/actions/profilePhotoUpload";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { MAX_PHOTO_BYTES, PHOTO_FILE_TYPES } from "@/lib/validation/file";

interface ProfilePhotoPickerProps {
  /** The photo currently saved on the profile ("/api/files/<id>" or an older link), or "". */
  currentPhotoUrl: string;
  name: string;
  /** Called when a new photo has been uploaded AND saved, so the page can show it. */
  onUploaded: (photoUrl: string, websiteReReview: boolean) => void;
  /** Called when the saved photo is removed (applied when the profile is saved). */
  onRemove: () => void;
}

/**
 * Profile photo picker. Choosing a file uploads it straight to S3 through a signed link and saves it as the photo
 * at once; it does not wait for "Save profile". The bucket is private, so the photo is shown through the
 * authorized /api/files route.
 */
export const ProfilePhotoPicker = ({ currentPhotoUrl, name, onUploaded, onRemove }: ProfilePhotoPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Release the temporary preview link when it is replaced or the form closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
    setError(null);
    setNotice(null);
    if (!(file.type in PHOTO_FILE_TYPES)) return setError("Choose a JPEG, PNG or WebP image.");
    if (file.size > MAX_PHOTO_BYTES) return setError("That image is larger than 5 MB. Choose a smaller one.");

    setBusy(true);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      setStatus("Preparing upload…");
      const presign = await presignProfilePhoto({ fileName: file.name, fileType: file.type, fileSize: file.size });
      if (!presign.success) return setError(presign.error);

      setStatus("Uploading…");
      const put = await fetch(presign.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!put.ok) return setError("The upload failed. Please try again.");

      setStatus("Saving…");
      const saved = await saveProfilePhoto({ key: presign.key, fileName: file.name });
      if (!saved.success) return setError(saved.error);

      onUploaded(saved.photoUrl, saved.websiteReReview);
      setNotice(
        saved.websiteReReview
          ? "Photo saved. Because it's part of your public profile, your agency will review your website profile again."
          : "Photo saved.",
      );
    } catch {
      setError("The upload failed. Check your connection and try again.");
    } finally {
      setPreviewUrl(null);
      setStatus(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <ProfileAvatar photoUrl={previewUrl ?? currentPhotoUrl} name={name} />
      <div className="min-w-0 flex-1 space-y-2">
        <input
          ref={inputRef}
          id="profile-photo-file"
          type="file"
          accept="image/jpeg, image/png, image/webp"
          onChange={onChange}
          disabled={busy}
          className="sr-only"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="profile-photo-file"
            aria-disabled={busy}
            className={`inline-flex items-center gap-2 rounded-full border border-gray-300 bg-stone-100 px-5 py-2 text-sm font-medium text-gray-800 transition-colors focus-within:ring-2 focus-within:ring-[#0B3B32] ${
              busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-stone-200"
            }`}
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {busy ? status ?? "Working…" : currentPhotoUrl ? "Choose a different photo" : "Choose photo"}
          </label>
          {!busy && currentPhotoUrl && (
            <button type="button" onClick={onRemove} className="text-sm font-medium text-red-700 hover:underline">
              Remove current photo
            </button>
          )}
        </div>
        <p className="text-[12px] text-gray-500">JPEG, PNG or WebP, up to 5 MB. Your photo is stored privately.</p>
        {notice && <p role="status" className="text-[12px] font-medium text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
      </div>
    </div>
  );
};
