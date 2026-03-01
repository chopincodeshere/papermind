import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import chatRoutes from './routes/chatRoutes';
import pdfRoutes from './routes/pdfRoutes';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json()); // Express has built-in JSON parser

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Routes
app.use('/', chatRoutes);
app.use('/pdf', pdfRoutes);

// Serve the PDF chat page
app.get('/pdf-chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/pdf-chat.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
