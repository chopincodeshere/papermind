import { devLocalVectorstore, devLocalIndexerRef, devLocalRetrieverRef } from '@genkit-ai/dev-local-vectorstore';
import { genkit, z, Document } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';
import { chunk } from 'llm-chunk';

const INDEX_NAME = 'pdf-chat-gemini-embedding-001-v1';

// Initialize Genkit with Google AI and vector store
const ai = genkit({
  plugins: [
    googleAI(),
    devLocalVectorstore([{
      indexName: INDEX_NAME,
      embedder: googleAI.embedder('gemini-embedding-001'),
    }])
  ],
  model: googleAI.model('gemini-2.5-flash'),
});

// Get references to the vector store
const indexer = devLocalIndexerRef(INDEX_NAME);
const retriever = devLocalRetrieverRef(INDEX_NAME);

interface VectorItem {
  text: string;
  vector: number[];
  metadata: Record<string, any>;
}

interface VectorSearchResult {
  text: string;
  vector: number[];
  metadata: Record<string, any>;
  score: number;
}

export class VectorStoreService {
  private activeDocumentId: string | null = null;
  private indexedDocumentIds = new Set<string>();

  async addDocument(text: string, metadata: Record<string, any> = {}) {
    const documentId = typeof metadata.documentId === 'string' ? metadata.documentId : null;

    // Keep only one document indexed per session to avoid mixed vectors across uploads.
    if (documentId && this.activeDocumentId && this.activeDocumentId !== documentId) {
      await this.clear();
      this.indexedDocumentIds.clear();
    }

    if (documentId && this.indexedDocumentIds.has(documentId)) {
      return;
    }

    // Split text into chunks
    const chunks = chunk(text);
    
    // Create documents from chunks
    const documents = chunks.map(chunk => Document.fromText(chunk, metadata));

    // Add documents to the index
    await ai.index({
      indexer,
      documents
    });

    if (documentId) {
      this.activeDocumentId = documentId;
      this.indexedDocumentIds.add(documentId);
    }
  }

  async findRelevantChunks(query: string, limit: number = 3): Promise<string[]> {
    // Retrieve relevant documents
    const docs = await ai.retrieve({
      retriever,
      query,
      options: { k: limit }
    });

    // Return the text of the chunks
    return docs.map(doc => doc.text);
  }

  async clear() {
    // No direct clear method in the API, but we can overwrite with empty array
    await ai.index({
      indexer,
      documents: []
    });
  }
}
