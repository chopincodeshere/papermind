import express from 'express';
import {
    getChats,
    createChat,
    getChatHistory,
    updateChatMessage,
    converse
} from '../controllers/chatController';

const router = express.Router();

// Define routes
router.get('/chats', getChats);
router.post('/chats/new', createChat);
router.get('/chats/:chatId', getChatHistory);
router.post('/chats/:chatId/update', updateChatMessage);
router.post('/chat', converse);

export default router;
