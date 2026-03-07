type PdfSession = {
  pdfPath: string;
  pdfText: string;
  userId: string;
  documentId: string;
  conversationId: string;
};

const uploadedPdfs = new Map<string, PdfSession>();

export function createPdfSession(session: PdfSession): string {
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  uploadedPdfs.set(sessionId, session);
  return sessionId;
}

export function getPdfSession(sessionId: string): PdfSession | undefined {
  return uploadedPdfs.get(sessionId);
}

export function deletePdfSession(sessionId: string): void {
  uploadedPdfs.delete(sessionId);
}

export function deleteSessionsByConversationIds(conversationIds: string[]): number {
  if (!conversationIds.length) return 0;
  const idSet = new Set(conversationIds);
  let deleted = 0;

  for (const [sessionId, session] of uploadedPdfs.entries()) {
    if (idSet.has(session.conversationId)) {
      uploadedPdfs.delete(sessionId);
      deleted += 1;
    }
  }

  return deleted;
}
