import pdfParse from "pdf-parse";
import * as tesseract from "tesseract.js";

export async function extractTextFromPdfBuffer(buffer: Buffer, options?: { ocr?: boolean; maxPages?: number }) {
  const maxPages = options?.maxPages ?? 10;
  try {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text || "").trim();
    if (text.length > 50) {
      return text;
    }
  } catch (e) {
    // fall back to OCR below
  }

  if (options?.ocr !== false) {
    // Very lightweight OCR: render each page as image is heavy on Node; instead, try full-document OCR as bytes if needed
    const { data } = await tesseract.recognize(buffer, "eng" /* add +ara if needed */, {
      tessedit_pageseg_mode: 6,
    } as any);
    return (data.text || "").trim();
  }

  return "";
}

export function splitIntoChunks(text: string, chunkSize = 1000) {
  const paragraphs = text.split("\n\n");
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length < chunkSize) {
      current += para + "\n\n";
    } else {
      if (current.trim().length) chunks.push(current.trim());
      current = para + "\n\n";
    }
  }
  if (current.trim().length) chunks.push(current.trim());
  return chunks.filter(c => c.length > 50 && !/^\d+$/.test(c));
}


