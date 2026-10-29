import DOMPurify from "dompurify";
import type { Config } from "dompurify";

/**
 * Makes the HTML of a received email safe to put in the page. BROWSER ONLY: DOMPurify needs a DOM, and when there is none
 * (server rendering) this returns null so the caller shows the plain-text version instead. It never returns unsanitized HTML.
 *
 * Beyond DOMPurify's default removal of scripts, event handlers and javascript: links, it also drops what would let an
 * email change or spy on the dashboard around it: <style> and style attributes (they could restyle or overlay the app),
 * form controls (phishing forms), embeds, and images loaded from the internet (tracking pixels that tell the sender the
 * email was opened).
 */

const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "option", "iframe", "frame", "object", "embed", "link", "meta", "base"],
  FORBID_ATTR: ["style", "srcset", "action", "formaction"],
  ALLOW_DATA_ATTR: false,
  SANITIZE_NAMED_PROPS: true,
};

let hooksReady = false;

function installHooks(): void {
  if (hooksReady) return;
  hooksReady = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === "A") {
      // Links leave the dashboard in a new tab and never hand over the dashboard window or its address.
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
    if (node.tagName === "IMG" && !/^data:image\//i.test(node.getAttribute("src") ?? "")) node.remove();
  });
}

/** Sanitized HTML, or null when this environment cannot sanitize. */
export function sanitizeEmailHtml(html: string): string | null {
  if (typeof window === "undefined" || !DOMPurify.isSupported) return null;
  installHooks();
  return DOMPurify.sanitize(html, CONFIG);
}
