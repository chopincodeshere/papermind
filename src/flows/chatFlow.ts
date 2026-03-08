import { genkit, z } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Initialize Genkit with Google AI
const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model('gemini-2.0-flash'),
});

// Define input schemas with Zod for type safety
const ChatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatInput = z.object({
  message: z.string(),
  history: z.array(ChatMessage).optional(),
});

// Create chat flow
export const chatFlow = ai.defineFlow(
  {
    name: 'chat',
    inputSchema: ChatInput,
  },
  async (input) => {
    const history = input.history || [];

    history.push({ role: 'user', content: input.message });

    const prompt = history.map(msg => `${msg.role}: ${msg.content}`).join('\n') + '\nassistant:';
    const { text } = await ai.generate(prompt);

    history.push({ role: 'assistant', content: text });

    return { response: text, history };
  }
);
