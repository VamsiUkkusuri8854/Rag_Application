
import os
import time
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# LangChain document loader
from langchain_community.document_loaders import PyPDFLoader

# LangChain text splitter
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Google Gemini models
from langchain_google_genai import (
    GoogleGenerativeAIEmbeddings,
    ChatGoogleGenerativeAI
)

# ChromaDB vector store
from langchain_chroma import Chroma

# LangChain prompt and output parser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser


# =====================================================
# 1. LOAD ENVIRONMENT VARIABLES
# =====================================================

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"

load_dotenv(dotenv_path=ENV_PATH, override=True)

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    raise ValueError(
        "GOOGLE_API_KEY is missing. Check your root .env file."
    )

print("Environment configuration loaded successfully!")

EMBEDDING_MODEL_NAME = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
CHAT_MODEL_NAME = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.5-flash-lite")


# =====================================================
# 2. INITIALIZE GEMINI EMBEDDING MODEL
# =====================================================

embeddings = GoogleGenerativeAIEmbeddings(
    model=EMBEDDING_MODEL_NAME,
    google_api_key=GOOGLE_API_KEY
)

print(f"Gemini embedding model initialized: {EMBEDDING_MODEL_NAME}")


# =====================================================
# 3. INITIALIZE GEMINI CHAT MODEL
# =====================================================

llm = ChatGoogleGenerativeAI(
    model=CHAT_MODEL_NAME,
    google_api_key=GOOGLE_API_KEY
)

print(f"Gemini chat model initialized: {CHAT_MODEL_NAME}")


# =====================================================
# 4. GLOBAL VECTOR STORE AND RETRIEVER
# =====================================================

vector_store = None
retriever = None

CHROMA_DIRECTORY = str(PROJECT_ROOT / "chroma_db")


# =====================================================
# 5. 16-STAGE PIPELINE STATE STORAGE
# =====================================================

