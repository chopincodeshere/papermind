import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import ChatFirestoreService from '../services/firebase';
import { PdfService } from '../services/pdfService';
import { createPdfSession, deleteSessionsByConversationIds } from '../services/pdfSessionStore';

const firestoreService = ChatFirestoreService.getInstance();
const pdfService = new PdfService();

export const getChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const conversations = await firestoreService.getUserConversations(userId);
    res.json({ data: conversations, status: 1, message: 'Chats fetched successfully' });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ data: [], status: 0, message: 'Failed to fetch chats' });
  }
};

export const getChatMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) {
      res.status(400).json({ data: [], status: 0, message: 'Conversation ID is required' });
      return;
    }

    const userId = getUserId(req);
    const context = await firestoreService.getConversationContext(conversationId);
    if (!context) {
      res.status(404).json({ data: [], status: 0, message: 'Conversation not found' });
      return;
    }

    if (context.userId && context.userId !== userId) {
      res.status(403).json({ data: [], status: 0, message: 'Forbidden' });
      return;
    }

    const messages = await firestoreService.getConversationMessages(conversationId);
    res.json({ data: messages, status: 1, message: 'Conversation messages fetched successfully' });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ data: [], status: 0, message: 'Failed to fetch conversation messages' });
  }
};

export const resumeChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) {
      res.status(400).json({ data: null, status: 0, message: 'Conversation ID is required' });
      return;
    }

    const userId = getUserId(req);
    const context = await firestoreService.getConversationContext(conversationId);
    if (!context) {
      res.status(404).json({ data: null, status: 0, message: 'Conversation not found' });
      return;
    }

    if (context.userId && context.userId !== userId) {
      res.status(403).json({ data: null, status: 0, message: 'Forbidden' });
      return;
    }

    const messages = await firestoreService.getConversationMessages(conversationId);
    const history = messages
      .filter((msg) => msg.sender === 'user' || msg.sender === 'assistant')
      .map((msg) => ({
        role: msg.sender as 'user' | 'assistant',
        content: msg.content,
      }));

    let pdfText = '';
    let pdfPath = '';

    if (context.documentStorageUrl && fs.existsSync(context.documentStorageUrl)) {
      pdfPath = context.documentStorageUrl;
      pdfText = await pdfService.extractText(context.documentStorageUrl);
    } else {
      pdfText = buildFallbackContext(history);
    }

    const sessionId = createPdfSession({
      pdfPath,
      pdfText,
      userId,
      documentId: context.documentId || '',
      conversationId,
    });

    res.json({
      data: {
        conversationId,
        sessionId,
        messages,
        history,
      },
      status: 1,
      message: 'Conversation resumed successfully',
    });
  } catch (error) {
    console.error('Error resuming conversation:', error);
    res.status(500).json({ data: null, status: 0, message: 'Failed to resume conversation' });
  }
};

export const deleteChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const conversationId = getConversationId(req);
    if (!conversationId) {
      res.status(400).json({ data: null, status: 0, message: 'Conversation ID is required' });
      return;
    }

    const userId = getUserId(req);
    const context = await firestoreService.getConversationContext(conversationId);
    if (!context) {
      res.status(404).json({ data: null, status: 0, message: 'Conversation not found' });
      return;
    }

    if (context.userId && context.userId !== userId) {
      res.status(403).json({ data: null, status: 0, message: 'Forbidden' });
      return;
    }

    const deletion = await firestoreService.deleteConversationArtifacts(conversationId);
    deleteSessionsByConversationIds([conversationId]);
    const fileDeleted = deleteLocalFileIfPresent(deletion.documentStorageUrl);

    res.json({
      data: {
        conversationId,
        deletedMessages: deletion.deletedMessages,
        deletedConversation: deletion.deletedConversation,
        deletedDocument: deletion.deletedDocument,
        deletedFile: fileDeleted,
      },
      status: 1,
      message: 'Conversation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ data: null, status: 0, message: 'Failed to delete conversation' });
  }
};

export const bulkDeleteChats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const requestedIds = normalizeIds(req.body?.conversationIds);
    const deleteAll = Boolean(req.body?.deleteAll);

    let targetIds = requestedIds;
    if (deleteAll || targetIds.length === 0) {
      const allChats = await firestoreService.getUserConversations(userId);
      targetIds = allChats.map((item) => item.id);
    }

    if (!targetIds.length) {
      res.status(400).json({ data: null, status: 0, message: 'No conversations selected for deletion' });
      return;
    }

    const deletedIds: string[] = [];
    let deletedMessages = 0;
    let deletedDocuments = 0;
    let deletedFiles = 0;

    for (const conversationId of targetIds) {
      const context = await firestoreService.getConversationContext(conversationId);
      if (!context) {
        continue;
      }

      if (context.userId && context.userId !== userId) {
        continue;
      }

      const deletion = await firestoreService.deleteConversationArtifacts(conversationId);
      const fileDeleted = deleteLocalFileIfPresent(deletion.documentStorageUrl);

      deletedIds.push(conversationId);
      deletedMessages += deletion.deletedMessages;
      deletedDocuments += deletion.deletedDocument ? 1 : 0;
      deletedFiles += fileDeleted ? 1 : 0;
    }

    deleteSessionsByConversationIds(deletedIds);

    res.json({
      data: {
        requested: targetIds.length,
        deleted: deletedIds.length,
        deletedIds,
        deletedMessages,
        deletedDocuments,
        deletedFiles,
      },
      status: 1,
      message: deletedIds.length ? 'Selected conversations deleted successfully' : 'No matching conversations were deleted',
    });
  } catch (error) {
    console.error('Error bulk deleting conversations:', error);
    res.status(500).json({ data: null, status: 0, message: 'Failed to delete conversations' });
  }
};

function buildFallbackContext(history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  if (!history.length) {
    return 'No PDF text available for this resumed conversation.';
  }

  const conversationTranscript = history
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join('\n');

  return [
    'Original PDF content is unavailable. Use this prior conversation as reference context.',
    '',
    conversationTranscript,
  ].join('\n');
}

function getConversationId(req: Request): string {
  const rawConversationId = req.params.conversationId;
  return Array.isArray(rawConversationId) ? rawConversationId[0] : rawConversationId || '';
}

function getUserId(req: Request): string {
  if (req.user?.userId) {
    return req.user.userId;
  }
  throw new Error('Missing authenticated user');
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function deleteLocalFileIfPresent(storagePath: string | null): boolean {
  if (!storagePath) return false;
  try {
    const resolvedPath = path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(process.cwd(), storagePath);

    if (!fs.existsSync(resolvedPath)) {
      return false;
    }

    fs.unlinkSync(resolvedPath);
    return true;
  } catch (error) {
    console.error(`Failed to delete local file: ${storagePath}`, error);
    return false;
  }
}
