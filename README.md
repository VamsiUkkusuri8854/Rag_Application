# rag_retrivel - Papertrail PDF Chat

A small RAG (Retrieval-Augmented Generation) chat application that lets you upload a PDF and ask questions grounded in its contents. It uses Gemini embeddings (`gemini-embedding-001`) to retrieve relevant passages and Gemini Flash (`gemini-3.5-flash-lite` / `gemini-3.8-flash`) to generate accurate, cited answers from those passages.

## Requirements

- Node.js 18 or newer
- A Google Gemini API key with access to `gemini-embedding-001` and `gemini-3.5-flash-lite` (or `gemini-3.8-flash`)

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and add your **new** key:

   ```text
   GEMINI_API_KEY=your_new_key
   PORT=3000
   ```

   Never put the key in browser code or commit `.env`.

3. Start the server:

   ```sh
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Notes

- PDF uploads are held in server memory and are removed when the server restarts or when you remove the document in the UI.
- Each browser tab gets its own random chat session. This demo keeps session data in server memory and is intended for local, single-user use; add persistent storage and user authentication before deploying for multiple users.
- Uploads are limited to 10 MB and 300,000 extracted text characters. Scanned image PDFs require OCR before upload.
- The Gemini API key is used only by the server.
