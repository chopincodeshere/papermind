import express from 'express';
import {
    getChats,
    getChatMessages,
    resumeChat,
    deleteChat,
    bulkDeleteChats,
} from '../controllers/chatController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();
router.use(requireAuth);

// Define routes
router.get('/chats', getChats);
router.delete('/chats', bulkDeleteChats);
router.get('/chats/:conversationId/messages', getChatMessages);
router.post('/chats/:conversationId/resume', resumeChat);
router.delete('/chats/:conversationId', deleteChat);

export default router;
