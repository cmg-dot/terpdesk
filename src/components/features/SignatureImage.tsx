"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

/**
 * The signature on a service-verification record. Interpreter signatures are inline images; a state verification's
 * signature is an app link (/api/verification-signature/...) to a file in private storage, which may be a PDF. A PDF
 * cannot render in <img>, so when the image fails to load the card offers the file as a link instead.
 */
export function SignatureImage({ src, alt }: { src: string; alt: string }) {
  const [notAnImage, setNotAnImage] = useState(false);

  if (notAnImage) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-[var(--forest)] hover:bg-gray-50"
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        Open signature file
      </a>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setNotAnImage(true)}
      className="max-h-32 max-w-full w-auto rounded-lg border border-gray-200 bg-white object-contain"
    />
  );
}
