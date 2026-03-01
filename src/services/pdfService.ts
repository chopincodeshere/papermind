import fs from 'fs';
import pdfParse from 'pdf-parse';
import path from 'path';
import { VectorStoreService } from './vectorStoreService';

export class PdfService {
    private vectorStore: VectorStoreService;

    constructor() {
        this.vectorStore = new VectorStoreService();
    }

    async extractText(pdfPath: string): Promise<string> {
        try {
            console.log(`Attempting to extract text from: ${pdfPath}`);
            
            // Check if the file exists
            if (!fs.existsSync(pdfPath)) {
                throw new Error(`PDF file not found at path: ${pdfPath}`);
            }

            // Check if the file is accessible
            try {
                fs.accessSync(pdfPath, fs.constants.R_OK);
            } catch (err) {
                throw new Error(`PDF file is not readable: ${pdfPath}`);
            }

            // Skip extension check for multer uploads, as they don't have extensions
            // Instead, we'll try to parse the file and let pdf-parse validate it
            
            // Read the file
            const dataBuffer = fs.readFileSync(pdfPath);
            
            // Check if the buffer is empty
            if (!dataBuffer || dataBuffer.length === 0) {
                throw new Error(`PDF file is empty: ${pdfPath}`);
            }
            
            // Parse the PDF
            try {
                const data = await pdfParse(dataBuffer);
                
                // Check if text was extracted
                if (!data || !data.text) {
                    throw new Error(`No text could be extracted from the PDF: ${pdfPath}`);
                }
                
                return data.text;
            } catch (pdfError: any) {
                console.error('PDF parsing error:', pdfError);
                throw new Error(`Invalid PDF format or corrupted file: ${pdfError.message || 'Unknown PDF error'}`);
            }
        } catch (error) {
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
}
