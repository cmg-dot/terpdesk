import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { ASL_MARK_BOX, ASL_MARK_PNG_BASE64 } from "@/lib/verificationPdf/logoAsset";
import { cleanLine, fitBlock, fitOneLine, wrapText } from "@/lib/verificationPdf/text";
import type { VerificationPdfData } from "@/lib/verificationPdf/types";

/**
 * Draws Kari Owen's "Independent Contractor Invoice" on one US Letter page. Every position below was measured from her Word
 * form (Times New Roman throughout; x and `top` are points from the page's top-left, `top` being the line's top as Word reports
 * it), so the printed page lines up with the original. Typed values go where the blanks are; the underscored blanks are
 * drawn as rules in the same place. A long Notes text continues on a second page.
 *
 * Pure apart from building the PDF: no database, no storage.
 */

const PAGE = { width: 612, height: 792 } as const;
const BLACK = rgb(0, 0, 0);
const LINK_BLUE = rgb(0, 0, 0.8);
const GREY = rgb(0.4, 0.4, 0.4);
/** Times' baseline sits about this far down a line, as a share of its font size. */
const BASELINE = 0.9;
const VALUE_X = 144;
/**
 * Word reports the x of a paragraph with a -27 pt hanging indent without the indent. Those paragraphs (the header, Location, the Time and
 * Mileage rows, Authorized by, the first footer line) really start 27 pt further left, which the printed original confirms.
 */
const HANG = -27;
/** Where the 36 pt "ASL Professionals" line sits: on the bottom edge of the logo, as in the original (a baseline, not a line top). */
const ASL_BASELINE_TOP = 83.3 - BASELINE * 36;
const RIGHT_EDGE = 600;
const NOTES = { x: 54, top: 603.6, size: 9, minSize: 8, lineHeight: 9.8, width: 504, maxLines: 2 } as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;

interface Ctx {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
}

const baselineY = (top: number, size: number): number => PAGE.height - (top + BASELINE * size);

function put(ctx: Ctx, text: string, x: number, top: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
  const font = opts.bold ? ctx.bold : ctx.regular;
  const clean = cleanLine(font, text);
  if (clean) ctx.page.drawText(clean, { x, y: baselineY(top, size), size, font, color: opts.color ?? BLACK });
}

/** A rule where the form has an underscored blank: it sits just under the baseline, like an underscore does. */
function rule(ctx: Ctx, x1: number, x2: number, top: number, size: number, thickness = 0.5, color = BLACK): void {
  const y = baselineY(top, size) - size * 0.1;
  ctx.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

function value(ctx: Ctx, text: string, x: number, top: number, size: number, maxWidth: number): void {
  if (!text.trim()) return;
  const fitted = fitOneLine(ctx.regular, text, size, maxWidth, 7);
  put(ctx, fitted.text, x, top, fitted.size);
}

function lines(ctx: Ctx, text: string, x: number, top: number, size: number, maxWidth: number, maxLines: number, lineHeight: number): void {
  if (!text.trim()) return;
  const block = fitBlock(ctx.regular, text, size, 8, maxWidth, maxLines);
  block.lines.forEach((line, i) => put(ctx, line, x, top + i * lineHeight, block.size));
}

async function embedPng(doc: PDFDocument, bytes: Uint8Array | null, what: string): Promise<PDFImage | null> {
  if (!bytes) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) throw new Error(`The ${what} is not a PNG image.`);
  return doc.embedPng(bytes);
}

