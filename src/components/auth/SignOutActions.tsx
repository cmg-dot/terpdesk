"use client";

/** The two buttons of the sign-out confirmation, in the app's brand colors (used by the modal and the /signout page). */
export function SignOutActions({ onCancel, onConfirm, busy }: { onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/30 disabled:opacity-60"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="rounded-full bg-[#0B3B32] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#082a23] focus:outline-none focus:ring-2 focus:ring-[#0B3B32]/50 disabled:opacity-60"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}
