"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface ProfilePhotoPickerProps {
  /** The photo currently saved on the profile (a link), or "". */
  currentPhotoUrl: string;
  name: string;
  /** Called when the saved photo is removed. */
  onRemove: () => void;
}

/**
 * File picker for the profile photo. The chosen image is previewed here, in the browser only.
 * Uploading it needs file storage (S3) that is not connected yet, so a new photo is not saved with the profile.
 */
export const ProfilePhotoPicker = ({ currentPhotoUrl, name, onRemove }: ProfilePhotoPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Release the temporary preview link when it is replaced or the form closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That image is larger than 5 MB. Choose a smaller one.");
      e.target.value = "";
      return;
    }
    setError(null);
    setFileName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const clearChoice = () => {
    setPreviewUrl(null);
    setFileName(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
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
          className="sr-only"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="profile-photo-file"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-300 bg-stone-100 px-5 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-stone-200 focus-within:ring-2 focus-within:ring-[#0B3B32]"
          >
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {previewUrl ? "Choose a different photo" : "Choose photo"}
          </label>
          {previewUrl && (
            <button type="button" onClick={clearChoice} className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Clear
            </button>
          )}
          {!previewUrl && currentPhotoUrl && (
            <button type="button" onClick={onRemove} className="text-sm font-medium text-red-700 hover:underline">
              Remove current photo
            </button>
          )}
        </div>
        <p className="text-[12px] text-gray-500">
          {fileName ? `Selected: ${fileName}. ` : ""}JPEG, PNG or WebP, up to 5 MB.
        </p>
        {previewUrl && (
          <p role="status" className="text-[12px] text-amber-800">
            Photo uploads are not switched on yet, so this photo is only a preview and will not be saved.
          </p>
        )}
        {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
      </div>
    </div>
  );
};