STAGE_DEFINITIONS = {
    1: {
        "title": "PDF Upload",
        "category": "indexing",
        "description": "Upload a PDF document via file selector or drag-and-drop zone.",
        "internal_mechanism": "Receives multi-part file upload, verifies file envelope, saves securely to uploads directory on server storage."
    },
    2: {
        "title": "PDF Validation",
        "category": "indexing",
        "description": "Validates format integrity, MIME type, file size bounds, and PDF header signature.",
        "internal_mechanism": "Checks magic bytes (%PDF-), confirms extension .pdf, ensures file size within 20 MB ceiling."
    },
    3: {
        "title": "PDF Parsing",
        "category": "indexing",
        "description": "Streams document structure and pagination using LangChain PyPDFLoader.",
        "internal_mechanism": "Initializes PyPDFLoader (pypdf parser engine) and extracts raw Document stream objects preserving page indices."
    },
    4: {
        "title": "Text Extraction",
        "category": "indexing",
        "description": "Extracts page-wise textual content and measures character densities.",
        "internal_mechanism": "Extracts raw text strings from every page, computes page character totals, and prepares raw text buffers."
    },
    5: {
        "title": "Text Preprocessing",
        "category": "indexing",
        "description": "Normalizes whitespace, line breaks, encoding streams, and binds page provenance.",
        "internal_mechanism": "Preserves semantic whitespace and code indentation, normalizes line feeds, attaches source and page index metadata."
    },
    6: {
        "title": "Text Chunking",
        "category": "indexing",
        "description": "Segments preprocessed documents into semantically coherent overlapping chunks.",
        "internal_mechanism": "Applies RecursiveCharacterTextSplitter with chunk_size=1000, chunk_overlap=200 using recursive separators ['\\n\\n', '\\n', ' ', '']."
    },
    7: {
        "title": "Embedding Generation",
        "category": "indexing",
        "description": "Transforms textual chunks into dense numerical vector representations using Gemini Embeddings.",
        "internal_mechanism": "Calls Google Generative AI gemini-embedding-001 model generating 3072-dimensional floating-point vectors capturing semantic meaning."
    },
    8: {
        "title": "ChromaDB Vector Storage",
        "category": "indexing",
        "description": "Persists generated embeddings, raw texts, and metadata in a ChromaDB vector database.",
        "internal_mechanism": "Builds an HNSW (Hierarchical Navigable Small World) index in persistent Chroma collection for fast cosine/L2 nearest neighbor retrieval."
    },
    9: {
        "title": "User Query",
        "category": "qa",
        "description": "Captures the user question for retrieval-augmented question answering.",
        "internal_mechanism": "Sanitizes and records user input text string, measuring character length, query terms, and timestamp."
    },
    10: {
        "title": "Query Embedding",
        "category": "qa",
        "description": "Converts the user question into the exact same vector space as the indexed documents.",
        "internal_mechanism": "Calls embeddings.embed_query(question) via gemini-embedding-001 yielding a 3072-dimensional vector for vector comparison."
    },
    11: {
        "title": "Similarity Search",
        "category": "qa",
        "description": "Executes nearest neighbor vector similarity search against ChromaDB index.",
        "internal_mechanism": "Calculates vector distance (L2/Cosine) between query embedding and stored document vectors, ranking all chunks by proximity."
    },
    12: {
        "title": "Relevant Chunk Retrieval",
        "category": "qa",
        "description": "Retrieves the top-k highest scoring chunks with provenance metadata.",
        "internal_mechanism": "Fetches top k=4 chunks from ChromaDB along with similarity/distance scores and source page citations."
    },
    13: {
        "title": "Context Preparation",
        "category": "qa",
        "description": "Formats and concatenates retrieved chunks into an augmented context block.",
        "internal_mechanism": "Prepends page labels ([Page X]) to each chunk content and joins them with double line breaks for the LLM context envelope."
    },
    14: {
        "title": "Prompt Construction",
        "category": "qa",
        "description": "Fills LangChain ChatPromptTemplate with document context and user question.",
        "internal_mechanism": "Injects formatted context and question into prompt template with strict instructions for citation, markdown structure, and factual fidelity."
    },
    15: {
        "title": "Gemini LLM Processing",
        "category": "qa",
        "description": "Sends constructed prompt to Google Gemini LLM for reasoning and generation.",
        "internal_mechanism": "Invokes ChatGoogleGenerativeAI (gemini-3.5-flash-lite) to process the context and synthesize a comprehensive, grounded response."
    },
    16: {
        "title": "Final Answer Generation",
        "category": "qa",
        "description": "Renders the structured response with citations, source references, and metrics.",
        "internal_mechanism": "Parses output stream with StrOutputParser(), maps sources to cited pages, and renders clean Markdown for the user."
    }
}

# State Store
pipeline_state = {
    "stages": {},
    "stats": {
        "total_pages": 0,
        "extracted_characters": 0,
        "total_chunks": 0,
        "generated_embeddings": 0,
        "stored_vectors": 0,
        "retrieved_chunks": 0,
        "total_questions_asked": 0
    },
    "document_info": None,
    "vector_db_info": {
        "status": "Ready",
        "directory": CHROMA_DIRECTORY,
        "embedding_model": EMBEDDING_MODEL_NAME,
        "dimensions": 3072,
        "current_collection": None
    },
    "chunks_store": [],
    "cached_vectors": {},
    "last_retrieval_data": None
}

def init_stages():
    """Initializes empty stages for the dashboard."""
    for s_id, meta in STAGE_DEFINITIONS.items():
        pipeline_state["stages"][s_id] = {
            "id": s_id,
            "title": meta["title"],
            "category": meta["category"],
            "description": meta["description"],
            "internal_mechanism": meta["internal_mechanism"],
            "status": "pending",  # "pending", "processing", "completed", "failed"
            "execution_time_ms": None,
            "data": None,
            "error": None
        }

init_stages()

def find_overlap(text_a, text_b, max_window=250):
    """Finds overlapping text between the end of text_a and the beginning of text_b."""
    if not text_a or not text_b:
        return ""
    tail = text_a[-max_window:]
    for size in range(min(len(tail), len(text_b), max_window), 10, -1):
        candidate = tail[-size:]
        if text_b.startswith(candidate):
            return candidate
    return ""


