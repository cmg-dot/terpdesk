/**
 * The interpreter's signature in an ODHH service-verification email: an <img src="data:image/jpg;base64,..."> in the HTML
 * part, right after the words "Interpreter Signature" (the plain-text part has no image). This is the server-side twin of
 * the Lambda's `signatureFromHtml`, used to replay emails that were stored before the Lambda forwarded the image. Pure.
 *
 * Only images that carry their own bytes (data: URLs) are read; nothing is ever fetched from a web address in an email.
 * With the "Interpreter Signature" heading only an image AFTER it counts (an unsigned report must not turn a logo into a
 * signature); without the heading, a lone image is taken. The caller still validates the bytes (pickSignature).
 */

const MAX_BASE64_CHARS = 3_500_000;
const DATA_IMAGE = /<img\b[^>]*?\bsrc\s*=\s*["']\s*data:image\/(jpe?g|png|gif|webp);base64,([A-Za-z0-9+/=\s]+?)\s*["']/gi;
const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/** The shape the Lambda sends in `attachments`, so `pickSignature` reads it unchanged. */
export interface EmbeddedImage {
  filename: string;
  contentType: string;
  size: number;
  inline: false;
  contentBase64: string;
}

export function signatureFromHtml(html: string | null | undefined): EmbeddedImage | null {
  if (typeof html !== "string" || html === "") return null;
  const marker = html.search(/Interpreter\s+Signature/i);
  const images = Array.from(html.matchAll(DATA_IMAGE)).map((m) => ({
    at: m.index ?? 0,
    ext: m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase(),
    data: m[2].replace(/\s+/g, ""),
  }));
  const chosen = marker >= 0 ? images.find((image) => image.at > marker) : images.length === 1 ? images[0] : undefined;
  if (!chosen || !/^[A-Za-z0-9+/]+={0,2}$/.test(chosen.data) || chosen.data.length > MAX_BASE64_CHARS) return null;
  const padding = chosen.data.endsWith("==") ? 2 : chosen.data.endsWith("=") ? 1 : 0;
  return {
    filename: `signature.${chosen.ext}`,
    contentType: TYPE_BY_EXT[chosen.ext],
    size: Math.floor((chosen.data.length * 3) / 4) - padding,
    inline: false,
    contentBase64: chosen.data,
  };
}
