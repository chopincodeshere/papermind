import admin from 'firebase-admin';
import { Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UserRecordInput {
  userId: string;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
}

interface DocumentRecordInput {
  title: string;
  fileName: string;
  storageUrl: string;
  pageCount?: number | null;
  userId: string;
}

interface ConversationRecordInput {
  title: string;
  userId: string;
  documentId: string;
}

interface MessageRecordInput {
  conversationId: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
}

interface UserConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  documentId: string | null;
  documentTitle: string | null;
  fileName: string | null;
}

interface ConversationMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
}

interface ConversationContext {
  conversationId: string;
  userId: string | null;
  documentId: string | null;
  documentStorageUrl: string | null;
}

interface AuthUserRecord {
  id: string;
  identifier: string;
  identifierLower: string;
  passwordHash: string;
  userType: string;
  rateLimit: number | null;
  promptsUsed: number;
}

class ChatFirestoreService {
  private static instance: ChatFirestoreService;
  private db!: Firestore;

  private constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    if (admin.apps.length > 0) {
      this.db = getFirestore();
      return;
    }

    const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'src/config/firebase.json';
    const serviceAccountPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);

    try {
      if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Firebase service account file not found: ${serviceAccountPath}`);
      }

      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log("Project from key:", serviceAccount.project_id);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.db = getFirestore();
      console.log('Firebase initialized successfully');
      this.ensureCollectionsInitialized();
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }
  }

  private ensureCollectionsInitialized(): void {
    const collections = ['users', 'documents', 'conversations', 'messages', 'chats'];
    const now = Timestamp.now();

    Promise.all(
      collections.map((collectionName) =>
        this.db.collection(collectionName).doc('_meta').set(
          {
            _system: true,
            initializedAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
      )
    )
      .then(() => {
        console.log(`[Firestore] Core collections initialized: ${collections.join(', ')}`);
      })
      .catch((error) => {
        console.error('[Firestore] Failed to initialize core collections:', error);
      });
  }

  public static getInstance(): ChatFirestoreService {
    if (!ChatFirestoreService.instance) {
      ChatFirestoreService.instance = new ChatFirestoreService();
    }
    return ChatFirestoreService.instance;
  }

  public async createChat(initialMessages: ChatMessage[] = []): Promise<{ data: string; status: number; message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc();
      await chatRef.set({ history: JSON.stringify(initialMessages) });
      return { data: chatRef.id, status: 1, message: 'Chat created successfully' };
    } catch (error) {
      console.error('Error creating chat:', error);
      return { data: '', status: 0, message: 'Failed to create chat' };
    }
  }

  public async getChatDocuments(): Promise<{ data: { id: string; history: ChatMessage[] }[]; status: number; message: string }> {
    try {
      const chatDocs = await this.db.collection('chats').get();
      const data = chatDocs.docs
        .map((doc) => {
          const docData = doc.data();
          if (!docData) return null;

          try {
            const history = JSON.parse(docData.history || '[]') as ChatMessage[];
            return { id: doc.id, history };
          } catch {
            return null;
          }
        })
        .filter((item): item is { id: string; history: ChatMessage[] } => item !== null);

      return { data, status: 1, message: 'Chats fetched successfully' };
    } catch (error) {
      console.error('Error fetching chat documents:', error);
      return { data: [], status: 0, message: 'Failed to fetch chat documents' };
    }
  }

  public async getChatHistory(chatId: string): Promise<{ data: { id: string; history: ChatMessage[] } | null; status: number; message: string }> {
    try {
      const chatDoc = await this.db.collection('chats').doc(chatId).get();
      if (!chatDoc.exists) {
        return { data: null, status: 0, message: 'Chat document not found' };
      }

      const data = chatDoc.data();
      if (!data) {
        return { data: null, status: 0, message: 'Chat data not found' };
      }

      return {
        data: { id: chatDoc.id, history: JSON.parse(data.history || '[]') },
        status: 1,
        message: 'Chat history fetched successfully',
      };
    } catch (error) {
      console.error('Error getting chat history:', error);
      return { data: null, status: 0, message: 'Failed to fetch chat history' };
    }
  }

  public async addChatHistory(chatId: string, newMessages: ChatMessage[]): Promise<void> {
    const chatRef = this.db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
      throw new Error('Chat document not found');
    }

    const data = chatDoc.data();
    if (!data) {
      throw new Error('Chat data not found');
    }

    const existingHistory = JSON.parse(data.history || '[]');
    const updatedHistory = [...existingHistory, ...newMessages];
    await chatRef.update({ history: JSON.stringify(updatedHistory) });
  }

  public async addSingleMessage(chatId: string, message: ChatMessage): Promise<{ data: string; status: number; message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        return { data: chatId, status: 0, message: 'Chat document not found' };
      }

      const data = chatDoc.data();
      if (!data) {
        return { data: chatId, status: 0, message: 'Chat data not found' };
      }

      const existingHistory = JSON.parse(data.history || '[]');
      const updatedHistory = [...existingHistory, message];
      await chatRef.update({ history: JSON.stringify(updatedHistory) });
      return { data: chatId, status: 1, message: 'Message added successfully' };
    } catch (error) {
      console.error('Error adding chat message:', error);
      return { data: chatId, status: 0, message: 'Failed to add message' };
    }
  }

  public async updateSingleMessage(chatId: string, messageId: number, updatedMessage: ChatMessage): Promise<{ data: string; status: number; message: string }> {
    try {
      const chatRef = this.db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();

      if (!chatDoc.exists) {
        return { data: chatId, status: 0, message: 'Chat document not found' };
      }

      const data = chatDoc.data();
      if (!data) {
        return { data: chatId, status: 0, message: 'Chat data not found' };
      }

      const existingHistory = JSON.parse(data.history || '[]');
      if (messageId >= existingHistory.length) {
        return { data: chatId, status: 0, message: 'Message not found' };
      }

      existingHistory[messageId] = updatedMessage;
      await chatRef.update({ history: JSON.stringify(existingHistory) });
      return { data: chatId, status: 1, message: 'Message updated successfully' };
    } catch (error) {
      console.error('Error updating chat message:', error);
      return { data: chatId, status: 0, message: 'Failed to update message' };
    }
  }

  public async upsertUser(input: UserRecordInput): Promise<string> {
    const userRef = this.db.collection('users').doc(input.userId);
    const now = Timestamp.now();
    const existing = await userRef.get();

    await userRef.set(
      {
        name: input.name,
        email: input.email || null,
        photoUrl: input.photoUrl || null,
        createdAt: existing.exists ? existing.data()?.createdAt || now : now,
      },
      { merge: true }
    );

    return userRef.id;
  }

  public async createDocumentRecord(input: DocumentRecordInput): Promise<string> {
    const docRef = this.db.collection('documents').doc();
    const userRef = this.db.collection('users').doc(input.userId);

    await docRef.set({
      title: input.title,
      fileName: input.fileName,
      storageUrl: input.storageUrl,
      uploadDate: Timestamp.now(),
      pageCount: input.pageCount ?? null,
      user: userRef,
    });

    return docRef.id;
  }

  public async createConversationRecord(input: ConversationRecordInput): Promise<string> {
    const conversationRef = this.db.collection('conversations').doc();
    const userRef = this.db.collection('users').doc(input.userId);
    const documentRef = this.db.collection('documents').doc(input.documentId);

    await conversationRef.set({
      createdAt: Timestamp.now(),
      title: input.title,
      user: userRef,
      document: documentRef,
    });

    return conversationRef.id;
  }

  public async addMessageRecord(input: MessageRecordInput): Promise<string> {
    const messageRef = this.db.collection('messages').doc();
    const conversationRef = this.db.collection('conversations').doc(input.conversationId);

    await messageRef.set({
      sender: input.sender,
      content: input.content,
      timestamp: Timestamp.now(),
      conversation: conversationRef,
    });

    return messageRef.id;
  }

  public async getUserConversations(userId: string): Promise<UserConversationSummary[]> {
    const userRef = this.db.collection('users').doc(userId);
    const snapshot = await this.db
      .collection('conversations')
      .where('user', '==', userRef)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const summaries = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const createdAtRaw = data.createdAt as Timestamp | undefined;
        const createdAt = createdAtRaw ? createdAtRaw.toDate().toISOString() : new Date(0).toISOString();

        let documentId: string | null = null;
        let documentTitle: string | null = null;
        let fileName: string | null = null;

        const documentRef = data.document;
        if (documentRef) {
          try {
            const documentDoc = await documentRef.get();
            if (documentDoc.exists) {
              const documentData = documentDoc.data();
              documentId = documentDoc.id;
              documentTitle = documentData?.title || null;
              fileName = documentData?.fileName || null;
            }
          } catch {
            documentId = null;
          }
        }

        return {
          id: doc.id,
          title: data.title || 'Untitled Conversation',
          createdAt,
          documentId,
          documentTitle,
          fileName,
        };
      })
    );

    return summaries;
  }

  public async getConversationMessages(conversationId: string): Promise<ConversationMessage[]> {
    const conversationRef = this.db.collection('conversations').doc(conversationId);
    const snapshot = await this.db
      .collection('messages')
      .where('conversation', '==', conversationRef)
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const timestampRaw = data.timestamp as Timestamp | undefined;
      return {
        id: doc.id,
        sender: data.sender || 'assistant',
        content: data.content || '',
        timestamp: timestampRaw ? timestampRaw.toDate().toISOString() : new Date(0).toISOString(),
      };
    });
  }

  public async getConversationContext(conversationId: string): Promise<ConversationContext | null> {
    const conversationDoc = await this.db.collection('conversations').doc(conversationId).get();
    if (!conversationDoc.exists) {
      return null;
    }

    const conversationData = conversationDoc.data();
    if (!conversationData) {
      return null;
    }

    let userId: string | null = null;
    let documentId: string | null = null;
    let documentStorageUrl: string | null = null;

    const userRef = conversationData.user;
    if (userRef?.id) {
      userId = userRef.id;
    }

    const documentRef = conversationData.document;
    if (documentRef?.id) {
      documentId = documentRef.id;
      try {
        const documentDoc = await documentRef.get();
        if (documentDoc.exists) {
          documentStorageUrl = documentDoc.data()?.storageUrl || null;
        }
      } catch {
        documentStorageUrl = null;
      }
    }

    return {
      conversationId,
      userId,
      documentId,
      documentStorageUrl,
    };
  }

  public async createAuthUser(identifier: string, passwordHash: string): Promise<{ ok: boolean; userId?: string; message?: string }> {
    try {
      const identifierLower = identifier.trim().toLowerCase();
      if (!identifierLower) {
        return { ok: false, message: 'Identifier is required.' };
      }

      const existing = await this.db
        .collection('users')
        .where('identifierLower', '==', identifierLower)
        .limit(1)
        .get();

      if (!existing.empty) {
        console.warn(`[AUTH] createAuthUser conflict for identifier=${identifierLower}`);
        return { ok: false, message: 'An account with this username/email already exists.' };
      }

      const userRef = this.db.collection('users').doc();
      const now = Timestamp.now();
      await userRef.set({
        identifier: identifier.trim(),
        identifierLower,
        passwordHash,
        name: identifier.trim(),
        user_type: 'demo',
        rate_limit: 5,
        prompts_used: 0,
        createdAt: now,
      });

      return { ok: true, userId: userRef.id };
    } catch (error) {
      console.error('[AUTH] createAuthUser error:', error);
      return { ok: false, message: 'Unable to create account right now.' };
    }
  }

  public async findAuthUserByIdentifier(identifier: string): Promise<AuthUserRecord | null> {
    try {
      const identifierLower = identifier.trim().toLowerCase();
      if (!identifierLower) {
        return null;
      }

      const snapshot = await this.db
        .collection('users')
        .where('identifierLower', '==', identifierLower)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      if (!data?.passwordHash || !data?.identifier || !data?.identifierLower) {
        console.warn(`[AUTH] findAuthUserByIdentifier malformed auth record for user=${doc.id}`);
        return null;
      }

      return {
        id: doc.id,
        identifier: String(data.identifier),
        identifierLower: String(data.identifierLower),
        passwordHash: String(data.passwordHash),
        userType: String(data.user_type || 'demo'),
        rateLimit: typeof data.rate_limit === 'number' ? data.rate_limit : null,
        promptsUsed: typeof data.prompts_used === 'number' ? data.prompts_used : 0,
      };
    } catch (error) {
      console.error('[AUTH] findAuthUserByIdentifier error:', error);
      return null;
    }
  }

  public async getAuthUserById(userId: string): Promise<{ id: string; identifier: string } | null> {
    const doc = await this.db.collection('users').doc(userId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    if (!data?.identifier) {
      return null;
    }

    return { id: doc.id, identifier: String(data.identifier) };
  }

  public async consumePromptQuota(userId: string): Promise<{ ok: boolean; remaining: number; message?: string }> {
    try {
      const userRef = this.db.collection('users').doc(userId);
      const result = await this.db.runTransaction(async (tx) => {
        const doc = await tx.get(userRef);
        if (!doc.exists) {
          return { ok: false, remaining: 0, message: 'User not found' };
        }

        const data = doc.data() || {};
        const userType = String(data.user_type || 'demo');
        const rateLimit = typeof data.rate_limit === 'number' ? data.rate_limit : (userType === 'demo' ? 5 : null);
        const promptsUsed = typeof data.prompts_used === 'number' ? data.prompts_used : 0;

        if (rateLimit !== null && promptsUsed >= rateLimit) {
          return { ok: false, remaining: 0, message: `Prompt limit reached (${rateLimit}) for this account.` };
        }

        const nextPromptsUsed = promptsUsed + 1;
        tx.set(
          userRef,
          {
            user_type: userType,
            rate_limit: rateLimit,
            prompts_used: nextPromptsUsed,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        const remaining = rateLimit === null ? Number.MAX_SAFE_INTEGER : Math.max(rateLimit - nextPromptsUsed, 0);
        return { ok: true, remaining };
      });

      return result;
    } catch (error) {
      console.error('[AUTH] consumePromptQuota error:', error);
      return { ok: false, remaining: 0, message: 'Unable to validate prompt quota right now.' };
    }
  }
}

export { ChatMessage };
export default ChatFirestoreService;
