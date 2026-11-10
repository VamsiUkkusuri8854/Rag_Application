# RAG Retrieval - PDF Chat with Google Gemini & ChromaDB

An end-to-end Retrieval-Augmented Generation (RAG) system built with Flask, LangChain, ChromaDB, and Google Gemini models. Upload PDF documents and ask questions grounded in their content with semantic search, relevant context chunking, and generative AI responses.

## Features

- **Document Processing**: Upload PDFs (up to 20 MB) with automatic text extraction using PyPDF.
- **Smart Chunking**: Text splitting using LangChain's `RecursiveCharacterTextSplitter`.
- **Vector Search**: Embeddings stored and queried via ChromaDB with persistence.
- **Gemini Powered**: Generates high-accuracy answers grounded strictly in retrieved context using Google Gemini models (`gemini-3.5-flash-lite`, `gemini-embedding-001`).
- **Interactive UI**: Clean, modern web frontend with real-time feedback, upload status, and chat interface.

## Project Structure

```text
├── app.py                 # Flask server and API endpoints (/upload, /ask)
├── requirements.txt       # Python dependencies
├── .env.example           # Template for environment variables
├── src/
│   ├── __init__.py
│   └── rag_pipeline.py    # Document loading, chunking, embeddings, ChromaDB & Gemini pipeline
├── static/
│   ├── script.js          # Client-side chat and file upload logic
│   └── style.css          # UI styling
├── templates/
│   └── index.html         # Web chat interface
└── test_gemini.py         # Gemini API connectivity test script
```

## Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/VamsiUkkusuri8854/rag_retrivel.git
cd rag_retrivel
```

### 2. Create and activate a virtual environment
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and provide your Google Gemini API key:
```env
GOOGLE_API_KEY=your_gemini_api_key_here
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
```

### 5. Run the Application
```bash
python app.py
```
Open your browser and navigate to `http://localhost:5000`.

## Testing Gemini Connection
You can verify your Gemini API key and model connectivity using:
```bash
python test_gemini.py
```

