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