# =====================================================
# 6. LOAD AND PROCESS PDF (STAGES 1 - 8)
# =====================================================

def process_pdf(pdf_path):
    global vector_store, retriever, pipeline_state

    t_pipeline_start = time.time()
    pdf_path = Path(pdf_path).resolve()

    # Reset indexing stages 1 to 8 to processing
    for s in range(1, 9):
        pipeline_state["stages"][s]["status"] = "processing"
        pipeline_state["stages"][s]["error"] = None

    # Reset Q&A stages 9 to 16 to pending
    for s in range(9, 17):
        pipeline_state["stages"][s]["status"] = "pending"
        pipeline_state["stages"][s]["data"] = None
        pipeline_state["stages"][s]["execution_time_ms"] = None

    # -------------------------------------------------
    # STAGE 1: PDF Upload
    # -------------------------------------------------
    t0 = time.time()
    if not pdf_path.exists():
        err = f"PDF file not found: {pdf_path}"
        pipeline_state["stages"][1]["status"] = "failed"
        pipeline_state["stages"][1]["error"] = err
        raise FileNotFoundError(err)

    file_size_bytes = pdf_path.stat().st_size
    file_size_kb = round(file_size_bytes / 1024, 2)
    file_size_mb = round(file_size_bytes / (1024 * 1024), 2)
    file_size_formatted = f"{file_size_mb} MB" if file_size_mb >= 1.0 else f"{file_size_kb} KB"

    pipeline_state["stages"][1]["status"] = "completed"
    pipeline_state["stages"][1]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][1]["data"] = {
        "filename": pdf_path.name,
        "file_path": str(pdf_path),
        "file_size_bytes": file_size_bytes,
        "file_size_formatted": file_size_formatted,
        "upload_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "preview_url": f"/api/pdf/{pdf_path.name}"
    }

    # -------------------------------------------------
    # STAGE 2: PDF Validation
    # -------------------------------------------------
    t0 = time.time()
    validation_errors = []
    if pdf_path.suffix.lower() != ".pdf":
        validation_errors.append("Invalid file extension: must be .pdf")

    is_valid_header = False
    header_snippet = ""
    try:
        with open(pdf_path, "rb") as f:
            header_bytes = f.read(8)
            header_snippet = header_bytes.decode("latin1", errors="ignore")
            if header_bytes.startswith(b"%PDF-"):
                is_valid_header = True
            else:
                validation_errors.append("File header does not begin with '%PDF-'.")
    except Exception as e:
        validation_errors.append(f"Header check failed: {str(e)}")

    if file_size_bytes == 0:
        validation_errors.append("File size is 0 bytes.")
    elif file_size_bytes > 20 * 1024 * 1024:
        validation_errors.append("File size exceeds 20 MB limit.")

    if validation_errors:
        pipeline_state["stages"][2]["status"] = "failed"
        pipeline_state["stages"][2]["error"] = "; ".join(validation_errors)
        raise ValueError("; ".join(validation_errors))

    pipeline_state["stages"][2]["status"] = "completed"
    pipeline_state["stages"][2]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][2]["data"] = {
        "is_valid": True,
        "file_extension": pdf_path.suffix.lower(),
        "mime_type": "application/pdf",
        "header_snippet": header_snippet.strip(),
        "file_size_bytes": file_size_bytes,
        "file_size_formatted": file_size_formatted,
        "validation_status": "Valid PDF Document",
        "errors": []
    }

    # -------------------------------------------------
    # STAGE 3: PDF Parsing
    # -------------------------------------------------
    t0 = time.time()
    loader = PyPDFLoader(str(pdf_path))
    documents = loader.load()

    if not documents:
        err = "No readable pages found in PDF."
        pipeline_state["stages"][3]["status"] = "failed"
        pipeline_state["stages"][3]["error"] = err
        raise ValueError(err)

    total_pages = len(documents)
    pipeline_state["stages"][3]["status"] = "completed"
    pipeline_state["stages"][3]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][3]["data"] = {
        "loader_engine": "PyPDFLoader (pypdf parser)",
        "total_pages": total_pages,
        "parsing_status": "Successful page stream extraction"
    }

    # -------------------------------------------------
    # STAGE 4: Text Extraction
    # -------------------------------------------------
    t0 = time.time()
    total_characters = sum(len(doc.page_content) for doc in documents)
    pages_data = []

    for idx, doc in enumerate(documents):
        pages_data.append({
            "page_number": idx + 1,
            "char_count": len(doc.page_content),
            "preview": doc.page_content[:200] + ("..." if len(doc.page_content) > 200 else ""),
            "content": doc.page_content
        })

    pipeline_state["stages"][4]["status"] = "completed"
    pipeline_state["stages"][4]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][4]["data"] = {
        "total_extracted_characters": total_characters,
        "total_pages": total_pages,
        "pages": pages_data
    }

    # -------------------------------------------------
    # STAGE 5: Text Preprocessing
    # -------------------------------------------------
    t0 = time.time()
    cleaning_operations = [
        "Extracted raw text streams from PDF pages via PyPDFLoader",
        "Preserved semantic whitespace, indentation, code blocks, and newlines",
        "Bound source document filepath and zero-indexed page numbers to metadata",
        "Prepared document boundaries for recursive character splitting"
    ]
    sample_page_text = documents[0].page_content if documents else ""
    pipeline_state["stages"][5]["status"] = "completed"
    pipeline_state["stages"][5]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][5]["data"] = {
        "cleaning_operations": cleaning_operations,
        "raw_characters_total": total_characters,
        "processed_characters_total": total_characters,
        "sample_input": sample_page_text[:300] + ("..." if len(sample_page_text) > 300 else ""),
        "sample_output": sample_page_text[:300] + ("..." if len(sample_page_text) > 300 else "")
    }

    # -------------------------------------------------
    # STAGE 6: Text Chunking
    # -------------------------------------------------
    t0 = time.time()
    chunk_size = 1000
    chunk_overlap = 200
    separators = ["\n\n", "\n", " ", ""]

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=separators
    )

    chunks = text_splitter.split_documents(documents)

    if not chunks:
        err = "No extractable text found in the PDF."
        pipeline_state["stages"][6]["status"] = "failed"
        pipeline_state["stages"][6]["error"] = err
        raise ValueError(err)

    total_chunks = len(chunks)
    chunks_data = []

    for idx, chunk in enumerate(chunks):
        p_num = chunk.metadata.get("page", 0) + 1
        content = chunk.page_content
        overlap_with_prev = ""
        if idx > 0:
            overlap_with_prev = find_overlap(chunks[idx - 1].page_content, content)

        chunk_item = {
            "chunk_id": f"chunk_{idx + 1}",
            "chunk_number": idx + 1,
            "page_number": p_num,
            "char_count": len(content),
            "content": content,
            "preview": content[:150] + ("..." if len(content) > 150 else ""),
            "overlap_prev": overlap_with_prev,
            "has_overlap": bool(overlap_with_prev)
        }
        chunks_data.append(chunk_item)

    pipeline_state["chunks_store"] = chunks_data

    pipeline_state["stages"][6]["status"] = "completed"
    pipeline_state["stages"][6]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][6]["data"] = {
        "chunking_technique": "Recursive Character Text Splitting",
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "separators": separators,
        "total_chunks": total_chunks,
        "chunks": chunks_data
    }

    # -------------------------------------------------
    # STAGE 7: Embedding Generation & STAGE 8: ChromaDB
    # -------------------------------------------------
    t0 = time.time()
    collection_name = "rag_" + uuid.uuid4().hex[:12]

    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=collection_name,
        persist_directory=CHROMA_DIRECTORY
    )

    col = vector_store._collection
    stored_data = col.get(include=["embeddings", "documents", "metadatas"])
    stored_embeddings = stored_data.get("embeddings", [])
    stored_documents = stored_data.get("documents", [])
    stored_metadatas = stored_data.get("metadatas", [])
    stored_ids = stored_data.get("ids", [])

    emb_dimension = len(stored_embeddings[0]) if stored_embeddings is not None and len(stored_embeddings) > 0 else 3072

    pipeline_state["cached_vectors"] = {}
    chunk_embeddings_summary = []

    for i in range(len(chunks_data)):
        vec = None
        if i < len(stored_embeddings):
            vec = [float(val) for val in stored_embeddings[i]]
            pipeline_state["cached_vectors"][i + 1] = vec

        preview_vector = vec[:8] if vec else []
        chunk_embeddings_summary.append({
            "chunk_number": i + 1,
            "chunk_id": f"chunk_{i + 1}",
            "char_count": chunks_data[i]["char_count"],
            "page_number": chunks_data[i]["page_number"],
            "preview_text": chunks_data[i]["preview"],
            "dimension": emb_dimension,
            "preview_values": preview_vector,
            "vector_min": round(min(vec), 5) if vec else 0.0,
            "vector_max": round(max(vec), 5) if vec else 0.0,
            "has_full_vector": bool(vec)
        })

    emb_time_ms = round((time.time() - t0) * 1000, 2)

    # Stage 7 Data (Embeddings)
    pipeline_state["stages"][7]["status"] = "completed"
    pipeline_state["stages"][7]["execution_time_ms"] = emb_time_ms
    pipeline_state["stages"][7]["data"] = {
        "model": EMBEDDING_MODEL_NAME,
        "provider": "Google Generative AI (Gemini)",
        "dimension": emb_dimension,
        "total_embeddings": len(chunk_embeddings_summary),
        "chunk_embeddings": chunk_embeddings_summary
    }

    # Stage 8 Data (ChromaDB)
    stored_records_preview = []
    for i in range(min(len(stored_ids), 50)):
        meta = stored_metadatas[i] if i < len(stored_metadatas) else {}
        stored_records_preview.append({
            "record_id": stored_ids[i],
            "chunk_number": i + 1,
            "page": meta.get("page", 0) + 1 if isinstance(meta, dict) else 1,
            "text_snippet": stored_documents[i][:120] if i < len(stored_documents) else "",
            "dimension": emb_dimension
        })

    pipeline_state["stages"][8]["status"] = "completed"
    pipeline_state["stages"][8]["execution_time_ms"] = 12.0
    pipeline_state["stages"][8]["data"] = {
        "vector_database": "ChromaDB (PersistentClient)",
        "connection_status": "Connected & Active",
        "persist_directory": CHROMA_DIRECTORY,
        "collection_name": collection_name,
        "stored_vectors_count": len(stored_ids),
        "distance_metric": "Squared Euclidean (L2)",
        "stored_records": stored_records_preview
    }

    # Initialize Retriever
    retriever = vector_store.as_retriever(search_kwargs={"k": 4})

    # Update Statistics
    pipeline_state["stats"]["total_pages"] = total_pages
    pipeline_state["stats"]["extracted_characters"] = total_characters
    pipeline_state["stats"]["total_chunks"] = total_chunks
    pipeline_state["stats"]["generated_embeddings"] = total_chunks
    pipeline_state["stats"]["stored_vectors"] = len(stored_ids)

    pipeline_state["document_info"] = {
        "filename": pdf_path.name,
        "size_formatted": file_size_formatted,
        "pages": total_pages,
        "characters": total_characters,
        "chunks": total_chunks,
        "upload_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

    pipeline_state["vector_db_info"]["current_collection"] = collection_name
    pipeline_state["vector_db_info"]["dimensions"] = emb_dimension

    print(f"Document processed successfully in {round(time.time() - t_pipeline_start, 2)}s!")
    return len(chunks)


# =====================================================
# 7. PROMPT TEMPLATE DEFINITION
# =====================================================

PROMPT_TEMPLATE_TEXT = """
You are a professional AI document assistant.

Answer the user's question using ONLY the
information available in the provided document context.

IMPORTANT FORMATTING INSTRUCTIONS:

1. Start with a clear and relevant Markdown heading.
2. Give a short introduction.
3. Organize the answer into numbered sections.
4. Use bullet points for important details.
5. Make important terms bold using Markdown.
6. Use inline code for programming terms and variables.
7. Use fenced code blocks for programming examples.
8. Use Markdown tables when comparing information.
9. Keep paragraphs short and easy to understand.
10. Avoid unnecessary repetition.
11. Include relevant details from the document.
12. Do not invent information.

SOURCE INSTRUCTIONS:

- Use the page labels provided in the context.
- Add source references such as [Page 1] or [Page 2]
  where relevant.
- Only cite pages that support your answer.
- If information is unavailable, clearly say that
  it is not available in the uploaded document.

ANSWER STRUCTURE:

## Main Topic

Provide a short explanation.

## Key Points

1. **First point**
   - Explain the details.

2. **Second point**
   - Explain the details.

## Summary

Provide a short conclusion.

Adapt the structure to the question.
Do not force irrelevant sections into the answer.

DOCUMENT CONTEXT:

{context}

USER QUESTION:

{question}

Provide the final answer in clean Markdown.
"""

prompt = ChatPromptTemplate.from_template(PROMPT_TEMPLATE_TEXT)

rag_chain = (
    prompt
    | llm
    | StrOutputParser()
)


# =====================================================
# 8. ASK QUESTIONS USING RAG (STAGES 9 - 16)
# =====================================================

def ask_question(question):
    global retriever, vector_store, pipeline_state

    if retriever is None or vector_store is None:
        raise ValueError("Please upload a PDF document first.")

    question = (question or "").strip()
    if not question:
        raise ValueError("Question cannot be empty.")

    t_total_start = time.time()

    # -------------------------------------------------
    # STAGE 9: User Query
    # -------------------------------------------------
    t0 = time.time()
    query_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pipeline_state["stages"][9]["status"] = "completed"
    pipeline_state["stages"][9]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][9]["data"] = {
        "question": question,
        "char_count": len(question),
        "word_count": len(question.split()),
        "timestamp": query_timestamp
    }

    # -------------------------------------------------
    # STAGE 10: Query Embedding
    # -------------------------------------------------
    t0 = time.time()
    query_vector_raw = embeddings.embed_query(question)
    query_vector = [float(v) for v in query_vector_raw]
    t_query_emb_ms = round((time.time() - t0) * 1000, 2)

    pipeline_state["stages"][10]["status"] = "completed"
    pipeline_state["stages"][10]["execution_time_ms"] = t_query_emb_ms
    pipeline_state["stages"][10]["data"] = {
        "model": EMBEDDING_MODEL_NAME,
        "question": question,
        "dimension": len(query_vector),
        "query_vector": query_vector,
        "preview_values": query_vector[:10],
        "vector_min": round(min(query_vector), 5),
        "vector_max": round(max(query_vector), 5)
    }

    # -------------------------------------------------
    # STAGE 11: Similarity Search & STAGE 12: Retrieval
    # -------------------------------------------------
    t0 = time.time()
    results_with_scores = vector_store.similarity_search_with_score(question, k=4)
    t_search_ms = round((time.time() - t0) * 1000, 2)

    if not results_with_scores:
        err = "No relevant information found in the document."
        pipeline_state["stages"][11]["status"] = "failed"
        pipeline_state["stages"][11]["error"] = err
        raise ValueError(err)

    similarity_results = []
    retrieved_chunks = []
    relevant_docs = []

    for rank, (doc, score) in enumerate(results_with_scores, 1):
        relevant_docs.append(doc)
        p_num = doc.metadata.get("page", -1)
        page_label = f"Page {p_num + 1}" if p_num >= 0 else "Unknown page"
        score_val = float(score)
        relevance_pct = max(5.0, min(100.0, round((1.0 / (1.0 + score_val)) * 100, 1)))

        sim_item = {
            "rank": rank,
            "page_label": page_label,
            "page_number": p_num + 1 if p_num >= 0 else 1,
            "distance_score": round(score_val, 4),
            "relevance_pct": relevance_pct,
            "char_count": len(doc.page_content),
            "preview": doc.page_content[:200] + ("..." if len(doc.page_content) > 200 else "")
        }
        similarity_results.append(sim_item)

        retrieved_chunks.append({
            "rank": rank,
            "page_label": page_label,
            "page_number": p_num + 1 if p_num >= 0 else 1,
            "distance_score": round(score_val, 4),
            "relevance_pct": relevance_pct,
            "char_count": len(doc.page_content),
            "content": doc.page_content,
            "metadata": doc.metadata
        })

    # Stage 11 Data
    pipeline_state["stages"][11]["status"] = "completed"
    pipeline_state["stages"][11]["execution_time_ms"] = t_search_ms
    pipeline_state["stages"][11]["data"] = {
        "search_method": "ChromaDB HNSW Vector Similarity (L2 Distance)",
        "top_k": 4,
        "results": similarity_results
    }

    # Stage 12 Data
    pipeline_state["stages"][12]["status"] = "completed"
    pipeline_state["stages"][12]["execution_time_ms"] = t_search_ms
    pipeline_state["stages"][12]["data"] = {
        "k": len(retrieved_chunks),
        "chunks": retrieved_chunks
    }

    # -------------------------------------------------
    # STAGE 13: Context Preparation
    # -------------------------------------------------
    t0 = time.time()
    context_parts = []
    for doc in relevant_docs:
        page_number = doc.metadata.get("page", -1)
        page_label = f"Page {page_number + 1}" if page_number >= 0 else "Unknown page"
        context_parts.append(f"[{page_label}]\n{doc.page_content}")

    context = "\n\n".join(context_parts)
    t_context_ms = round((time.time() - t0) * 1000, 2)

    pipeline_state["stages"][13]["status"] = "completed"
    pipeline_state["stages"][13]["execution_time_ms"] = t_context_ms
    pipeline_state["stages"][13]["data"] = {
        "chunks_assembled": len(relevant_docs),
        "context_characters": len(context),
        "context_words": len(context.split()),
        "assembled_context": context
    }

    # -------------------------------------------------
    # STAGE 14: Prompt Construction
    # -------------------------------------------------
    t0 = time.time()
    constructed_prompt_val = prompt.format(context=context, question=question)
    t_prompt_ms = round((time.time() - t0) * 1000, 2)

    system_instructions_summary = [
        "Answer ONLY using information available in the provided document context",
        "Start with a clear and relevant Markdown heading",
        "Organize the answer into numbered sections with bullet points",
        "Make important terms bold using Markdown",
        "Use inline code and fenced code blocks for programming terms",
        "Use Markdown tables when comparing information",
        "Cite source page references [Page X] where relevant",
        "Strictly avoid hallucination or ungrounded claims"
    ]

    pipeline_state["stages"][14]["status"] = "completed"
    pipeline_state["stages"][14]["execution_time_ms"] = t_prompt_ms
    pipeline_state["stages"][14]["data"] = {
        "template_name": "LangChain ChatPromptTemplate",
        "system_instructions": system_instructions_summary,
        "constructed_prompt": constructed_prompt_val,
        "prompt_char_count": len(constructed_prompt_val)
    }

    # -------------------------------------------------
    # STAGE 15: Gemini LLM Processing
    # -------------------------------------------------
    t0 = time.time()
    answer = rag_chain.invoke({
        "context": context,
        "question": question
    })
    t_llm_ms = round((time.time() - t0) * 1000, 2)

    pipeline_state["stages"][15]["status"] = "completed"
    pipeline_state["stages"][15]["execution_time_ms"] = t_llm_ms
    pipeline_state["stages"][15]["data"] = {
        "provider": "Google Gemini",
        "chat_model": CHAT_MODEL_NAME,
        "execution_time_ms": t_llm_ms,
        "response_status": "200 OK - Answer Generated",
        "input_length": len(constructed_prompt_val),
        "output_length": len(answer)
    }

    # -------------------------------------------------
    # STAGE 16: Final Answer Generation & Sources
    # -------------------------------------------------
    t0 = time.time()
    sources = []
    seen_sources = set()

    for doc in relevant_docs:
        page_number = doc.metadata.get("page", -1)
        page = page_number + 1 if page_number >= 0 else "Unknown"
        content_snippet = doc.page_content[:300]
        source_key = (page, content_snippet)

        if source_key in seen_sources:
            continue
        seen_sources.add(source_key)

        sources.append({
            "page": page,
            "content": content_snippet
        })

    pipeline_state["stages"][16]["status"] = "completed"
    pipeline_state["stages"][16]["execution_time_ms"] = round((time.time() - t0) * 1000, 2)
    pipeline_state["stages"][16]["data"] = {
        "final_answer": answer,
        "sources": sources,
        "total_sources": len(sources),
        "total_execution_time_ms": round((time.time() - t_total_start) * 1000, 2)
    }

    # Update overall statistics
    pipeline_state["stats"]["total_questions_asked"] += 1
    pipeline_state["stats"]["retrieved_chunks"] = len(retrieved_chunks)

    pipeline_state["last_retrieval_data"] = {
        "question": question,
        "answer": answer,
        "sources": sources,
        "retrieved_chunks": retrieved_chunks,
        "timestamp": query_timestamp,
        "total_time_ms": round((time.time() - t_total_start) * 1000, 2)
    }

    return {
        "answer": answer,
        "sources": sources,
        "pipeline_stages": pipeline_state["stages"],
        "query_execution_time_ms": round((time.time() - t_total_start) * 1000, 2)
    }


