import { Request, Response } from 'express';
import ChatFirestoreService from '../services/firebase';
import { ChatMessage } from '../services/firebase';
import { chatFlow } from '../flows/chatFlow'; // Extracted chat flow logic

const chatService = ChatFirestoreService.getInstance();

export const getChats = async (req: Request, res: Response) => {
  try {
    const result = await chatService.getChatDocuments();
    res.json(result);
  } catch (error) {
    console.error('Error fetching chat documents:', error);
    res.status(500).json({ data: [], status: 0, message: 'Internal server error' });
  }
};

export const createChat = async (req: Request, res: Response) => {
  try {
    const { history = [] } = req.body;
    const result = await chatService.createChat(history);
    res.json(result);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ data: '', status: 0, message: 'Failed to create chat' });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const result = await chatService.getChatHistory(chatId);
    res.json(result);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ data: null, status: 0, message: 'Internal server error' });
  }
};

export const updateChatMessage = async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { message } = req.body;

    const newMessages = { role: "user" as "user" | "assistant", content: message };
    await chatService.addSingleMessage(chatId, newMessages);

    const chatHistory = await chatService.getChatHistory(chatId);
    const data = { message, history: chatHistory.data?.history || [] };

    const chatResult = await chatFlow.run(data);
    const newMessagesFromAssistant = { role: "user" as "user" | "assistant", content: chatResult.result.response };

    await chatService.addSingleMessage(chatId, newMessagesFromAssistant);

    res.json({ data: chatResult.result.response, status: 1, message: 'Chat updated successfully' });
  } catch (error) {
    console.error('Error updating chat message:', error);
    res.status(500).json({ data: null, status: 0, message: 'Internal server error' });
  }
};

export const converse = async (req: Request, res: Response) => {
  try {
    const { message, history } = req.body;
    const result = await chatFlow.run({ message, history });

    res.json(result);
  } catch (error) {
    console.error('Error processing chat request:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'An unknown error occurred' });
  }
};
