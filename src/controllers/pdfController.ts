import { Request, Response } from 'express';
import { PdfService } from '../services/pdfService';
import { pdfChatFlow } from '../flows/pdfChatFlow';
import fs from 'fs';
import path from 'path';
import ChatFirestoreService from '../services/firebase';
import { createPdfSession, deletePdfSession, getPdfSession } from '../services/pdfSessionStore';

const pdfService = new PdfService();
const firestoreService = ChatFirestoreService.getInstance();
const UPLOAD_PROGRESS_TTL_MS = 30 * 60 * 1000;

const uploadProgress = new Map<string, { steps: string[]; done: boolean; error: boolean; updatedAt: number }>();

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
    logUploadStep(uploadId, 'Upload request received');

    try {
      if (!req.file) {
        logUploadStep(uploadId, 'No file found in request', true);
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      logUploadStep(uploadId, `File uploaded to temp storage: ${req.file.path}`);
      logUploadStep(uploadId, 'Starting PDF text extraction');

      const pdfText = await pdfService.extractText(req.file.path, (message) => {
        logUploadStep(uploadId, message);
      });
      logUploadStep(uploadId, `Text extraction completed (${pdfText.length} characters)`);

      const userId = getUserId(req);
      const fileName = req.file.originalname || path.basename(req.file.path);
      const title = getDocumentTitle(fileName);

      logUploadStep(uploadId, 'Saving PDF metadata to Firestore');
      await firestoreService.upsertUser({
        userId,
        name: req.user?.identifier || `User ${userId.slice(-6)}`,
      });

      const documentId = await firestoreService.createDocumentRecord({
        title,
        fileName,
        storageUrl: req.file.path,
        userId,
      });

      const conversationId = await firestoreService.createConversationRecord({
        title: `Chat: ${title}`,
        userId,
        documentId,
      });

      const sessionId = createPdfSession({
        pdfPath: req.file.path,
        pdfText,
        userId,
        documentId,
        conversationId,
      });

      logUploadStep(uploadId, `Firestore conversation created: ${conversationId}`);
      logUploadStep(uploadId, `Session created: ${sessionId}`);
      logUploadStep(uploadId, 'Upload processing completed', false, true);

      res.json({
        text: pdfText.substring(0, 500) + (pdfText.length > 500 ? '...' : ''),
        sessionId,
        conversationId,
        message: 'PDF uploaded and processed successfully',
        uploadId,
      });
    } catch (error) {
      logUploadStep(uploadId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, true, true);
      console.error('Error in PDF extraction:', error);
      res.status(500).json({
        message: 'Error processing PDF',
        error: error instanceof Error ? error.message : 'Unknown error',
        uploadId,
      });
    }
  }

  getUploadStatus(req: Request, res: Response): void {
    cleanupStaleUploadProgress();
    const rawUploadId = req.params.uploadId;
    const uploadId = Array.isArray(rawUploadId) ? rawUploadId[0] : rawUploadId;

    if (!uploadId) {
      res.status(400).json({ message: 'Upload ID is required' });
      return;
    }

    const status = uploadProgress.get(uploadId);
    if (!status) {
      res.status(404).json({ message: 'Upload status not found' });
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
      const userId = getUserId(req);

      if (!message) {
        res.status(400).json({ message: 'Message is required' });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ message: 'Session ID is required' });
        return;
      }

      const session = getPdfSession(sessionId);
      if (!session) {
        res.status(404).json({
          message: 'PDF session not found. Please upload the PDF again.',
          error: 'Session expired or invalid',
        });
        return;
      }

      if (session.userId !== userId) {
        res.status(403).json({
          message: 'You are not allowed to use this session.',
          error: 'Session ownership mismatch',
        });
        return;
      }

      const quota = await firestoreService.consumePromptQuota(userId);
      if (!quota.ok) {
        res.status(429).json({
          message: quota.message || 'Prompt limit reached for this account.',
          error: 'Rate limit exceeded',
        });
        return;
      }

      const { pdfText, conversationId } = session;

      if (!pdfText || !pdfText.trim()) {
        deletePdfSession(sessionId);
        res.status(404).json({
          message: 'Conversation context is unavailable. Please upload the PDF again.',
          error: 'Missing context',
        });
        return;
      }

      console.log(`Using cached extracted text for session ${sessionId} (${pdfText.length} characters)`);
      console.log(`Generating response for message: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);

      const result = await pdfChatFlow.run({
        message,
        pdfContent: pdfText,
        history: history || [],
        documentId: session.documentId,
      });

      await firestoreService.addMessageRecord({
        conversationId,
        sender: 'user',
        content: message,
      });

      await firestoreService.addMessageRecord({
        conversationId,
        sender: 'assistant',
        content: result?.result?.response || '',
      });

      res.json({
        data: result,
        status: 1,
        message: quota.remaining === Number.MAX_SAFE_INTEGER
          ? 'Chat with PDF successful'
          : `Chat with PDF successful. ${quota.remaining} prompts remaining.`,
      });
    } catch (error) {
      console.error('Error in chat with PDF:', error);
      res.status(500).json({
        message: 'Error processing chat with PDF',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

function getUploadId(req: Request): string {
  const fromHeader = req.headers['x-upload-id'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getUserId(req: Request): string {
  if (req.user?.userId) {
    return req.user.userId;
  }
  throw new Error('Missing authenticated user');
}

function getDocumentTitle(fileName: string): string {
  const normalized = fileName.trim();
  if (!normalized) {
    return 'Untitled PDF';
  }
  return normalized.replace(/\.pdf$/i, '');
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
