import { linkSegments, normalizeUrl } from "@/lib/linkify";

const LINK = "break-all text-[var(--forest)] underline underline-offset-2 hover:opacity-80";

/**
 * Free text (preparation notes, directions and parking, virtual instructions) with its web links made clickable. Only http(s)
 * links (or a bare Zoom / Teams / Meet address) become anchors, opened in a new tab without handing over the opener. Everything
 * else is drawn as text, exactly as it was written, so a value can never be turned into markup or a script.
 */
export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {linkSegments(text).map((segment, index) =>
        segment.kind === "link" ? (
          <a key={index} href={segment.href} target="_blank" rel="noopener noreferrer" className={LINK}>
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

/** One meeting link as an anchor when it is a safe web link (a bare Zoom / Teams address gets https://), else as plain text. */
export function MeetingLinkAnchor({ url, children, className }: { url: string; children?: React.ReactNode; className?: string }) {
  const href = normalizeUrl(url);
  if (href === null) return <span className={className}>{children ?? url}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? LINK}>
      {children ?? url}
    </a>
  );
}
