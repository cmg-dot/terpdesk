"use client";

import { useState } from "react";

interface RecoveryCodesPanelProps {
  codes: string[];
  onDone: () => void;
}

const FILE_HEADER = [
  "terpDESK recovery codes",
  "Each code works once, if you lose access to your authenticator app.",
  "Keep this file somewhere safe and private.",
  "",
];

/**
 * The recovery codes, shown once. The server keeps only their hashes, so this is the only time they can be seen: the person must
 * copy or download them and tick that they did before the dialog can be closed.
 */
export const RecoveryCodesPanel = ({ codes, onDone }: RecoveryCodesPanelProps) => {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the codes are still on screen to copy by hand
    }
  };

  const download = () => {
    const blob = new Blob([[...FILE_HEADER, ...codes].join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "terpdesk-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div data-recovery-panel>
      <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        Save these recovery codes now. They are shown <strong>only once</strong>. If you lose your phone, each code lets you sign in one time.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-[#F4F3EF] p-4 font-mono text-sm tracking-wider text-gray-800 sm:grid-cols-2" aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code} data-recovery-code>
            {code}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          {copied ? "Copied" : "Copy codes"}
        </button>
        <button type="button" onClick={download} className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Download .txt
        </button>
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--forest)]" />
        I have saved these codes somewhere safe.
      </label>
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          disabled={!saved}
          className="rounded-full bg-[var(--forest)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--forest-hover)] disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
};
