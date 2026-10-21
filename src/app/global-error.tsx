"use client";

/**
 * Last resort for an error in the root layout itself (it replaces the whole document, so it brings its own
 * <html> and <body>). Page-level errors are handled by the error.tsx files next to each layout.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F9F8F4", margin: 0 }}>
        <div role="alert" style={{ maxWidth: 480, margin: "15vh auto", padding: 32, background: "#fff", borderRadius: 16, textAlign: "center" }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>Your data is safe. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#0B3B32", color: "#fff", border: 0, borderRadius: 999, padding: "10px 24px", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
          {error.digest && <p style={{ color: "#9ca3af", fontSize: 12 }}>Ref {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
