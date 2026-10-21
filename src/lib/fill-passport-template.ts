import { formatDate } from "@/lib/passport-data";
import type { StudentPassport } from "@/lib/passport-session";
import { passportSkillType, versionVerificationCode } from "@/lib/passport-session";

type PdfColor = { type: "RGB"; red: number; green: number; blue: number };
type PdfFont = { widthOfTextAtSize: (text: string, size: number) => number };
type PdfImage = object;
type PdfPage = {
  drawText: (text: string, options: { x: number; y: number; size: number; font: PdfFont; color?: PdfColor; maxWidth?: number; lineHeight?: number }) => void;
  drawRectangle: (options: { x: number; y: number; width: number; height: number; color?: PdfColor; borderColor?: PdfColor; borderWidth?: number }) => void;
  drawEllipse: (options: { x: number; y: number; xScale: number; yScale: number; color?: PdfColor; borderColor?: PdfColor; borderWidth?: number }) => void;
  drawImage: (image: PdfImage, options: { x: number; y: number; width: number; height: number }) => void;
};
type PdfDocument = {
  getPages: () => PdfPage[];
  embedFont: (font: string) => Promise<PdfFont>;
  embedPng: (bytes: Uint8Array) => Promise<PdfImage>;
  save: () => Promise<Uint8Array>;
};
type PdfLib = {
  PDFDocument: { load: (bytes: Uint8Array) => Promise<PdfDocument> };
  StandardFonts: { Helvetica: string; HelveticaBold: string };
  rgb: (red: number, green: number, blue: number) => PdfColor;
};

declare global {
  interface Window { PDFLib?: PdfLib }
}

async function getPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pdf-lib="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the PDF fill library.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "/pdf-lib.min.js";
    script.dataset["pdfLib"] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the PDF fill library."));
    document.head.appendChild(script);
  });
  if (!window.PDFLib) throw new Error("PDF fill library loaded without its browser API.");
  return window.PDFLib;
}

function wrappedLines(text: string, font: PdfFont, size: number, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1] ?? "";
  while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

function drawCentered(page: PdfPage, text: string, centerX: number, y: number, font: PdfFont, size: number, color: PdfColor, maxWidth: number, maxLines = 2) {
  const lines = wrappedLines(text, font, size, maxWidth, maxLines);
  lines.forEach((line, index) => page.drawText(line, {
    x: centerX - font.widthOfTextAtSize(line, size) / 2,
    y: y - index * (size + 2), font, size, color,
  }));
}

function stampSvg(type: "AI_SKILL" | "AI_APPLIED" | "AI_ADVANCED") {
  if (type === "AI_SKILL") return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="180" viewBox="0 0 200 180"><polygon points="100,5 196,173 4,173" fill="#fa3d49" stroke="#fff" stroke-width="3" stroke-dasharray="5 4"/><text x="100" y="91" fill="#fff" font-family="Arial,sans-serif" font-size="23" font-weight="700" text-anchor="middle">AI SKILL</text><text x="100" y="115" fill="#fff" font-family="Arial,sans-serif" font-size="17" font-weight="700" text-anchor="middle">FOCUSED</text><text x="100" y="135" fill="#fff" font-family="Arial,sans-serif" font-size="17" font-weight="700" text-anchor="middle">LEARNING</text></svg>`;
  if (type === "AI_APPLIED") return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="140" viewBox="0 0 300 140"><g transform="rotate(-7 150 70)"><rect x="8" y="20" width="284" height="100" fill="#4b00f5"/><rect x="17" y="29" width="266" height="82" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4"/><text x="150" y="64" fill="#fff" font-family="Arial,sans-serif" font-size="25" font-weight="700" text-anchor="middle">AI APPLIED SKILL</text><text x="150" y="91" fill="#fff" font-family="Arial,sans-serif" font-size="19" font-weight="700" text-anchor="middle">APPLIED LEARNING</text></g></svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><circle cx="90" cy="90" r="84" fill="#0d2865" stroke="#fff" stroke-width="2"/><circle cx="90" cy="90" r="75" fill="none" stroke="#fff" stroke-width="1.5"/><text x="90" y="70" fill="#fff" font-family="Arial,sans-serif" font-size="18" font-weight="700" text-anchor="middle">AI ADVANCED</text><text x="90" y="91" fill="#fff" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle">EXTENDED</text><text x="90" y="108" fill="#fff" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle">ACADEMIC</text><text x="90" y="125" fill="#fff" font-family="Arial,sans-serif" font-size="14" font-weight="700" text-anchor="middle">LEARNING</text></svg>`;
}

async function stampPng(type: "AI_SKILL" | "AI_APPLIED" | "AI_ADVANCED") {
  const image = new Image();
  const source = URL.createObjectURL(new Blob([stampSvg(type)], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not create the passport stamp artwork."));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render the passport stamp artwork.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not encode the passport stamp artwork.")), "image/png"));
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(source);
  }
}

function drawStamp(page: PdfPage, image: PdfImage, centerX: number, centerY: number, width: number, height: number) {
  page.drawImage(image, { x: centerX - width / 2, y: centerY - height / 2, width, height });
}

