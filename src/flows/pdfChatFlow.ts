import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { VectorStoreService } from '../services/vectorStoreService';

// Initialize Genkit with Google AI
const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.0-flash'),
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
  const context = (!usedFallbackContext && relevantChunks.length > 0)
    ? relevantChunks.join('\n\n')
    : pdfContent.slice(0, 15000);

  const prompt = `Use the provided context to answer the question. If the context is insufficient, say you do not have enough information.

You are an intelligent academic assistant designed to help students understand their homework.

Your goals:

1. Help the student **understand the concept**, not just give the answer.
2. Break explanations into **clear, simple steps**.
3. Use examples when helpful.
4. If the question relates to an uploaded document, **base your answer strictly on the document**.
5. If the answer is not found in the document, clearly say so and then provide a **general explanation from your knowledge**.

Response rules:

* Start with a **short direct answer** if possible.
* Then provide a **step-by-step explanation**.
* Use bullet points or numbered steps when explaining.
* If it is a math or logical problem, show the **working process**.
* If the student seems confused, give a **simpler explanation afterward**.
* Never fabricate information from the document.

Tone:

* Friendly
* Clear
* Encouraging
* Suitable for middle school to college students.

Output format:

Answer: <short answer>

Explanation: <step by step explanation>

Example (if helpful): <example>

Key idea:
<core concept summarized in 1-2 sentences>

Context:
${context}`;

  return `${prompt}\n\n${conversationHistory}\nassistant:`;
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