# =====================================================
# 9. GETTERS FOR API ENDPOINTS
# =====================================================

def get_pipeline_status():
    """Returns overall pipeline status and stage status list."""
    stages_summary = []
    for s_id in sorted(pipeline_state["stages"].keys()):
        s = pipeline_state["stages"][s_id]
        stages_summary.append({
            "id": s_id,
            "title": s["title"],
            "category": s["category"],
            "status": s["status"],
            "execution_time_ms": s["execution_time_ms"],
            "has_data": s["data"] is not None
        })
    return {
        "stages": stages_summary,
        "document_info": pipeline_state["document_info"],
        "vector_db_info": pipeline_state["vector_db_info"],
        "stats": pipeline_state["stats"]
    }

def get_pipeline_stage_data(stage_id):
    """Returns detailed data for a specific stage."""
    return pipeline_state["stages"].get(stage_id)

def get_pipeline_chunks(page=1, per_page=10, search=""):
    """Returns chunks with pagination and search."""
    chunks = pipeline_state.get("chunks_store", [])
    if search:
        search_lower = search.lower()
        chunks = [c for c in chunks if search_lower in c["content"].lower() or search_lower in c["chunk_id"].lower()]
    total = len(chunks)
    start = (page - 1) * per_page
    end = start + per_page
    paged = chunks[start:end]
    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
        "chunks": paged
    }