function drawLinesCentered(page: PdfPage, lines: string[], x: number, centerY: number, font: PdfFont, size: number, color: PdfColor, lineHeight: number) {
  const firstBaseline = centerY + ((lines.length - 1) * lineHeight) / 2 - size * 0.35;
  lines.forEach((line, index) => page.drawText(line, { x, y: firstBaseline - index * lineHeight, size, font, color }));
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export async function createFilledPassportPdf(profile: StudentPassport, version: number) {
  const pdfLib = await getPdfLib();
  const templateResponse = await fetch("/passport-blank-template.pdf");
  if (!templateResponse.ok) throw new Error("The original passport template could not be loaded.");
  const pdf = await pdfLib.PDFDocument.load(new Uint8Array(await templateResponse.arrayBuffer()));
  const pages = pdf.getPages();
  if (pages.length !== 4) throw new Error("The passport template should contain four pages.");
  const regular = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
  const bold = await pdf.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const ink = pdfLib.rgb(0.08, 0.08, 0.09);
  const muted = pdfLib.rgb(0.36, 0.36, 0.39);
  const verificationCode = versionVerificationCode(profile, version);
  const versionSkills = profile.skills.filter((skill) => Number(skill.version.replace(/^V/i, "")) === version);
  const stampTypes = [...new Set(versionSkills.map((skill) => passportSkillType(skill.category)))];
  const stampImages = new Map<string, PdfImage>();
  await Promise.all(stampTypes.map(async (type) => stampImages.set(type, await pdf.embedPng(await stampPng(type)))));
  const passportId = profile.passportId;
  const dateIssued = formatDate(profile.issuedAt, "en");

  // Page 1: fill the existing name/date lines and use the open lower-left space for the code.
  pages[0]!.drawText(profile.firstName.toUpperCase(), { x: 108, y: 306, size: 11, font: bold, color: ink });
  pages[0]!.drawText(profile.lastName.toUpperCase(), { x: 108, y: 251, size: 16, font: bold, color: ink });
  pages[0]!.drawText(dateIssued.toUpperCase(), { x: 593, y: 300, size: 14, font: bold, color: ink });
  pages[0]!.drawText("VERIFICATION CODE", { x: 108, y: 202, size: 8, font: bold, color: muted });
  pages[0]!.drawText(verificationCode, { x: 108, y: 185, size: 8, font: bold, color: ink });
  pages[0]!.drawText(passportId, { x: 684, y: 82, size: 7.5, font: regular, color: muted });

  // Page 2: fill only the existing passport ID footer field.
  pages[1]!.drawText(passportId, { x: 82, y: 82, size: 7.5, font: regular, color: muted });

  // Page 3: match the reference with a date, category stamp, skill name, and type on each card.
  const cardColumns = [78.2, 218.0, 357.7, 497.5, 637.2];
  const cardRows = [300.5, 138.9];
  versionSkills.slice(0, 10).forEach((skill, index) => {
    const page = pages[2]!;
    const x = cardColumns[index % 5]!;
    const y = cardRows[Math.floor(index / 5)]!;
    const type = passportSkillType(skill.category);
    const centerX = x + 65.35;
    drawCentered(page, shortDate(skill.dateEarned), centerX, y + 137, regular, 6, muted, 112, 1);
    page.drawRectangle({ x: centerX - 40, y: y + 22, width: 80, height: 110, color: pdfLib.rgb(1, 1, 1) });
    const stamp = stampImages.get(type);
    if (stamp) {
      const size = type === "AI_APPLIED" ? [59, 28] : type === "AI_SKILL" ? [42, 40] : [40, 40];
      drawStamp(page, stamp, centerX, y + 96, size[0]!, size[1]!);
    }
    drawCentered(page, skill.name.toUpperCase(), centerX, y + 57, bold, 8.3, ink, 112, 2);
    drawCentered(page, skill.category.toUpperCase(), centerX, y + 31, regular, 7, muted, 112, 1);
  });
  pages[2]!.drawText(passportId, { x: 82, y: 82, size: 7.5, font: regular, color: muted });

  // Page 4: use the stamp artwork and data fields present in the reference. The workbook has no "earned through" field.
  const rowBaselines = [378, 324, 270, 216, 162];
  versionSkills.slice(0, 5).forEach((skill, index) => {
    const page = pages[3]!;
    const y = rowBaselines[index]!;
    const type = passportSkillType(skill.category);
    page.drawRectangle({ x: 108, y: y - 22, width: 68, height: 44, color: pdfLib.rgb(1, 1, 1) });
    const stamp = stampImages.get(type);
    if (stamp) {
      const size = type === "AI_APPLIED" ? [55, 27] : type === "AI_SKILL" ? [40, 38] : [39, 39];
      drawStamp(page, stamp, 142, y, size[0]!, size[1]!);
    }
    const nameLines = wrappedLines(skill.name, bold, 7.5, 84, 2);
    drawLinesCentered(page, nameLines, 210, y, bold, 7.5, ink, 9);
    const descriptionLines = wrappedLines(skill.description, regular, 7, 133, 4);
    drawLinesCentered(page, descriptionLines, 307, y, regular, 7, ink, 9);
    page.drawText(shortDate(skill.dateEarned), { x: 627, y: y - 2.5, size: 7.5, font: regular, color: ink });
  });
  pages[3]!.drawText(passportId, { x: 82, y: 82, size: 7.5, font: regular, color: muted });
  pages[3]!.drawText(`VERIFICATION CODE: ${verificationCode}`, { x: 334, y: 98, size: 6, font: regular, color: muted });

  return pdf.save();
}

export async function downloadFilledPassport(profile: StudentPassport, version: number) {
  const bytes = await createFilledPassportPdf(profile, version);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${profile.passportId}-v${version}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
