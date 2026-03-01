# AI Flow Server

A Node.js server application that leverages Google's Gemini 2.0 model through the Genkit AI framework to process text inputs.

## Features

- Text generation using Google's Gemini 2.0 model
- RESTful API endpoints for text processing
- Environment variable configuration support
- Debug-level logging

## Prerequisites

- Node.js (v14 or higher recommended)
- npm or yarn
- Google AI API credentials

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file in the root directory with your Google AI credentials:
```env
GOOGLE_API_KEY=your_api_key_here
```

## Project Structure

- `src/index.ts` - Main application entry point
- Sets up the Genkit AI framework
- Configures the Gemini 2.0 model
- Defines the main text processing flow
- Starts the flow server

## Usage

1. Start the server:
```bash
npx genkit start -o -- npx tsx watch src/index.ts
```

The server will start and provide access to:
- Flow server on port 8080
- Genkit Developer UI on http://localhost:4000
- APIs on http://localhost:3000
- UI endpoint is on http://localhost:3000/pdf-chat

2. Send requests to the server:
```bash
curl -X POST http://localhost:8080/flows/mainFlow \
  -H "Content-Type: application/json" \
  -d '{"input": "Your text here"}'
```

## API Reference

### Chat Management

#### GET /chats

Retrieves a list of all chat conversations.

**Response:**
```json
{
  "data": [{
    "id": "string",
    "history": [{
      "role": "user" | "assistant",
      "content": "string"
    }]
  }],
  "status": 1,
  "message": "success"
}
```

#### POST /chats/new

Creates a new chat conversation with optional initial messages.

**Request Body:**
```json
{
  "history": [{
    "role": "user" | "assistant",
    "content": "string"
  }]
}
```

**Response:**
```json
{
  "data": "chat_id",
  "status": 1,
  "message": "success"
}
```

#### GET /chats/:chatId

Retrieves the chat history for a specific conversation.

**Path Parameters:**
- `chatId`: string - The ID of the chat conversation

**Response:**
```json
{
  "data": {
    "id": "string",
    "history": [{
      "role": "user" | "assistant",
      "content": "string"
    }]
  },
  "status": 1,
  "message": "success"
}
```

#### POST /chats/:chatId/update

Updates a chat conversation by adding new messages.

**Path Parameters:**
- `chatId`: string - The ID of the chat conversation

**Request Body:**
```json
{
  "message": "string"
}
```

**Response:**
```json
{
  "data": "assistant_response",
  "status": 1,
  "message": "Chat updated successfully"
}
```

### PDF Processing

#### POST /pdf/upload

Uploads a PDF file and processes it with Gemini 2.0.

**Request Body:**
```json
{
  "pdf": [file],
  "history": [{
    "role": "user" | "assistant",
    "content": "string"
  }]
}
```

**Response:**
```json
{
  "result": {
    "response": "assistant_response"
  },
  "textContent": "extracted_pdf_text"
}
```

#### POST /pdf/chat

Chat with Gemini 2.0 using previously extracted PDF content.

**Request Body:**
```json
{
  "message": "string",
  "history": [{
    "role": "user" | "assistant",
    "content": "string"
  }],
  "pdfContent": "extracted_pdf_text"
}
```

**Response:**
```json
{
  "result": {
    "response": "assistant_response"
  }
}
```

### Chat Processing

#### POST /chat

Processes a chat message using the Gemini 2.0 model.

**Request Body:**
```json
{
  "message": "string",
  "history": [{
    "role": "user" | "assistant",
    "content": "string"
  }]
}
```

**Response:**
```json
{
  "result": {
    "response": "assistant_response"
  }
}
```

### POST /flows/mainFlow

Processes text input using the Gemini 2.0 model.

**Request Body:**
```json
{
  "input": "string"
}
```

**Response:**
```json
{
  "text": "Generated response"
}
```

## Usage with Postman

1. **Upload PDF and Get Initial Response**
   - Endpoint: `POST /pdf/upload`
   - Method: POST
   - Headers:
     ```json
     {
       "Content-Type": "multipart/form-data"
     }
     ```
   - Body: form-data
     - Key: `pdf` (file)
     - Key: `history` (raw JSON)
   - Example:
     ```json
     {
       "history": []
     }
     ```

2. **Chat with PDF Content**
   - Endpoint: `POST /pdf/chat`
   - Method: POST
   - Headers:
     ```json
     {
       "Content-Type": "application/json"
     }
     ```
   - Body:
     ```json
     {
       "message": "Your question about the PDF",
       "history": [],
       "pdfContent": "Extracted text from PDF"
     }
     ```

## Dependencies

- `genkit` - AI framework for building flows
- `@genkit-ai/googleai` - Google AI integration
- `dotenv` - Environment configuration
- `@genkit-ai/express` - Express server integration

## Development

The project uses TypeScript for type safety. The main flow is defined in `src/index.ts` and can be extended with additional flows as needed.

## Troubleshooting

Common issues and their solutions:

1. **API Key Issues**
   - Ensure your Google API key is correctly set in the `.env` file
   - Verify the API key has necessary permissions enabled

2. **Server Connection Issues**
   - Check if all required ports (3000, 4000, 8080) are available
   - Ensure no other services are using these ports

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support, please open an issue in the GitHub repository.

## License

MIT License

## Last Updated

2025-03-29