function signature(ctx: Ctx, image: PDFImage | null, box: { x: number; top: number; width: number; height: number }): void {
  if (!image) return;
  const scale = Math.min(box.width / image.width, box.height / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  ctx.page.drawImage(image, { x: box.x + (box.width - width) / 2, y: PAGE.height - box.top - box.height + (box.height - height) / 2, width, height });
}

function drawHeader(ctx: Ctx, mark: PDFImage): void {
  ctx.page.drawImage(mark, { x: ASL_MARK_BOX.x, y: PAGE.height - ASL_MARK_BOX.top - ASL_MARK_BOX.height, width: ASL_MARK_BOX.width, height: ASL_MARK_BOX.height });
  put(ctx, "ASL Professionals", 189 + HANG, ASL_BASELINE_TOP, 36, { bold: true });
  put(ctx, "American Sign Language Interpreting Service", 190.8 + HANG, 89.4, 14, { bold: true });
  put(ctx, "Kari Owen", 101.4 + HANG, 135.6, 11, { bold: true });
  put(ctx, "Owner", 111 + HANG, 148.2, 9);
  put(ctx, "(253) 759-7653 Voice", 480 + HANG, 135.6, 10);
  put(ctx, "(509) 895-7136 Fax", 482.4 + HANG, 148.2, 9);
  const email = "aslprofessionals@comcast.net";
  put(ctx, email, 481.8 + HANG, 158.4, 9, { color: LINK_BLUE });
  rule(ctx, 481.8 + HANG, 481.8 + HANG + ctx.regular.widthOfTextAtSize(email, 9), 158.4, 9, 0.5, LINK_BLUE);
  put(ctx, "Independent Contractor Invoice", 202.8 + HANG, 199.8, 16, { bold: true });
}

function drawDetails(ctx: Ctx, d: VerificationPdfData): void {
  put(ctx, "Date of Service:", 54, 255, 12);
  value(ctx, d.dateOfService, VALUE_X, 255, 12, 156);
  put(ctx, "Contact:", 306, 255, 12);
  lines(ctx, d.contact, 352, 255, 12, 56, 2, 13.8);
  put(ctx, "Phone:", 414, 255, 12);
  value(ctx, d.phone, 455, 255, 12, RIGHT_EDGE - 455);

  put(ctx, "Interpreter:", 54, 282.6, 12);
  value(ctx, d.interpreter, VALUE_X, 282.6, 12, 156);
  put(ctx, "Team:", 306, 282.6, 12);
  lines(ctx, d.team, 346, 282.6, 12, RIGHT_EDGE - 346, 2, 13.8);

  put(ctx, "Client:", 54, 310.2, 12);
  lines(ctx, d.client, VALUE_X, 310.2, 12, RIGHT_EDGE - VALUE_X, 2, 13.8);
  put(ctx, "Location:", 81.6 + HANG, 336.6, 12);
  lines(ctx, d.location, VALUE_X, 336.6, 12, RIGHT_EDGE - VALUE_X, 4, 13.8);
  put(ctx, "Situation:", 54, 405.6, 12);
  lines(ctx, d.situation, VALUE_X, 405.6, 12, RIGHT_EDGE - VALUE_X, 3, 13.8);
}

function drawTimes(ctx: Ctx, d: VerificationPdfData): number {
  const centred = (text: string, centre: number) => {
    const fitted = fitOneLine(ctx.regular, text, 11, 80, 8);
    put(ctx, fitted.text, centre - ctx.regular.widthOfTextAtSize(fitted.text, fitted.size) / 2, 458.4, fitted.size);
  };
  put(ctx, "Time Scheduled:", 81.6 + HANG, 458.4, 12);
  centred(d.scheduledBegin, 230.8 + HANG);
  centred(d.scheduledEnd, 330.5 + HANG);
  put(ctx, "Begin", 219 + HANG, 472.2, 11);
  put(ctx, "End", 322.2 + HANG, 472.2, 11);

  put(ctx, "Time Billed:", 81.6 + HANG, 510.6, 11);
  rule(ctx, 211.8 + HANG, 272.4 + HANG, 510.6, 11);
  value(ctx, d.billedHours, 214 + HANG, 510.6, 11, 56);
  put(ctx, "Total hours", 222 + HANG, 523.2, 10);
  put(ctx, "(Bill in ½ hour increments beyond scheduled time)", 272.4 + HANG, 523.2, 9);

  put(ctx, "Mileage:", 83.4 + HANG, 555, 11);
  rule(ctx, 210.6 + HANG, 276.6 + HANG, 555, 11);
  value(ctx, d.mileage, 213 + HANG, 555, 11, 60);
  put(ctx, "(If over 30 miles)", 210.6 + HANG, 567.6, 10);

  put(ctx, "Notes:", 56.4, 591, 11);
  put(ctx, "(If assignment goes over scheduled time, please explain)", 90.6, 591, 9);
  if (!d.notes.trim()) return 0;
  const block = fitBlock(ctx.regular, d.notes, NOTES.size, NOTES.minSize, NOTES.width, NOTES.maxLines);
  block.lines.forEach((line, i) => put(ctx, line, NOTES.x, NOTES.top + i * NOTES.lineHeight, block.size));
  return block.overflow ? 1 : 0;
}

function drawSignatures(ctx: Ctx, d: VerificationPdfData, images: { interpreter: PDFImage | null; authorized: PDFImage | null }, overflow: boolean): void {
  put(ctx, "Signature of Interpreter", 57, 634.8, 11);
  rule(ctx, 172.2, 403.2, 634.8, 11);
  signature(ctx, images.interpreter, { x: 176, top: 624, width: 224, height: 32 });
  put(ctx, "Date", 408.6, 634.8, 11);
  rule(ctx, 432, 514.5, 634.8, 11);
  value(ctx, d.interpreterSignedDate, 436, 634.8, 11, 76);

  put(ctx, "Authorized by", 84 + HANG, 685.2, 11);
  rule(ctx, 153.6 + HANG, 434.4 + HANG, 685.2, 11);
  signature(ctx, images.authorized, { x: 158 + HANG, top: 665.5, width: 272, height: 32 });
  put(ctx, "Date", 439.8 + HANG, 685.2, 11);
  rule(ctx, 463.2 + HANG, 545.7 + HANG, 685.2, 11);
  value(ctx, d.authorizedDate, 467 + HANG, 685.2, 11, 76);
  if (d.authorizedName.trim()) {
    const fitted = fitOneLine(ctx.regular, `Printed name: ${d.authorizedName}`, 8, 280, 7);
    put(ctx, fitted.text, 153.6 + HANG, 700.5, fitted.size);
  }
  if (overflow) put(ctx, "(Notes continue on page 2)", 54, 624.5, 8, { color: GREY });
}

function drawFooter(ctx: Ctx, electronic: boolean): void {
  put(ctx, "Send completed invoice to: ASL Professionals, P O Box 265  Henderson, TN  38340", 95.4 + HANG, 711.6, 9);
  put(ctx, "To receive payment invoice must be received within 30 days from above date.", 67.8, 721.8, 9);
  if (electronic) put(ctx, "Signatures were captured electronically in terpDESK.", 67.8, 748, 7, { color: GREY });
}

function drawContinuation(doc: PDFDocument, fonts: Pick<Ctx, "regular" | "bold">, notes: string): void {
  const size = 11;
  const all = wrapText(fonts.regular, notes, size, NOTES.width);
  const perPage = 48;
  for (let start = 0; start < all.length; start += perPage) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const ctx: Ctx = { page, ...fonts };
    put(ctx, "Independent Contractor Invoice", 54, 36, 16, { bold: true });
    put(ctx, start === 0 ? "Notes (continued from page 1)" : "Notes (continued)", 54, 62, 12, { bold: true });
    all.slice(start, start + perPage).forEach((line, i) => put(ctx, line, 54, 86 + i * 13.8, size));
  }
}

/** The finished PDF. Throws when a signature image is not a PNG; everything else that is missing is simply left blank. */
export async function renderVerificationPdf(data: VerificationPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Independent Contractor Invoice");
  doc.setAuthor("ASL Professionals");
  doc.setCreator("terpDESK");
  doc.setProducer("terpDESK");
  doc.setCreationDate(new Date());
  const regular = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const mark = await doc.embedPng(Buffer.from(ASL_MARK_PNG_BASE64, "base64"));
  const images = {
    interpreter: await embedPng(doc, data.interpreterSignature, "interpreter's signature"),
    authorized: await embedPng(doc, data.authorizedSignature, "on-site contact's signature"),
  };

  const ctx: Ctx = { page: doc.addPage([PAGE.width, PAGE.height]), regular, bold };
  drawHeader(ctx, mark);
  drawDetails(ctx, data);
  const overflow = drawTimes(ctx, data) === 1;
  drawSignatures(ctx, data, images, overflow);
  drawFooter(ctx, Boolean(images.interpreter || images.authorized));
  if (overflow) drawContinuation(doc, { regular, bold }, data.notes);
  return doc.save();
}
