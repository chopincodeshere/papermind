import { Request, Response } from 'express';
import fs from 'fs';
import ChatFirestoreService from '../services/firebase';
import { PdfService } from '../services/pdfService';
import { createPdfSession } from '../services/pdfSessionStore';

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
