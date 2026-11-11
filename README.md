# RAG Application - Interactive 16-Stage Pipeline Dashboard & Document Chat

An end-to-end Retrieval-Augmented Generation (RAG) system and interactive architecture visualizer built with Flask, LangChain, ChromaDB, and Google Gemini AI.

## Features

- **16-Stage Interactive RAG Pipeline Dashboard**: Visualizes every single step of the RAG lifecycle (PDF Upload, Validation, Parsing, Extraction, Preprocessing, Chunking, Embeddings, ChromaDB Storage, User Query, Query Embedding, Similarity Search, Relevant Retrieval, Context Preparation, Prompt Construction, Gemini LLM Processing, and Final Answer Generation).
- **Deep Inspection**: View actual page-wise extracted text, all chunks with character metrics, 3,072-dimensional embedding vectors, cosine/L2 distance scores, prompt templates, and execution latency.
- **Conversational Document Chat**: Switch seamlessly to chat mode with source citations, page-level references, and formatted Markdown rendering.
- **Smart Chunking**: RecursiveCharacterTextSplitter with configurable chunk size (1000) and overlap (200).
- **Persistent Vector Store**: ChromaDB integration with HNSW indexing and metadata filtering.
- **Google Gemini Integration**: Google Generative AI (`gemini-3.5-flash-lite`, `gemini-embedding-001`).

## Project Structure

```text
├── app.py                 # Flask web server and pipeline inspection APIs
├── requirements.txt       # Python dependencies
├── .env.example           # Template for environment variables
├── src/
│   ├── __init__.py
│   └── rag_pipeline.py    # Complete 16-stage RAG pipeline engine
├── static/
│   ├── script.js          # Interactive dashboard controller & chat handler
│   └── style.css          # Dark sidebar & modern clean dashboard theme
├── templates/
│   └── index.html         # Responsive 3-section dashboard & chat interface
└── test_gemini.py         # Gemini API connectivity test script
```

## Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/VamsiUkkusuri8854/Rag_Application.git
cd Rag_Application
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

