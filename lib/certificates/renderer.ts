import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  buildCertificateBullets,
  buildCertificateParagraphs,
  formatCertificateDate,
  CERTIFICATE_CITY,
  CERTIFICATE_CLOSING,
  type CertificateTextRun,
} from "./content.ts";
import type { VehicleServiceFeatures } from "./types.ts";

const MARGIN = 66;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;
const BODY_FIRST_LINE_INDENT = 56;
const BULLET_MARKER_OFFSET = 18;
const BULLET_TEXT_OFFSET = 34;

const DATE_LINE_Y = 721;
const ADDRESSEE_Y = 692;
const BODY_START_Y = 616;
const BLOCK_GAP = 26;

const TEXT_COLOR = rgb(0, 0, 0);

type CertificateFonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

type LayoutWord = {
  text: string;
  bold: boolean;
  width: number;
};

function toWords(
  runs: CertificateTextRun[],
  fonts: CertificateFonts,
): LayoutWord[] {
  const words: LayoutWord[] = [];

  for (const run of runs) {
    const font = run.bold ? fonts.bold : fonts.regular;

    for (const text of run.text.split(/\s+/).filter(Boolean)) {
      words.push({
        text,
        bold: run.bold === true,
        width: font.widthOfTextAtSize(text, FONT_SIZE),
      });
    }
  }

  return words;
}

function wrapWords(
  words: LayoutWord[],
  spaceWidth: number,
  maxWidth: number,
  firstLineIndent: number,
) {
  const lines: LayoutWord[][] = [];
  let currentLine: LayoutWord[] = [];
  let currentWidth = 0;

  for (const word of words) {
    const indent = lines.length === 0 ? firstLineIndent : 0;
    const separatorWidth = currentLine.length === 0 ? 0 : spaceWidth;
    const nextWidth = currentWidth + separatorWidth + word.width;

    if (currentLine.length > 0 && indent + nextWidth > maxWidth) {
      lines.push(currentLine);
      currentLine = [word];
      currentWidth = word.width;
      continue;
    }

    currentLine.push(word);
    currentWidth = nextWidth;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Draws a justified paragraph. Every line except the last stretches its gaps
 * so both edges align, matching the reference letter.
 */
function drawJustifiedParagraph(
  page: ReturnType<PDFDocument["getPages"]>[number],
  runs: CertificateTextRun[],
  fonts: CertificateFonts,
  startY: number,
  maxWidth: number,
  firstLineIndent: number = BODY_FIRST_LINE_INDENT,
) {
  const spaceWidth = fonts.regular.widthOfTextAtSize(" ", FONT_SIZE);
  const words = toWords(runs, fonts);
  const lines = wrapWords(words, spaceWidth, maxWidth, firstLineIndent);
  let y = startY;

  lines.forEach((line, lineIndex) => {
    const indent = lineIndex === 0 ? firstLineIndent : 0;
    const naturalWidth =
      line.reduce((total, word) => total + word.width, 0) +
      spaceWidth * (line.length - 1);
    const isLastLine = lineIndex === lines.length - 1;
    const extraGap =
      isLastLine || line.length < 2
        ? 0
        : (maxWidth - indent - naturalWidth) / (line.length - 1);
    let x = MARGIN + indent;

    for (const word of line) {
      page.drawText(word.text, {
        x,
        y,
        size: FONT_SIZE,
        font: word.bold ? fonts.bold : fonts.regular,
        color: TEXT_COLOR,
      });

      x += word.width + spaceWidth + extraGap;
    }

    y -= LINE_HEIGHT;
  });

  return y;
}

export async function renderCoverageCertificate(input: {
  plate: string;
  features: VehicleServiceFeatures;
  issuedAt: Date;
  templateBytes: Uint8Array;
}) {
  const pdf = await PDFDocument.load(input.templateBytes);
  const [page] = pdf.getPages();

  if (!page) {
    throw new Error("The certificate template has no pages.");
  }

  const fonts: CertificateFonts = {
    regular: await pdf.embedFont(StandardFonts.TimesRoman),
    bold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    italic: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const { width } = page.getSize();
  const contentWidth = width - MARGIN * 2;
  const dateLine = `${CERTIFICATE_CITY}, ${formatCertificateDate(input.issuedAt)}`;

  page.drawText(dateLine, {
    x:
      width -
      MARGIN -
      fonts.regular.widthOfTextAtSize(dateLine, FONT_SIZE),
    y: DATE_LINE_Y,
    size: FONT_SIZE,
    font: fonts.regular,
    color: TEXT_COLOR,
  });

  ["Sr.", "Cliente", "S___/___D"].forEach((line, index) => {
    page.drawText(line, {
      x: MARGIN,
      y: ADDRESSEE_Y - index * LINE_HEIGHT,
      size: FONT_SIZE,
      font: fonts.regular,
      color: TEXT_COLOR,
    });
  });

  let cursorY = BODY_START_Y;

  for (const paragraph of buildCertificateParagraphs(input.plate)) {
    cursorY = drawJustifiedParagraph(
      page,
      paragraph,
      fonts,
      cursorY,
      contentWidth,
    );
    cursorY -= BLOCK_GAP - LINE_HEIGHT;
  }

  cursorY -= LINE_HEIGHT;

  for (const bullet of buildCertificateBullets(input.features)) {
    page.drawText("•", {
      x: MARGIN + BULLET_MARKER_OFFSET,
      y: cursorY,
      size: FONT_SIZE,
      font: fonts.regular,
      color: TEXT_COLOR,
    });
    page.drawText(bullet, {
      x: MARGIN + BULLET_TEXT_OFFSET,
      y: cursorY,
      size: FONT_SIZE,
      font: fonts.italic,
      color: TEXT_COLOR,
    });

    cursorY -= LINE_HEIGHT;
  }

  drawJustifiedParagraph(
    page,
    CERTIFICATE_CLOSING,
    fonts,
    cursorY - BLOCK_GAP,
    contentWidth,
  );

  return pdf.save();
}
