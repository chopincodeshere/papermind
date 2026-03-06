import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import chatRoutes from './routes/chatRoutes';
import pdfRoutes from './routes/pdfRoutes';
import authRoutes from './routes/authRoutes';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json()); // Express has built-in JSON parser

const publicDir = path.join(__dirname, '../public');
const frontendDistDir = path.join(__dirname, '../frontend/dist');

// Serve React build (if present), otherwise serve legacy public assets.
if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
}
app.use(express.static(publicDir));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use('/auth', authRoutes);
app.use('/', chatRoutes);
app.use('/pdf', pdfRoutes);

// Serve the PDF chat page
app.get('/pdf-chat', (req, res) => {
  if (fs.existsSync(path.join(frontendDistDir, 'index.html'))) {
    res.sendFile(path.join(frontendDistDir, 'index.html'));
    return;
  }

  res.sendFile(path.join(publicDir, 'pdf-chat.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
