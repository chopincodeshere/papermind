import { Request, Response } from "express";
import { PdfService } from "../services/pdfService";
import { pdfChatFlow } from "../flows/pdfChatFlow";
import fs from "fs";
import path from "path";

const pdfService = new PdfService();

// Store uploaded PDF paths with a session ID
const uploadedPdfs = new Map<string, string>();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`Created uploads directory at: ${uploadsDir}`);
    } catch (error) {
        console.error(`Failed to create uploads directory: ${error}`);
    }
}

export class PdfController {
    async uploadAndExtract(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ message: "No file uploaded" });
                return;
            }

            console.log(`Processing uploaded file: ${req.file.path}`);
            
            const pdfText = await pdfService.extractText(req.file.path);
            console.log(`PDF Text extracted successfully (${pdfText.length} characters)`);
            
            // Generate a session ID for this PDF
            const sessionId = Date.now().toString();
            uploadedPdfs.set(sessionId, req.file.path);
            console.log(`Created session ${sessionId} for PDF: ${req.file.path}`);
            
            res.json({ 
                text: pdfText.substring(0, 500) + (pdfText.length > 500 ? '...' : ''), // Send a preview
                sessionId: sessionId,
                message: "PDF uploaded and processed successfully" 
            });
        } catch (error) {
            console.error("Error in PDF extraction:", error);
            res.status(500).json({ 
                message: "Error processing PDF", 
                error: error instanceof Error ? error.message : "Unknown error" 
            });
        }
    }

    async chatWithPdf(req: Request, res: Response): Promise<void> {
        try {
            const { message, sessionId, history } = req.body;
            
            if (!message) {
                res.status(400).json({ message: "Message is required" });
                return;
            }

            if (!sessionId) {
                res.status(400).json({ message: "Session ID is required" });
                return;
            }
            
            // Get the PDF path from the session ID
            const pdfPath = uploadedPdfs.get(sessionId);
            
            if (!pdfPath) {
                res.status(404).json({ 
                    message: "PDF session not found. Please upload the PDF again.",
                    error: "Session expired or invalid" 
                });
                return;
            }

            if (!fs.existsSync(pdfPath)) {
                // Remove invalid session
                uploadedPdfs.delete(sessionId);
                res.status(404).json({ 
                    message: "PDF file no longer exists. Please upload it again.",
                    error: "File not found" 
                });
                return;
            }
            
            console.log(`Extracting text from PDF for chat: ${pdfPath}`);
            // Extract text from the PDF
            const pdfText = await pdfService.extractText(pdfPath);
            console.log(`Successfully extracted ${pdfText.length} characters of text for chat`);
            
            // Use the PDF chat flow to generate a response
            console.log(`Generating response for message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
            const result = await pdfChatFlow.run({ 
                message, 
                pdfContent: pdfText,
                history: history || [],
                documentId: sessionId
            });
            
            res.json({ 
                data: result, 
                status: 1, 
                message: "Chat with PDF successful" 
            });
        } catch (error) {
            console.error("Error in chat with PDF:", error);
            res.status(500).json({ 
                message: "Error processing chat with PDF",
                error: error instanceof Error ? error.message : "Unknown error" 
            });
        }
    }
}
