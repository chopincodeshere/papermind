import fs from "fs";
import { createCanvas } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";

const DEFAULT_MAX_OCR_PAGES = 10;
const RENDER_SCALE = 2;
type StepLogger = (message: string) => void;

export class OcrService {
  async extractTextFromPdf(
    pdfPath: string,
    maxPages: number = DEFAULT_MAX_OCR_PAGES,
    onStep?: StepLogger
  ): Promise<string> {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found for OCR: ${pdfPath}`);
    }

    onStep?.("OCR: loading PDF renderer");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjs.getDocument({ data });
    const pdfDocument = await loadingTask.promise;

    const pagesToProcess = Math.min(pdfDocument.numPages, maxPages);
    onStep?.(`OCR: processing ${pagesToProcess} page(s)`);
    const worker = await createWorker("eng");
    const pageTexts: string[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
        onStep?.(`OCR: rendering page ${pageNumber}/${pagesToProcess}`);
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");

        await page.render({
          canvas,
          canvasContext: context as any,
          viewport,
        } as any).promise;

        const imageBuffer = canvas.toBuffer("image/png");
        onStep?.(`OCR: recognizing text from page ${pageNumber}/${pagesToProcess}`);
        const result = await worker.recognize(imageBuffer);
        const text = result.data.text.trim();
        if (text.length > 0) {
          pageTexts.push(text);
        }
      }
    } finally {
      onStep?.("OCR: releasing OCR worker");
      await worker.terminate();
    }

    onStep?.("OCR: completed");
    return pageTexts.join("\n\n");
  }
}
