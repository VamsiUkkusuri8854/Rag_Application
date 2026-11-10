
import os
import uuid
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


# =====================================================
# 2. INITIALIZE GEMINI EMBEDDING MODEL
# =====================================================

embeddings = GoogleGenerativeAIEmbeddings(
    model=os.getenv(
        "GEMINI_EMBEDDING_MODEL",
        "gemini-embedding-001"
    ),
    google_api_key=GOOGLE_API_KEY
)

print("Gemini embedding model initialized!")


# =====================================================
# 3. INITIALIZE GEMINI CHAT MODEL
# =====================================================

llm = ChatGoogleGenerativeAI(
    model=os.getenv(
        "GEMINI_CHAT_MODEL",
        "gemini-3.5-flash-lite"
    ),
    google_api_key=GOOGLE_API_KEY
)

print("Gemini chat model initialized!")


# =====================================================
# 4. GLOBAL VECTOR STORE AND RETRIEVER
# =====================================================

vector_store = None
retriever = None

CHROMA_DIRECTORY = str(PROJECT_ROOT / "chroma_db")


# =====================================================
# 5. LOAD AND PROCESS PDF
# =====================================================

def process_pdf(pdf_path):

    global vector_store, retriever

    print("\nLoading PDF document...")

    pdf_path = Path(pdf_path).resolve()

    if not pdf_path.exists():
        raise FileNotFoundError(
            f"PDF file not found: {pdf_path}"
        )

    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError("Only PDF files are supported.")

    # Load PDF
    loader = PyPDFLoader(str(pdf_path))

    documents = loader.load()

    if not documents:
        raise ValueError("No readable pages found in PDF.")

    print(f"Total pages loaded: {len(documents)}")


    # =================================================
    # 6. SPLIT DOCUMENT INTO SMALLER CHUNKS
    # =================================================

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", " ", ""]
    )

    chunks = text_splitter.split_documents(documents)

    if not chunks:
        raise ValueError(
            "No extractable text found in the PDF."
        )

    print(f"Total chunks created: {len(chunks)}")


    # =================================================
    # 7. GENERATE EMBEDDINGS AND STORE IN CHROMADB
    # =================================================

    collection_name = "rag_" + uuid.uuid4().hex[:12]

    vector_store = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=collection_name,
        persist_directory=CHROMA_DIRECTORY
    )

    print("Document embeddings generated!")
    print("Embeddings stored in ChromaDB!")


    # =================================================
    # 8. CREATE RETRIEVER
    # =================================================

    retriever = vector_store.as_retriever(
        search_kwargs={"k": 4}
    )

    print("Retriever created successfully!")

    return len(chunks)


# =====================================================
# 9. ASK QUESTIONS USING RAG
# =====================================================

def ask_question(question):

    if retriever is None:
        raise ValueError(
            "Please upload a PDF document first."
        )

    if not question or not question.strip():
        raise ValueError("Question cannot be empty.")

    print("\nRetrieving relevant document chunks...")

    # Retrieve relevant document chunks
    relevant_docs = retriever.invoke(question)

    if not relevant_docs:
        raise ValueError(
            "No relevant information found in the document."
        )

    print(f"Retrieved {len(relevant_docs)} relevant chunks!")


    # =================================================
    # 10. PREPARE CONTEXT WITH PAGE NUMBERS
    # =================================================

    context_parts = []

    for doc in relevant_docs:

        page_number = doc.metadata.get("page", -1)

        page_label = (
            f"Page {page_number + 1}"
            if page_number >= 0
            else "Unknown page"
        )

        context_parts.append(
            f"[{page_label}]\n{doc.page_content}"
        )

    context = "\n\n".join(context_parts)


    # =================================================
    # 11. CREATE STRUCTURED MARKDOWN PROMPT
    # =================================================

    prompt = ChatPromptTemplate.from_template(
        """
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
    )


    # =================================================
    # 12. GENERATE ANSWER USING GEMINI
    # =================================================

    rag_chain = (
        prompt
        | llm
        | StrOutputParser()
    )

    print("Generating structured answer using Gemini...")

    answer = rag_chain.invoke({
        "context": context,
        "question": question
    })


    # =================================================
    # 13. PREPARE SOURCE INFORMATION
    # =================================================

    sources = []

    seen_sources = set()

    for doc in relevant_docs:

        page_number = doc.metadata.get("page", -1)

        page = (
            page_number + 1
            if page_number >= 0
            else "Unknown"
        )

        content = doc.page_content[:300]

        source_key = (page, content)

        if source_key in seen_sources:
            continue

        seen_sources.add(source_key)

        sources.append({
            "page": page,
            "content": content
        })


    # =================================================
    # 14. RETURN ANSWER AND SOURCES
    # =================================================

    print("Structured answer generated successfully!")

    return {
        "answer": answer,
        "sources": sources
    }
