import { Request, Response } from "express";
import { PdfService } from "../services/pdfService";
import { pdfChatFlow } from "../flows/pdfChatFlow";
import fs from "fs";
import path from "path";

const pdfService = new PdfService();
const UPLOAD_PROGRESS_TTL_MS = 30 * 60 * 1000;

// Store uploaded PDF paths with a session ID
const uploadedPdfs = new Map<string, { pdfPath: string; pdfText: string }>();
const uploadProgress = new Map<string, { steps: string[]; done: boolean; error: boolean; updatedAt: number }>();

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
        const uploadId = getUploadId(req);
        startUploadProgress(uploadId);
        logUploadStep(uploadId, "Upload request received");

        try {
            if (!req.file) {
                logUploadStep(uploadId, "No file found in request", true);
                res.status(400).json({ message: "No file uploaded" });
                return;
            }

            logUploadStep(uploadId, `File uploaded to temp storage: ${req.file.path}`);
            logUploadStep(uploadId, "Starting PDF text extraction");
            
            const pdfText = await pdfService.extractText(req.file.path, (message) => {
                logUploadStep(uploadId, message);
            });
            logUploadStep(uploadId, `Text extraction completed (${pdfText.length} characters)`);
            
            // Generate a session ID for this PDF
            const sessionId = Date.now().toString();
            uploadedPdfs.set(sessionId, { pdfPath: req.file.path, pdfText });
            logUploadStep(uploadId, `Session created: ${sessionId}`);
            logUploadStep(uploadId, "Upload processing completed", false, true);
            
            res.json({ 
                text: pdfText.substring(0, 500) + (pdfText.length > 500 ? '...' : ''), // Send a preview
                sessionId: sessionId,
                message: "PDF uploaded and processed successfully",
                uploadId
            });
        } catch (error) {
            logUploadStep(uploadId, `Error: ${error instanceof Error ? error.message : "Unknown error"}`, true, true);
            console.error("Error in PDF extraction:", error);
            res.status(500).json({ 
                message: "Error processing PDF", 
                error: error instanceof Error ? error.message : "Unknown error",
                uploadId
            });
        }
    }

    getUploadStatus(req: Request, res: Response): void {
        cleanupStaleUploadProgress();
        const { uploadId } = req.params;
        const status = uploadProgress.get(uploadId);

        if (!status) {
            res.status(404).json({ message: "Upload status not found" });
            return;
        }

        res.json({
            uploadId,
            steps: status.steps,
            done: status.done,
            error: status.error,
        });
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
            const session = uploadedPdfs.get(sessionId);
            
            if (!session) {
                res.status(404).json({ 
                    message: "PDF session not found. Please upload the PDF again.",
                    error: "Session expired or invalid" 
                });
                return;
            }

            const { pdfPath, pdfText } = session;

            if (!fs.existsSync(pdfPath)) {
                // Remove invalid session
                uploadedPdfs.delete(sessionId);
                res.status(404).json({ 
                    message: "PDF file no longer exists. Please upload it again.",
                    error: "File not found" 
                });
                return;
            }
            
            console.log(`Using cached extracted text for session ${sessionId} (${pdfText.length} characters)`);
            
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

function getUploadId(req: Request): string {
    const fromHeader = req.headers["x-upload-id"];
    if (typeof fromHeader === "string" && fromHeader.trim()) {
        return fromHeader.trim();
    }
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function startUploadProgress(uploadId: string): void {
    uploadProgress.set(uploadId, {
        steps: [],
        done: false,
        error: false,
        updatedAt: Date.now(),
    });
}

function logUploadStep(uploadId: string, message: string, isError = false, markDone = false): void {
    const state = uploadProgress.get(uploadId) || {
        steps: [],
        done: false,
        error: false,
        updatedAt: Date.now(),
    };

    state.steps.push(message);
    state.error = state.error || isError;
    state.done = markDone || state.done;
    state.updatedAt = Date.now();

    uploadProgress.set(uploadId, state);
    if (isError) {
        console.error(`[PDF Upload:${uploadId}] ${message}`);
    } else {
        console.log(`[PDF Upload:${uploadId}] ${message}`);
    }
}

function cleanupStaleUploadProgress(): void {
    const now = Date.now();
    for (const [uploadId, status] of uploadProgress.entries()) {
        if (now - status.updatedAt > UPLOAD_PROGRESS_TTL_MS) {
            uploadProgress.delete(uploadId);
        }
    }
}