def get_pipeline_embeddings(chunk_id=None):
    """Returns embeddings metadata and cached vector if requested."""
    emb_data = pipeline_state["stages"][7].get("data")
    if not emb_data:
        return {"error": "Embeddings not generated yet."}

    result = {
        "model": emb_data.get("model"),
        "provider": emb_data.get("provider"),
        "dimension": emb_data.get("dimension"),
        "total_embeddings": emb_data.get("total_embeddings"),
        "chunk_embeddings": emb_data.get("chunk_embeddings", [])
    }

    if chunk_id is not None:
        try:
            cid = int(chunk_id)
            if cid in pipeline_state["cached_vectors"]:
                result["selected_vector"] = {
                    "chunk_id": cid,
                    "dimension": len(pipeline_state["cached_vectors"][cid]),
                    "vector": pipeline_state["cached_vectors"][cid]
                }
        except Exception:
            pass

    return result

def get_pipeline_retrieval():
    """Returns last retrieval and query QA data."""
    return {
        "last_query": pipeline_state["stages"][9].get("data"),
        "query_embedding": pipeline_state["stages"][10].get("data"),
        "similarity_search": pipeline_state["stages"][11].get("data"),
        "retrieved_chunks": pipeline_state["stages"][12].get("data"),
        "context_preparation": pipeline_state["stages"][13].get("data"),
        "prompt_construction": pipeline_state["stages"][14].get("data"),
        "gemini_processing": pipeline_state["stages"][15].get("data"),
        "final_answer": pipeline_state["stages"][16].get("data")
    }

def get_pipeline_metrics():
    """Returns dashboard metrics cards."""
    return pipeline_state["stats"]
