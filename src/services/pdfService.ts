import fs from 'fs';
import pdfParse from 'pdf-parse';
import path from 'path';
import { VectorStoreService } from './vectorStoreService';
import { OcrService } from './ocrService';

const MIN_DIRECT_TEXT_LENGTH = 80;
const MAX_OCR_PAGES = 10;
type StepLogger = (message: string) => void;

export class PdfService {
    private vectorStore: VectorStoreService;
    private ocrService: OcrService;

    constructor() {
        this.vectorStore = new VectorStoreService();
        this.ocrService = new OcrService();
    }

    async extractText(pdfPath: string, onStep?: StepLogger): Promise<string> {
        try {
            this.logStep(`Starting extraction for file: ${pdfPath}`, onStep);
            
            // Check if the file exists
            if (!fs.existsSync(pdfPath)) {
                throw new Error(`PDF file not found at path: ${pdfPath}`);
            }
            this.logStep('File existence check passed', onStep);

            // Check if the file is accessible
            try {
                fs.accessSync(pdfPath, fs.constants.R_OK);
            } catch (err) {
                throw new Error(`PDF file is not readable: ${pdfPath}`);
            }
            this.logStep('Read access check passed', onStep);

            // Skip extension check for multer uploads, as they don't have extensions
            // Instead, we'll try to parse the file and let pdf-parse validate it
            
            // Read the file
            this.logStep('Reading PDF bytes from disk', onStep);
            const dataBuffer = fs.readFileSync(pdfPath);
            
            // Check if the buffer is empty
            if (!dataBuffer || dataBuffer.length === 0) {
                throw new Error(`PDF file is empty: ${pdfPath}`);
            }
            this.logStep(`PDF byte size: ${dataBuffer.length} bytes`, onStep);
            
            // Parse the PDF
            try {
                this.logStep('Attempting embedded text extraction', onStep);
                const data = await pdfParse(dataBuffer);
                const extractedText = (data?.text || '').trim();
                this.logStep(`Embedded text length: ${extractedText.length} characters`, onStep);

                if (extractedText.length >= MIN_DIRECT_TEXT_LENGTH) {
                    this.logStep('Embedded text is sufficient; OCR not required', onStep);
                    return extractedText;
                }

                this.logStep('Low embedded text detected; running OCR fallback', onStep);
                const ocrText = await this.ocrService.extractTextFromPdf(pdfPath, MAX_OCR_PAGES, onStep);
                const finalText = ocrText.trim();
                this.logStep(`OCR text length: ${finalText.length} characters`, onStep);

                if (!finalText) {
                    throw new Error(`No text could be extracted from PDF (including OCR): ${pdfPath}`);
                }

                this.logStep('Text extraction completed using OCR', onStep);
                return finalText;
            } catch (extractionError: any) {
                this.logStep(`Extraction failure: ${extractionError?.message || 'Unknown extraction error'}`, onStep);
                console.error('PDF extraction/OCR error:', extractionError);
                throw new Error(`Unable to extract text from PDF: ${extractionError.message || 'Unknown extraction error'}`);
            }
        } catch (error) {
            this.logStep(`Fatal extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`, onStep);
            console.error("Error extracting text from PDF:", error);
            throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async indexPdf(pdfPath: string, metadata: Record<string, any> = {}): Promise<void> {
        const text = await this.extractText(pdfPath);
        await this.vectorStore.addDocument(text, {
            ...metadata,
            source: pdfPath
        });
    }

    async searchPdf(query: string, limit: number = 3): Promise<string[]> {
        return this.vectorStore.findRelevantChunks(query, limit);
    }

    private logStep(message: string, onStep?: StepLogger): void {
        console.log(`[PDF] ${message}`);
        if (onStep) {
            onStep(message);
        }
    }
}
