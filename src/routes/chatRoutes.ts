import express from 'express';
import {
    getChats,
    getChatMessages,
    resumeChat,
} from '../controllers/chatController';
import { requireAuth } from '../middleware/auth';

const router = express.Router();
router.use(requireAuth);

// Define routes
router.get('/chats', getChats);
router.get('/chats/:conversationId/messages', getChatMessages);
router.post('/chats/:conversationId/resume', resumeChat);

export default router;
