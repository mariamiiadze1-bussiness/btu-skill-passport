import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import QRCode from "qrcode";

import { stampType, type StampType } from "../stamps";
import * as assets from "./assets.generated";

/**
 * Builds the official passport PDF on BTU's 4-page template.
 *
 * Output is byte-for-byte deterministic for the same input (fixed metadata dates, no
 * locale-dependent formatting), so an issued version can be re-generated later and must
 * still hash to the value anchored on the blockchain.
 */

export type PassportPdfInput = {
  firstName: string;
  lastName: string;
  passportId: string;
  /** Date this version was issued (YYYY-MM-DD). */
  issuedOn: string;
  verificationCode: string;
  /** Printed as a QR code; opens the public verify page with the code filled in. */
  verifyUrl: string;
  skills: {
    name: string;
    category: string;
    description: string;
    dateEarned: string;
    earnedThrough?: string;
  }[];
};

const CARDS_PER_PAGE = 10;
const ROWS_PER_PAGE = 5;
const TEMPLATE = { cover: 0, about: 1, cards: 2, table: 3 } as const;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const fromBase64 = (b64: string) => Uint8Array.from(Buffer.from(b64, "base64"));

/** "2026-09-15" → "15 SEP 2026", independent of the runtime's locale data. */
export function coverDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? ""} ${y}`;
}

const shortDate = (iso: string) => iso.split("-").reverse().join(".");

/** Standard PDF fonts only cover Latin-1, so names are checked before anything is issued. */
export function isPrintable(text: string) {
  return /^[\x20-\x7E -ÿ–—‘’“”…]*$/.test(text);
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1] ?? "";
  while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth)
    last = last.slice(0, -1).trimEnd();
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

/**
 * Draws a name so it always fits its box: shrinks from the preferred size down to `min`,
 * then wraps onto two lines (and as a last resort ellipsizes). Short names keep full size.
 */
export function fitText(
  text: string,
  font: PDFFont,
  preferred: number,
  min: number,
  maxWidth: number,
) {
  for (let size = preferred; size >= min; size -= 0.5) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return { size, lines: [text] };
  }
  return { size: min, lines: wrap(text, font, min, maxWidth, 2) };
}

function drawFitted(
  page: PDFPage,
  text: string,
  x: number,
  top: number,
  font: PDFFont,
  preferred: number,
  min: number,
  maxWidth: number,
  color: RGB,
) {
  const { size, lines } = fitText(text, font, preferred, min, maxWidth);
  lines.forEach((line, i) =>
    page.drawText(line, { x, y: top - i * (size + 1.5), size, font, color }),
  );
}

function centered(
  page: PDFPage,
  text: string,
  cx: number,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB,
  maxWidth: number,
  maxLines = 2,
) {
  wrap(text, font, size, maxWidth, maxLines).forEach((line, i) =>
    page.drawText(line, {
      x: cx - font.widthOfTextAtSize(line, size) / 2,
      y: y - i * (size + 2),
      font,
      size,
      color,
    }),
  );
}

function linesCentered(
  page: PDFPage,
  lines: string[],
  x: number,
  cy: number,
  font: PDFFont,
  size: number,
  color: RGB,
  lineHeight: number,
) {
  const first = cy + ((lines.length - 1) * lineHeight) / 2 - size * 0.35;
  lines.forEach((line, i) =>
    page.drawText(line, { x, y: first - i * lineHeight, size, font, color }),
  );
}

const STAMP_SIZE: Record<StampType, { card: [number, number]; row: [number, number] }> = {
  AI_SKILL: { card: [42, 40], row: [40, 38] },
  AI_APPLIED: { card: [59, 28], row: [55, 27] },
  AI_ADVANCED: { card: [40, 40], row: [39, 39] },
};

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length ? out : [[]];
}

export async function generatePassportPdf(input: PassportPdfInput): Promise<Uint8Array> {
  const templateBytes = fromBase64(assets.template);
  const pdf = await PDFDocument.load(templateBytes, { updateMetadata: false });
  const source = await PDFDocument.load(templateBytes, { updateMetadata: false });
  if (pdf.getPageCount() !== 4) throw new Error("The passport template must have four pages.");

  const cardPages = chunk(input.skills, CARDS_PER_PAGE);
  const tablePages = chunk(input.skills, ROWS_PER_PAGE);

  // Extra skills continue on copies of the template's skill pages.
  const extraCards = await pdf.copyPages(source, Array(cardPages.length - 1).fill(TEMPLATE.cards));
  extraCards.forEach((page, i) => pdf.insertPage(TEMPLATE.cards + 1 + i, page));
  const extraRows = await pdf.copyPages(source, Array(tablePages.length - 1).fill(TEMPLATE.table));
  extraRows.forEach((page) => pdf.addPage(page));

  const pages = pdf.getPages();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.09);
  const muted = rgb(0.36, 0.36, 0.39);
  const white = rgb(1, 1, 1);

  const stamps = new Map<StampType, PDFImage>();
  for (const type of new Set(input.skills.map((s) => stampType(s.category)))) {
    stamps.set(type, await pdf.embedPng(fromBase64(assets[type])));
  }
  const qrPng = await QRCode.toBuffer(input.verifyUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
  });
  const qr = await pdf.embedPng(new Uint8Array(qrPng));

  const footer = (page: PDFPage, x: number) =>
    page.drawText(input.passportId, { x, y: 82, size: 7.5, font: regular, color: muted });

  // Cover: name, issue date, verification code and QR.
  const cover = pages[TEMPLATE.cover]!;
  // Names sit between the left margin and the sticker cluster; long ones shrink, then wrap.
  drawFitted(cover, input.firstName.toUpperCase(), 108, 306, bold, 14, 8, 270, ink);
  drawFitted(cover, input.lastName.toUpperCase(), 108, 251, bold, 16, 8, 270, ink);
  cover.drawText(coverDate(input.issuedOn), { x: 593, y: 300, size: 14, font: bold, color: ink });
  cover.drawText("VERIFICATION CODE", { x: 108, y: 202, size: 8, font: bold, color: muted });
  cover.drawText(input.verificationCode, { x: 108, y: 185, size: 8, font: bold, color: ink });
  cover.drawImage(qr, { x: 232, y: 172, width: 62, height: 62 });
  footer(cover, 684);
  footer(pages[TEMPLATE.about]!, 82);

  // Skill cards: date, stamp, name and type in each of the 10 slots per page.
  const columns = [78.2, 218.0, 357.7, 497.5, 637.2];
  const rows = [300.5, 138.9];
  cardPages.forEach((skills, p) => {
    const page = pages[TEMPLATE.cards + p]!;
    skills.forEach((skill, i) => {
      const x = columns[i % 5]!;
      const y = rows[Math.floor(i / 5)]!;
      const type = stampType(skill.category);
      const cx = x + 65.35;
      centered(page, shortDate(skill.dateEarned), cx, y + 137, regular, 6, muted, 112, 1);
      page.drawRectangle({ x: cx - 40, y: y + 22, width: 80, height: 110, color: white });
      const [w, h] = STAMP_SIZE[type].card;
      page.drawImage(stamps.get(type)!, { x: cx - w / 2, y: y + 96 - h / 2, width: w, height: h });
      centered(page, skill.name.toUpperCase(), cx, y + 57, bold, 8.3, ink, 112, 2);
      centered(page, skill.category.toUpperCase(), cx, y + 31, regular, 7, muted, 112, 1);
    });
    // This page's "PASSPORT ID:" label is bottom-right, unlike the other pages.
    footer(page, 684);
  });

  // Detailed table: stamp, skill, description, earned through, date — 5 rows per page.
  const baselines = [378, 324, 270, 216, 162];
  const firstTable = TEMPLATE.cards + cardPages.length;
  tablePages.forEach((skills, p) => {
    const page = pages[firstTable + p]!;
    skills.forEach((skill, i) => {
      const y = baselines[i]!;
      const type = stampType(skill.category);
      page.drawRectangle({ x: 108, y: y - 22, width: 68, height: 44, color: white });
      const [w, h] = STAMP_SIZE[type].row;
      page.drawImage(stamps.get(type)!, { x: 142 - w / 2, y: y - h / 2, width: w, height: h });
      linesCentered(page, wrap(skill.name, bold, 7.5, 84, 2), 210, y, bold, 7.5, ink, 9);
      linesCentered(page, wrap(skill.description, regular, 7, 133, 4), 307, y, regular, 7, ink, 9);
      if (skill.earnedThrough)
        linesCentered(
          page,
          wrap(skill.earnedThrough, regular, 7, 120, 3),
          470,
          y,
          regular,
          7,
          ink,
          9,
        );
      page.drawText(shortDate(skill.dateEarned), {
        x: 627,
        y: y - 2.5,
        size: 7.5,
        font: regular,
        color: ink,
      });
    });
    footer(page, 82);
    page.drawText(`VERIFICATION CODE: ${input.verificationCode}`, {
      x: 334,
      y: 98,
      size: 6,
      font: regular,
      color: muted,
    });
  });

  // Fixed metadata keeps the bytes (and so the hash) reproducible.
  const issued = new Date(`${input.issuedOn}T00:00:00Z`);
  pdf.setTitle(`BTU AI Skills Digital Passport ${input.passportId}`);
  pdf.setAuthor("Business and Technology University (BTU)");
  pdf.setProducer("BTU AI Skills Digital Passport");
  pdf.setCreator("BTU AI Skills Digital Passport");
  pdf.setCreationDate(issued);
  pdf.setModificationDate(issued);
  return pdf.save({ useObjectStreams: false });
}
