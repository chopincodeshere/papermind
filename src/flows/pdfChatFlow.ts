import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { VectorStoreService } from '../services/vectorStoreService';

// Initialize Genkit with Google AI
const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.5-flash'),
});

// Initialize vector store
const vectorStore = new VectorStoreService();

// Define input schemas with Zod for type safety
const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const PdfChatInput = z.object({
  message: z.string(),
  pdfContent: z.string(),
  history: z.array(ChatMessage).optional(),
  documentId: z.string(),
});

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  const status = (error as { status?: unknown }).status;
  const originalMessage = String((error as { originalMessage?: unknown }).originalMessage || '');
  const message = String((error as { message?: unknown }).message || '');

  return code === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    originalMessage.includes('429 Too Many Requests') ||
    originalMessage.includes('RESOURCE_EXHAUSTED') ||
    message.includes('429 Too Many Requests') ||
    message.includes('RESOURCE_EXHAUSTED');
}

function buildPrompt(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  relevantChunks: string[],
  pdfContent: string,
  usedFallbackContext: boolean
): string {
  const conversationHistory = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

  if (!usedFallbackContext && relevantChunks.length > 0) {
    const retrievalPrompt = `You are an AI assistant that helps answer questions about PDF documents.
Use the following relevant sections from the document to provide accurate and helpful responses.

RELEVANT SECTIONS:
${relevantChunks.join('\n\n')}

Answer the user's questions based on the sections above. If the answer cannot be found in these sections,
politely state that the information is not available in the relevant parts of the document.`;

    return `${retrievalPrompt}\n\n${conversationHistory}\nassistant:`;
  }

  // Keep fallback context bounded to avoid oversized prompts.
  const fallbackExcerpt = pdfContent.slice(0, 15000);
  const fallbackPrompt = `You are an AI assistant that helps answer questions about a PDF document.
The vector retrieval system is temporarily unavailable, so use the raw PDF excerpt below.

PDF EXCERPT:
${fallbackExcerpt}

Answer based on this excerpt only. If the answer is not present, say so clearly.`;

  return `${fallbackPrompt}\n\n${conversationHistory}\nassistant:`;
}

// Create PDF chat flow
export const pdfChatFlow = ai.defineFlow(
  {
    name: 'pdfChat',
    inputSchema: PdfChatInput,
  },
  async (input) => {
    const history = input.history || [];
    
    // Add the current user message to history
    history.push({ role: 'user', content: input.message });
    
    let usedFallbackContext = false;
    let retrievalFailedBecauseOfQuota = false;

    // First time seeing this document, index it.
    try {
      await vectorStore.addDocument(input.pdfContent, { documentId: input.documentId });
    } catch (error) {
      console.error('Error indexing document:', error);
      usedFallbackContext = true;
      retrievalFailedBecauseOfQuota = isQuotaError(error);
    }
    
    let relevantChunks: string[] = [];
    if (!usedFallbackContext) {
      try {
        // Retrieve relevant chunks for the query.
        relevantChunks = await vectorStore.findRelevantChunks(input.message);
      } catch (error) {
        console.error('Error retrieving relevant chunks:', error);
        usedFallbackContext = true;
        retrievalFailedBecauseOfQuota = isQuotaError(error);
      }
    }

    const fullPrompt = buildPrompt(history, relevantChunks, input.pdfContent, usedFallbackContext);
    
    // Generate response
    const { text } = await ai.generate(fullPrompt);
    const responseText = retrievalFailedBecauseOfQuota
      ? `${text}\n\n(Note: Embedding quota is currently exhausted, so this answer was generated from direct PDF text context.)`
      : text;
    
    // Add assistant response to history
    history.push({ role: 'assistant', content: responseText });
    
    return { response: responseText, history };
  }
);
