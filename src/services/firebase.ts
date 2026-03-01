import admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Define interface for chat message
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

class ChatFirestoreService {
  private static instance: ChatFirestoreService;
  // Use definite assignment assertion
  private db!: Firestore;

  private constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    const serviceAccountPath = path.resolve(process.cwd(), 'src\\config', 'firebase.json');
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
      });

      this.db = getFirestore();
      console.log('Firebase initialized successfully');
      
      // Ensure chats collection exists (though Firestore creates it automatically)
      this.db.collection('chats').doc();
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }
  }

  // Singleton method
  public static getInstance(): ChatFirestoreService {
    if (!ChatFirestoreService.instance) {
      ChatFirestoreService.instance = new ChatFirestoreService();
    }
    return ChatFirestoreService.instance;
  }

  // Create a new chat document
  public async createChat(initialMessages: ChatMessage[] = []): Promise<{ data: string, status: number, message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc();
      
      await chatRef.set({
        history: JSON.stringify(initialMessages)
      });

      return {
        data: chatRef.id,
        status: 1,
        message: 'Chat created successfully'
      };
    } catch (error) {
      console.error('Error creating chat:', error);
      return {
        data: '',
        status: 0,
        message: 'Failed to create chat'
      };
    }
  }

  // Get all chat documents
  public async getChatDocuments(): Promise<{ data: { id: string, history: ChatMessage[] }[], status: number, message: string }> {
    try {
      const chatDocs = await this.db.collection('chats').get();
      const data = chatDocs.docs.map(doc => {
        const docData = doc.data();
        if (!docData) {
          return null;
        }
        try {
          const history = JSON.parse(docData.history || '[]') as ChatMessage[];
          return {
            id: doc.id,
            history
          };
        } catch {
          return null;
        }
      }).filter((item): item is { id: string, history: ChatMessage[] } => item !== null);

      return {
        data,
        status: 1,
        message: 'Chats fetched successfully'
      };
    } catch (error) {
      console.error('Error fetching chat documents:', error);
      return {
        data: [],
        status: 0,
        message: 'Failed to fetch chat documents'
      };
    }
  }

  // Get chat history for a specific document
  public async getChatHistory(chatId: string): Promise<{ data: { id: string, history: ChatMessage[] } | null, status: number, message: string }> {
    try {
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        return {
          data: null,
          status: 0,
          message: 'Chat document not found'
        };
      }
      const data = chatDoc.data();
      if (!data) {
        return {
          data: null,
          status: 0,
          message: 'Chat data not found'
        };
      }
      return {
        data: {
          id: chatDoc.id,
          history: JSON.parse(data.history || '[]')
        },
        status: 1,
        message: 'Chat history fetched successfully'
      };
    } catch (error) {
      console.error('Error getting chat history:', error);
      return {
        data: null,
        status: 0,
        message: 'Failed to fetch chat history'
      };
    }
  }

  // Add new chat history to a document
  public async addChatHistory(chatId: string, newMessages: ChatMessage[]): Promise<void> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        throw new Error('Chat document not found');
      }

      const data = chatDoc.data();
      if (!data) {
        throw new Error('Chat data not found');
      }

      // Parse existing history and append new messages
      const existingHistory = JSON.parse(data.history || '[]');
      const updatedHistory = [...existingHistory, ...newMessages];

      // Update the document with new history
      await chatRef.update({
        history: JSON.stringify(updatedHistory)
      });

      console.log('Chat history updated successfully');
    } catch (error) {
      console.error('Error adding chat history:', error);
      throw error;
    }
  }

  // Add single message to chat history
  public async addSingleMessage(chatId: string, message: ChatMessage): Promise<{ data: string, status: number, message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        return {
          data: chatId,
          status: 0,
          message: 'Chat document not found'
        };
      }

      const data = chatDoc.data();
      if (!data) {
        return {
          data: chatId,
          status: 0,
          message: 'Chat data not found'
        };
      }

      // Parse existing history and append new message
      const existingHistory = JSON.parse(data.history || '[]');
      const updatedHistory = [...existingHistory, message];

      // Update the document with new history
      await chatRef.update({
        history: JSON.stringify(updatedHistory)
      });

      return {
        data: chatId,
        status: 1,
        message: 'Message added successfully'
      };
    } catch (error) {
      console.error('Error adding chat message:', error);
      return {
        data: chatId,
        status: 0,
        message: 'Failed to add message'
      };
    }
  }

  // Update single message in chat history
  public async updateSingleMessage(chatId: string, messageId: number, updatedMessage: ChatMessage): Promise<{ data: string, status: number, message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        return {
          data: chatId,
          status: 0,
          message: 'Chat document not found'
        };
      }

      const data = chatDoc.data();
      if (!data) {
        return {
          data: chatId,
          status: 0,
          message: 'Chat data not found'
        };
      }

      // Parse existing history
      const existingHistory = JSON.parse(data.history || '[]');

      // Check if message exists
      if (messageId >= existingHistory.length) {
        return {
          data: chatId,
          status: 0,
          message: 'Message not found'
        };
      }

      // Update the message
      existingHistory[messageId] = updatedMessage;

      // Update the document with new history
      await chatRef.update({
        history: JSON.stringify(existingHistory)
      });

      return {
        data: chatId,
        status: 1,
        message: 'Message updated successfully'
      };
    } catch (error) {
      console.error('Error updating chat message:', error);
      return {
        data: chatId,
        status: 0,
        message: 'Failed to update message'
      };
    }
  }
}

export { ChatMessage };
export default ChatFirestoreService;