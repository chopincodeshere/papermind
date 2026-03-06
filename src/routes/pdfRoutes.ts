import express from "express";
import multer from "multer";
import { PdfController } from "../controllers/pdfController";
import { requireAuth } from "../middleware/auth";

const router = express.Router();
const upload = multer({ dest: "uploads/" }); // Temporary storage

const pdfController = new PdfController();
router.use(requireAuth);

// PDF upload and text extraction route
router.post("/upload", upload.single("pdf"), pdfController.uploadAndExtract);
router.get("/upload-status/:uploadId", pdfController.getUploadStatus);

// Chat with PDF route
router.post("/chat", pdfController.chatWithPdf);

export default router;
