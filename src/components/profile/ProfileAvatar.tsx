"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "IN";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** Profile photo from the interpreter's link, or their initials when there is none (or it fails to load). */
export const ProfileAvatar = ({ photoUrl, name, size = 96 }: { photoUrl: string; name: string; size?: number }) => {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [photoUrl]);

  if (photoUrl && !broken) {
    return (
      <Image
        src={photoUrl}
        alt={`Photo of ${name || "you"}`}
        width={size}
        height={size}
        // Any https host is allowed, so skip the optimizer (it only serves configured hosts).
        unoptimized
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full border border-gray-200 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-[#0B3B32] font-semibold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
    >
      {initialsOf(name)}
    </div>
  );
};
