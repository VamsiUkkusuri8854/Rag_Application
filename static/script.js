/**
 * ==============================================================================
 * RAG ASSISTANT & PIPELINE DASHBOARD JAVASCRIPT
 * Professional Interactive AI Architecture Visualizer & Document Chat
 * ==============================================================================
 */

// Application State
const appState = {
    currentStage: 1,
    viewMode: "dashboard", // "dashboard" or "chat"
    selectedChunkId: 1,
    activePageNum: 1,
    chunkSearchTerm: "",
    chunkPage: 1,
    chunkPerPage: 5,
    pipelineStatus: null,
    isProcessing: false,
    pdfUploaded: false
};

// Stage Configurations (16 Stages)
const STAGE_META = {
    1: { title: "Stage 1: PDF Upload", desc: "Upload a PDF document via file selector or drag-and-drop zone.", mechanism: "Receives multi-part file upload, verifies file envelope, saves securely to uploads directory on server storage." },
    2: { title: "Stage 2: PDF Validation", desc: "Validates format integrity, MIME type, file size bounds, and PDF header signature.", mechanism: "Checks magic bytes (%PDF-), confirms extension .pdf, ensures file size within 20 MB ceiling." },
    3: { title: "Stage 3: PDF Parsing", desc: "Streams document structure and pagination using LangChain PyPDFLoader.", mechanism: "Initializes PyPDFLoader (pypdf parser engine) and extracts raw Document stream objects preserving page indices." },
    4: { title: "Stage 4: Text Extraction", desc: "Extracts page-wise textual content and measures character densities.", mechanism: "Extracts raw text strings from every page, computes page character totals, and prepares raw text buffers." },
    5: { title: "Stage 5: Text Preprocessing", desc: "Normalizes whitespace, line breaks, encoding streams, and binds page provenance.", mechanism: "Preserves semantic whitespace and code indentation, normalizes line feeds, attaches source and page index metadata." },
    6: { title: "Stage 6: Text Chunking", desc: "Segments preprocessed documents into semantically coherent overlapping chunks.", mechanism: "Applies RecursiveCharacterTextSplitter with chunk_size=1000, chunk_overlap=200 using recursive separators ['\\n\\n', '\\n', ' ', '']." },
    7: { title: "Stage 7: Embedding Generation", desc: "Transforms textual chunks into dense numerical vector representations using Gemini Embeddings.", mechanism: "Calls Google Generative AI gemini-embedding-001 model generating 3072-dimensional floating-point vectors capturing semantic meaning." },
    8: { title: "Stage 8: ChromaDB Vector Storage", desc: "Persists generated embeddings, raw texts, and metadata in a ChromaDB vector database.", mechanism: "Builds an HNSW (Hierarchical Navigable Small World) index in persistent Chroma collection for fast cosine/L2 nearest neighbor retrieval." },
    9: { title: "Stage 9: User Query", desc: "Captures the user question for retrieval-augmented question answering.", mechanism: "Sanitizes and records user input text string, measuring character length, query terms, and timestamp." },
    10: { title: "Stage 10: Query Embedding", desc: "Converts the user question into the exact same vector space as the indexed documents.", mechanism: "Calls embeddings.embed_query(question) via gemini-embedding-001 yielding a 3072-dimensional vector for vector comparison." },
    11: { title: "Stage 11: Similarity Search", desc: "Executes nearest neighbor vector similarity search against ChromaDB index.", mechanism: "Calculates vector distance (L2/Cosine) between query embedding and stored document vectors, ranking all chunks by proximity." },
    12: { title: "Stage 12: Relevant Chunk Retrieval", desc: "Retrieves the top-k highest scoring chunks with provenance metadata.", mechanism: "Fetches top k=4 chunks from ChromaDB along with similarity/distance scores and source page citations." },
    13: { title: "Stage 13: Context Preparation", desc: "Formats and concatenates retrieved chunks into an augmented context block.", mechanism: "Prepends page labels ([Page X]) to each chunk content and joins them with double line breaks for the LLM context envelope." },
    14: { title: "Stage 14: Prompt Construction", desc: "Fills LangChain ChatPromptTemplate with document context and user question.", mechanism: "Injects formatted context and question into prompt template with strict instructions for citation, markdown structure, and factual fidelity." },
    15: { title: "Stage 15: Gemini LLM Processing", desc: "Sends constructed prompt to Google Gemini LLM for reasoning and generation.", mechanism: "Invokes ChatGoogleGenerativeAI (gemini-3.5-flash-lite) to process the context and synthesize a comprehensive, grounded response." },
    16: { title: "Stage 16: Final Answer Generation", desc: "Renders the structured response with citations, source references, and metrics.", mechanism: "Parses output stream with StrOutputParser(), maps sources to cited pages, and renders clean Markdown for the user." }
};


// ==============================================================================
// INITIALIZATION
// ==============================================================================

document.addEventListener("DOMContentLoaded", () => {
    initElements();
    initEventListeners();
    refreshPipelineData();
});

function initElements() {
    window.chatArea = document.getElementById("chatArea");
    window.userInput = document.getElementById("userInput");
    window.sendBtn = document.getElementById("sendBtn");
    window.welcome = document.getElementById("welcome");
    window.pdfInput = document.getElementById("pdfInput");
    window.uploadBtn = document.getElementById("uploadBtn");
    window.fileName = document.getElementById("fileName");
    window.sidebarFileName = document.getElementById("sidebarFileName");
    window.statusElement = document.getElementById("status");
    window.statusText = document.getElementById("statusText");
}

function initEventListeners() {
    // Mode toggles
    const btnDash = document.getElementById("btnModeDashboard");
    if (btnDash) btnDash.addEventListener("click", () => setViewMode("dashboard"));

    const btnChat = document.getElementById("btnModeChat");
    if (btnChat) btnChat.addEventListener("click", () => setViewMode("chat"));

    // Pipeline Stage Clicks in Sidebar
    document.querySelectorAll(".pipeline-item").forEach(item => {
        item.addEventListener("click", () => {
            const stage = parseInt(item.getAttribute("data-stage"), 10);
            selectStage(stage);
        });
    });

    // Flowchart Node Clicks
    document.querySelectorAll(".flow-node").forEach(node => {
        node.addEventListener("click", () => {
            const stage = parseInt(node.getAttribute("data-stage"), 10);
            selectStage(stage);
        });
    });

    // Prev / Next Stage Buttons
    const prevBtn = document.getElementById("btnPrevStage");
    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (appState.currentStage > 1) selectStage(appState.currentStage - 1);
        });
    }

    const nextBtn = document.getElementById("btnNextStage");
    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (appState.currentStage < 16) selectStage(appState.currentStage + 1);
        });
    }

    // Top Action Buttons
    const sampleBtn = document.getElementById("topbarSampleBtn");
    if (sampleBtn) sampleBtn.addEventListener("click", loadSampleDocument);

    const topUploadBtn = document.getElementById("topbarUploadBtn");
    if (topUploadBtn) {
        topUploadBtn.addEventListener("click", () => {
            const gInput = document.getElementById("globalPdfInput");
            if (gInput) gInput.click();
        });
    }

    // File Input Handlers
    const gInput = document.getElementById("globalPdfInput");
    if (gInput) {
        gInput.addEventListener("change", function () {
            if (this.files && this.files[0]) handleFileUpload(this.files[0]);
        });
    }

    const pInput = document.getElementById("pdfInput");
    if (pInput) {
        pInput.addEventListener("change", function () {
            if (this.files && this.files[0]) handleFileUpload(this.files[0]);
        });
    }

    const upBtn = document.getElementById("uploadBtn");
    if (upBtn) {
        upBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const input = document.getElementById("pdfInput") || document.getElementById("globalPdfInput");
            if (input) input.click();
        });
    }

    const upBox = document.getElementById("uploadBox");
    if (upBox) {
        upBox.addEventListener("click", (e) => {
            if (e.target.id !== "uploadBtn") {
                const input = document.getElementById("pdfInput") || document.getElementById("globalPdfInput");
                if (input) input.click();
            }
        });
        upBox.addEventListener("dragover", (e) => {
            e.preventDefault();
            upBox.style.borderColor = "var(--accent-green)";
        });
        upBox.addEventListener("dragleave", () => {
            upBox.style.borderColor = "#b9c3c8";
        });
        upBox.addEventListener("drop", (e) => {
            e.preventDefault();
            upBox.style.borderColor = "#b9c3c8";
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
    }

    // New Chat button
    const newChatBtn = document.getElementById("newChatBtn");
    if (newChatBtn) newChatBtn.addEventListener("click", handleNewChat);

    // Chat / Query Submission
    const sendBtn = document.getElementById("sendBtn");
    if (sendBtn) sendBtn.addEventListener("click", handleSendMessage);

    const userInput = document.getElementById("userInput");
    if (userInput) {
        userInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        userInput.addEventListener("input", function () {
            this.style.height = "auto";
            this.style.height = Math.min(this.scrollHeight, 150) + "px";
        });
    }

    // Suggestion chips
    document.querySelectorAll(".suggestion").forEach(chip => {
        chip.addEventListener("click", function () {
            const text = this.textContent.trim().replace(/^✦\s*/, "");
            const ui = document.getElementById("userInput");
            if (ui) {
                ui.value = text;
                ui.focus();
            }
        });
    });

    // Modal
    const closeModalBtn = document.getElementById("closeVectorModal");
    if (closeModalBtn) {
        closeModalBtn.addEventListener("click", () => {
            const modal = document.getElementById("vectorModal");
            if (modal) modal.classList.remove("open");
        });
    }

    const modalOverlay = document.getElementById("vectorModal");
    if (modalOverlay) {
        modalOverlay.addEventListener("click", (e) => {
            if (e.target.id === "vectorModal") modalOverlay.classList.remove("open");
        });
    }

    const copyBtn = document.getElementById("btnCopyFullVector");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const codeEl = document.getElementById("vectorModalCode");
            const text = codeEl ? codeEl.textContent : "";
            navigator.clipboard.writeText(text);
            alert("3,072-dimensional vector copied to clipboard!");
        });
    }
}


// ==============================================================================
// VIEW MODE SWITCHER (DASHBOARD vs CHAT)
// ==============================================================================

function setViewMode(mode) {
    appState.viewMode = mode;
    const btnDash = document.getElementById("btnModeDashboard");
    const btnChat = document.getElementById("btnModeChat");
    const dashView = document.getElementById("dashboardScrollView");
    const chatView = document.getElementById("chatArea");
    const topTitle = document.getElementById("topbarTitle");
    const topSub = document.getElementById("topbarSubtitle");

    if (mode === "dashboard") {
        btnDash.classList.add("active");
        btnChat.classList.remove("active");
        dashView.style.display = "block";
        chatView.style.display = "none";
        topTitle.textContent = "RAG Pipeline Dashboard";
        topSub.textContent = "Interactive AI Architecture & Internal Processing Inspector";
    } else {
        btnChat.classList.add("active");
        btnDash.classList.remove("active");
        dashView.style.display = "none";
        chatView.style.display = "block";
        topTitle.textContent = "Document Chat";
        topSub.textContent = "AI-powered PDF assistant with source citations";
    }
}


// ==============================================================================
// DATA FETCHING & SYNCHRONIZATION
// ==============================================================================

async function refreshPipelineData() {
    try {
        const res = await fetch("/api/pipeline/status");
        if (res.ok) {
            const data = await res.json();
            appState.pipelineStatus = data;
            syncDashboardUI(data);
        }
    } catch (err) {
        console.error("Error fetching pipeline status:", err);
    }
}

function syncDashboardUI(data) {
    if (!data) return;

    // 1. Update Metrics Cards
    const stats = data.stats || {};
    document.getElementById("statPdfPages").textContent = stats.total_pages || 0;
    document.getElementById("statExtractedChars").textContent = (stats.extracted_characters || 0).toLocaleString();
    document.getElementById("statTotalChunks").textContent = stats.total_chunks || 0;
    document.getElementById("statGeneratedEmbeddings").textContent = stats.generated_embeddings || 0;
    document.getElementById("statStoredVectors").textContent = stats.stored_vectors || 0;
    document.getElementById("statRetrievedChunks").textContent = stats.retrieved_chunks || 0;
    document.getElementById("statTotalQuestions").textContent = stats.total_questions_asked || 0;

    // 2. Update Active Document Display
    const doc = data.document_info;
    if (doc && doc.filename) {
        appState.pdfUploaded = true;
        sidebarFileName.textContent = doc.filename;
        if (fileName) {
            fileName.textContent = `✓ ${doc.filename} | ${doc.chunks} chunks indexed`;
        }
    }

    // 3. Update Stages Status Indicators in Sidebar & Flowchart
    (data.stages || []).forEach(stage => {
        const id = stage.id;
        const status = stage.status || "pending";

        // Dot in sidebar
        const dot = document.getElementById(`stageDot-${id}`);
        if (dot) {
            dot.className = `step-status status-${status}`;
        }

        // Flowchart node
        const flowNode = document.getElementById(`flowNode-${id}`);
        if (flowNode) {
            flowNode.classList.toggle("completed", status === "completed");
            flowNode.classList.toggle("status-processing", status === "processing");
        }
    });

    // Refresh active stage
    selectStage(appState.currentStage);
}


// ==============================================================================
// STAGE SELECTION & DYNAMIC RENDERING
// ==============================================================================

async function selectStage(stageId) {
    if (stageId < 1 || stageId > 16) return;
    appState.currentStage = stageId;

    // If currently in chat view, switch to dashboard
    if (appState.viewMode !== "dashboard") {
        setViewMode("dashboard");
    }

    // Update active class on sidebar
    document.querySelectorAll(".pipeline-item").forEach(item => {
        const id = parseInt(item.getAttribute("data-stage"), 10);
        item.classList.toggle("active", id === stageId);
    });

    // Update active class on flowchart
    document.querySelectorAll(".flow-node").forEach(node => {
        const id = parseInt(node.getAttribute("data-stage"), 10);
        node.classList.toggle("active", id === stageId);
    });

    // Update Header
    const meta = STAGE_META[stageId];
    document.getElementById("currentStageBadge").textContent = `Stage ${stageId.toString().padStart(2, "0")} of 16`;
    document.getElementById("currentStageTitle").textContent = meta.title;
    document.getElementById("currentStageDesc").textContent = meta.desc;
    document.getElementById("currentStageMechanism").textContent = meta.mechanism;

    document.getElementById("btnPrevStage").disabled = (stageId === 1);
    document.getElementById("btnNextStage").disabled = (stageId === 16);

    // Fetch actual stage data from backend
    renderStageContent(stageId);
}

async function renderStageContent(stageId) {
    const container = document.getElementById("stageContentBody");
    container.innerHTML = `<div style="text-align: center; padding: 30px; color: #888;">⏳ Loading stage ${stageId} details...</div>`;

    try {
        const res = await fetch(`/api/pipeline/stage/${stageId}`);
        if (!res.ok) throw new Error("Stage data not available");
        const stageObj = await res.json();

        // Update timing & status pills
        const timingEl = document.getElementById("currentStageTiming");
        const statusEl = document.getElementById("currentStageStatusPill");

        const timeMs = stageObj.execution_time_ms !== null ? `${stageObj.execution_time_ms} ms` : "--";
        timingEl.textContent = `⚡ Execution: ${timeMs}`;

        const status = stageObj.status || "pending";
        statusEl.className = `stage-status-pill status-${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);

        const data = stageObj.data;
        if (!data && status === "pending" && stageId !== 1) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #64748b;">
                    <div style="font-size: 36px; margin-bottom: 10px;">⏳</div>
                    <h4 style="font-size: 15px; font-weight: 700; color: #202123; margin-bottom: 6px;">Stage Not Executed Yet</h4>
                    <p style="font-size: 13px; max-width: 480px; margin: 0 auto 16px;">
                        ${stageId <= 8 ? "Please upload or load a PDF document to run Document Indexing stages 1 to 8." : "Submit a question using the input bar below to run Question Answering stages 9 to 16."}
                    </p>
                    ${stageId <= 8 ? `<label for="globalPdfInput" class="topbar-btn primary" style="cursor: pointer; display: inline-flex;">Upload PDF Document</label>` : `<button class="topbar-btn primary" onclick="document.getElementById('userInput').focus()">Ask a Question</button>`}
                </div>
            `;
            return;
        }

        switch (stageId) {
            case 1: renderStage1(container, data); break;
            case 2: renderStage2(container, data); break;
            case 3: renderStage3(container, data); break;
            case 4: renderStage4(container, data); break;
            case 5: renderStage5(container, data); break;
            case 6: renderStage6(container, data); break;
            case 7: renderStage7(container, data); break;
            case 8: renderStage8(container, data); break;
            case 9: renderStage9(container, data); break;
            case 10: renderStage10(container, data); break;
            case 11: renderStage11(container, data); break;
            case 12: renderStage12(container, data); break;
            case 13: renderStage13(container, data); break;
            case 14: renderStage14(container, data); break;
            case 15: renderStage15(container, data); break;
            case 16: renderStage16(container, data); break;
            default: container.innerHTML = `<p>Unknown Stage ${stageId}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color: #ef4444; padding: 20px;">Failed to load stage data: ${err.message}</p>`;
    }
}


// ------------------------------------------------------------------------------
// STAGE RENDERERS
// ------------------------------------------------------------------------------

function renderStage1(container, data) {
    const hasData = data && data.filename;
    container.innerHTML = `
        <div class="upload-box" id="stage1Dropzone" onclick="document.getElementById('globalPdfInput').click();" style="background: white; border: 2px dashed #b9c3c8; border-radius: 12px; padding: 32px 20px; text-align: center; cursor: pointer; margin-bottom: 20px; transition: 0.2s;">
            <div style="font-size: 38px; color: var(--accent-green); margin-bottom: 8px;">📤</div>
            <h3 style="font-size: 16px; font-weight: 700; color: var(--text-dark); margin-bottom: 4px;">Upload PDF Document for RAG Processing</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">Click the button below to browse, or drag & drop your PDF file here</p>
            <button type="button" class="upload-button" onclick="event.stopPropagation(); document.getElementById('globalPdfInput').click();" style="cursor: pointer; display: inline-block; padding: 12px 26px; font-size: 13px;">
                Upload PDF Document
            </button>
            <p id="stage1FileName" style="margin-top: 14px; font-size: 12px; color: var(--accent-green); font-weight: 600;">
                ${hasData ? `✓ Current Document: ${data.filename} (${data.file_size_formatted})` : 'No file selected'}
            </p>
        </div>

        ${hasData ? `
            <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <table class="records-table">
                    <thead>
                        <tr>
                            <th>Uploaded Filename</th>
                            <th>Formatted Size</th>
                            <th>Exact Bytes</th>
                            <th>Upload Timestamp</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="font-weight: 700; color: var(--primary);">${data.filename}</td>
                            <td>${data.file_size_formatted}</td>
                            <td style="font-family: var(--font-mono);">${data.file_size_bytes.toLocaleString()} bytes</td>
                            <td>${data.upload_time}</td>
                            <td><span style="color: var(--accent-green); font-weight: 700;">✓ Ready</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div style="border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden;">
                <div style="padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid var(--border-color); font-size: 13px; font-weight: 700;">
                    📄 Live PDF Preview: ${data.filename}
                </div>
                <iframe src="${data.preview_url}" style="width: 100%; height: 420px; border: none; background: white;"></iframe>
            </div>
        ` : ''}
    `;

    const dropzone = document.getElementById("stage1Dropzone");
    if (dropzone) {
        dropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "var(--accent-green)";
            dropzone.style.background = "#f0fdf4";
        });
        dropzone.addEventListener("dragleave", () => {
            dropzone.style.borderColor = "#b9c3c8";
            dropzone.style.background = "#ffffff";
        });
        dropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzone.style.borderColor = "#b9c3c8";
            dropzone.style.background = "#ffffff";
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
            }
        });
        dropzone.addEventListener("click", (e) => {
            if (e.target.tagName !== "LABEL") {
                const gInput = document.getElementById("globalPdfInput");
                if (gInput) gInput.click();
            }
        });
    }
}

function renderStage2(container, data) {
    container.innerHTML = `
        <div class="check-grid">
            <div class="check-card">
                <div class="check-icon">✓</div>
                <div>
                    <div class="check-label">File Extension Check</div>
                    <div class="check-sub">Verified extension: <code>${data.file_extension}</code></div>
                </div>
            </div>
            <div class="check-card">
                <div class="check-icon">✓</div>
                <div>
                    <div class="check-label">MIME Content Type</div>
                    <div class="check-sub">Verified MIME: <code>${data.mime_type}</code></div>
                </div>
            </div>
            <div class="check-card">
                <div class="check-icon">✓</div>
                <div>
                    <div class="check-label">Magic Bytes Signature</div>
                    <div class="check-sub">Header starts with: <code>${data.header_snippet}</code></div>
                </div>
            </div>
            <div class="check-card">
                <div class="check-icon">✓</div>
                <div>
                    <div class="check-label">File Size Boundary</div>
                    <div class="check-sub">${data.file_size_formatted} (Under 20 MB ceiling)</div>
                </div>
            </div>
        </div>

        <div style="background: var(--accent-green-light); border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #166534; font-weight: 600;">
            🛡️ Validation Status: ${data.validation_status} — 100% format checks passed.
        </div>
    `;
}

function renderStage3(container, data) {
    container.innerHTML = `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 18px; margin-bottom: 14px;">
            <div style="display: flex; gap: 24px; font-size: 13px;">
                <div><strong>Parser Engine:</strong> <code>${data.loader_engine}</code></div>
                <div><strong>Total Loaded Pages:</strong> ${data.total_pages} pages</div>
                <div><strong>Status:</strong> <span style="color: var(--accent-green); font-weight: 700;">${data.parsing_status}</span></div>
            </div>
        </div>
        <p style="font-size: 13px; color: var(--text-muted);">
            PyPDFLoader reads the document stream into a collection of Document objects, preserving page numbers in document metadata.
        </p>
    `;
}

function renderStage4(container, data) {
    const pages = data.pages || [];
    const activePage = pages[appState.activePageNum - 1] || pages[0];

    const tabsHtml = pages.map(p => `
        <button class="page-tab-item ${p.page_number === appState.activePageNum ? 'active' : ''}" onclick="switchPageTab(${p.page_number})">
            Page ${p.page_number} (${p.char_count} chars)
        </button>
    `).join("");

    container.innerHTML = `
        <div style="display: flex; gap: 16px; margin-bottom: 14px; font-size: 13px;">
            <div><strong>Total Pages Extracted:</strong> ${data.total_pages}</div>
            <div><strong>Total Extracted Characters:</strong> ${data.total_extracted_characters.toLocaleString()} chars</div>
        </div>

        <div class="page-tabs-bar">
            ${tabsHtml}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <h4 style="font-size: 13px; font-weight: 700;">Extracted Text from Page ${activePage.page_number} (${activePage.char_count} characters)</h4>
            <button class="btn-copy" onclick="copyText(document.getElementById('activePageText').textContent)">
                📋 Copy Page Text
            </button>
        </div>

        <div class="monospaced-text-box" id="activePageText">${escapeHtml(activePage.content)}</div>
    `;
}

window.switchPageTab = function (pageNum) {
    appState.activePageNum = pageNum;
    renderStageContent(4);
};

function renderStage5(container, data) {
    const opsList = (data.cleaning_operations || []).map(op => `
        <li style="margin-bottom: 6px; font-size: 13px;">✓ ${op}</li>
    `).join("");

    container.innerHTML = `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 14px;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Actual Operations Performed:</h4>
            <ul style="list-style: none; padding-left: 0; color: #334155;">
                ${opsList}
            </ul>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div>
                <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Raw Stream Sample:</h4>
                <div class="monospaced-text-box" style="max-height: 200px;">${escapeHtml(data.sample_input)}</div>
            </div>
            <div>
                <h4 style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Preprocessed Stream Sample:</h4>
                <div class="monospaced-text-box" style="max-height: 200px;">${escapeHtml(data.sample_output)}</div>
            </div>
        </div>
    `;
}

function renderStage6(container, data) {
    fetchChunks(container, data);
}

async function fetchChunks(container, stageData) {
    const res = await fetch(`/api/pipeline/chunks?page=${appState.chunkPage}&per_page=${appState.chunkPerPage}&search=${encodeURIComponent(appState.chunkSearchTerm)}`);
    const paged = await res.json();

    const chunkCards = (paged.chunks || []).map(chunk => {
        let text = escapeHtml(chunk.content);
        if (chunk.overlap_prev && text.includes(escapeHtml(chunk.overlap_prev))) {
            const escapedOv = escapeHtml(chunk.overlap_prev);
            text = text.replace(escapedOv, `<span class="overlap-highlight" title="Overlapping from previous chunk">${escapedOv}</span>`);
        }

        return `
            <div class="chunk-card-item">
                <div class="chunk-card-header" onclick="jumpToEmbedding(${chunk.chunk_number})">
                    <div>
                        <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 700; background: var(--text-dark); color: white; padding: 2px 6px; border-radius: 4px;">Chunk ${chunk.chunk_number}</span>
                        <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">Page ${chunk.page_number}</span>
                        <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">${chunk.char_count} chars</span>
                        ${chunk.has_overlap ? `<span class="overlap-pill">Overlap: ${chunk.overlap_prev.length} chars</span>` : ''}
                    </div>
                    <span style="font-size: 11px; color: var(--primary); font-weight: 600;">Inspect Embedding →</span>
                </div>
                <div class="chunk-card-body">${text}</div>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div style="display: flex; gap: 16px; margin-bottom: 14px; font-size: 12px; flex-wrap: wrap;">
            <div><strong>Technique:</strong> RecursiveCharacterTextSplitter</div>
            <div><strong>Chunk Size:</strong> 1000 characters</div>
            <div><strong>Overlap:</strong> 200 characters</div>
            <div><strong>Total Chunks:</strong> ${stageData.total_chunks} chunks</div>
        </div>

        <div class="chunks-filter-bar">
            <input type="text" class="chunk-search-field" id="chunkSearchInput" placeholder="Search chunk content..." value="${escapeHtml(appState.chunkSearchTerm)}">
            <div style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 8px;">
                <span>Page ${paged.page} of ${paged.total_pages} (${paged.total} chunks)</span>
                <button class="nav-arrow-btn" ${paged.page <= 1 ? 'disabled' : ''} onclick="changeChunkPage(-1)">← Prev</button>
                <button class="nav-arrow-btn" ${paged.page >= paged.total_pages ? 'disabled' : ''} onclick="changeChunkPage(1)">Next →</button>
            </div>
        </div>

        <div>${chunkCards || '<p style="color: #888; padding: 20px;">No chunks match your search query.</p>'}</div>
    `;

    document.getElementById("chunkSearchInput").addEventListener("input", (e) => {
        appState.chunkSearchTerm = e.target.value;
        appState.chunkPage = 1;
        fetchChunks(container, stageData);
    });
}

window.changeChunkPage = function (delta) {
    appState.chunkPage += delta;
    selectStage(6);
};

window.jumpToEmbedding = function (chunkNum) {
    appState.selectedChunkId = chunkNum;
    selectStage(7);
};

function renderStage7(container, data) {
    const list = data.chunk_embeddings || [];
    const selected = list.find(c => c.chunk_number === appState.selectedChunkId) || list[0] || {};
    const previewPills = (selected.preview_values || []).map(v => `
        <span class="vector-float-pill">${v > 0 ? '+' : ''}${v.toFixed(6)}</span>
    `).join("");

    const options = list.map(c => `
        <option value="${c.chunk_number}" ${c.chunk_number === selected.chunk_number ? 'selected' : ''}>
            Chunk ${c.chunk_number} (Page ${c.page_number}, ${c.char_count} chars)
        </option>
    `).join("");

    container.innerHTML = `
        <div style="display: flex; gap: 20px; font-size: 13px; margin-bottom: 14px;">
            <div><strong>Model:</strong> <code>${data.model}</code></div>
            <div><strong>Dimensions:</strong> ${data.dimension} float numbers</div>
            <div><strong>Total Vectors:</strong> ${data.total_embeddings}</div>
        </div>

        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <label style="font-size: 13px; font-weight: 700;">Select Chunk:</label>
                    <select id="embChunkDropdown" style="padding: 5px 10px; font-size: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        ${options}
                    </select>
                </div>
                <button class="btn-copy" onclick="openFullVectorModal(${selected.chunk_number})">
                    🔍 View Full 3072-d Vector
                </button>
            </div>

            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Original Chunk ${selected.chunk_number} Text:</div>
            <div class="monospaced-text-box" style="max-height: 120px; margin-bottom: 14px;">${escapeHtml(selected.preview_text)}</div>

            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Actual Numerical Vector (Sample 8 Values):</div>
            <div class="vector-preview-grid">
                ${previewPills}
                <span class="vector-float-pill" style="background: transparent; color: #94a3b8;">... + ${data.dimension - 8} more float numbers</span>
            </div>
        </div>
    `;

    document.getElementById("embChunkDropdown").addEventListener("change", (e) => {
        appState.selectedChunkId = parseInt(e.target.value, 10);
        renderStageContent(7);
    });
}

function renderStage8(container, data) {
    const rows = (data.stored_records || []).map(r => `
        <tr>
            <td style="font-family: var(--font-mono); color: var(--primary);">${r.record_id.substring(0, 14)}...</td>
            <td><strong style="background: var(--text-dark); color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Chunk ${r.chunk_number}</strong></td>
            <td>Page ${r.page}</td>
            <td style="font-family: var(--font-mono);">${r.dimension} dims</td>
            <td style="color: var(--text-muted); font-size: 11px;">${escapeHtml(r.text_snippet)}...</td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div style="display: flex; gap: 20px; font-size: 13px; margin-bottom: 14px;">
            <div><strong>Vector Database:</strong> ${data.vector_database}</div>
            <div><strong>Collection:</strong> <code>${data.collection_name}</code></div>
            <div><strong>Metric:</strong> ${data.distance_metric}</div>
            <div><strong>Stored Vectors:</strong> ${data.stored_vectors_count}</div>
        </div>

        <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; margin-bottom: 14px; font-size: 12px; font-family: var(--font-mono); display: flex; align-items: center; gap: 8px;">
            <span>Raw Text Chunk</span>
            <span>➔</span>
            <span>Gemini 3072d Dense Vector</span>
            <span>➔</span>
            <span>ChromaDB Persistent Index</span>
        </div>

        <table class="records-table">
            <thead>
                <tr>
                    <th>Chroma Record UUID</th>
                    <th>Chunk ID</th>
                    <th>Page</th>
                    <th>Dimensions</th>
                    <th>Text Excerpt</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

function renderStage9(container, data) {
    container.innerHTML = `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 18px; margin-bottom: 14px;">
            <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Submitted User Question:</div>
            <div style="font-size: 16px; font-weight: 700; color: var(--primary); margin-bottom: 10px;">"${escapeHtml(data.question)}"</div>
            <div style="font-size: 12px; color: var(--text-muted); display: flex; gap: 16px;">
                <span>Characters: ${data.char_count}</span>
                <span>Words: ${data.word_count}</span>
                <span>Submitted At: ${data.timestamp}</span>
            </div>
        </div>
    `;
}

function renderStage10(container, data) {
    const vec = data.query_vector || [];
    const previewPills = (data.preview_values || vec.slice(0, 10)).map(v => `
        <span class="vector-float-pill">${v > 0 ? '+' : ''}${v.toFixed(6)}</span>
    `).join("");

    container.innerHTML = `
        <div style="display: flex; gap: 20px; font-size: 13px; margin-bottom: 14px;">
            <div><strong>Model:</strong> <code>${data.model}</code></div>
            <div><strong>Vector Dimension:</strong> ${data.dimension} floats</div>
            <div><strong>Range:</strong> [${data.vector_min}, ${data.vector_max}]</div>
        </div>

        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <h4 style="font-size: 12px; font-weight: 700; color: var(--text-muted);">Question Embedding Vector:</h4>
                <button class="btn-copy" onclick="copyText(JSON.stringify(${JSON.stringify(vec)}))">
                    📋 Copy Full Query Vector
                </button>
            </div>
            <div class="vector-preview-grid">
                ${previewPills}
                <span class="vector-float-pill" style="background: transparent; color: #94a3b8;">... + ${data.dimension - 10} more floats</span>
            </div>
        </div>
    `;
}

function renderStage11(container, data) {
    const rows = (data.results || []).map(r => `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <span class="rank-badge rank-${r.rank}">Rank #${r.rank}</span>
                <strong style="margin-left: 8px; font-size: 13px;">${r.page_label}</strong>
                <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-left: 8px;">Distance: ${r.distance_score}</span>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${escapeHtml(r.preview)}</p>
            </div>
            <div style="text-align: right; width: 120px;">
                <strong style="color: var(--primary); font-size: 13px;">${r.relevance_pct}% match</strong>
            </div>
        </div>
    `).join("");

    container.innerHTML = `
        <div style="font-size: 13px; margin-bottom: 12px;">
            <strong>Search Method:</strong> <code>${data.search_method}</code> | <strong>Top-k:</strong> ${data.top_k}
        </div>
        <div>${rows}</div>
    `;
}

function renderStage12(container, data) {
    const cards = (data.chunks || []).map(c => `
        <div class="chunk-card-item">
            <div class="chunk-card-header">
                <div>
                    <span class="rank-badge rank-${c.rank}">Rank #${c.rank} Match</span>
                    <strong style="margin-left: 8px;">${c.page_label}</strong>
                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-left: 8px;">Distance: ${c.distance_score}</span>
                </div>
                <button class="btn-copy" onclick="copyText(this.parentElement.nextElementSibling.textContent)">
                    📋 Copy Chunk Text
                </button>
            </div>
            <div class="chunk-card-body">${escapeHtml(c.content)}</div>
        </div>
    `).join("");

    container.innerHTML = `
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Displaying the top <strong>${data.k}</strong> document chunks retrieved from ChromaDB:</p>
        <div>${cards}</div>
    `;
}

function renderStage13(container, data) {
    container.innerHTML = `
        <div style="display: flex; gap: 20px; font-size: 13px; margin-bottom: 12px;">
            <div><strong>Chunks Merged:</strong> ${data.chunks_assembled}</div>
            <div><strong>Total Characters:</strong> ${data.context_characters}</div>
            <div><strong>Total Words:</strong> ${data.context_words}</div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <h4 style="font-size: 13px; font-weight: 700;">Complete Assembled Context passed to LLM:</h4>
            <button class="btn-copy" onclick="copyText(document.getElementById('assembledContextText').textContent)">
                📋 Copy Context
            </button>
        </div>

        <div class="monospaced-text-box" id="assembledContextText">${escapeHtml(data.assembled_context)}</div>
    `;
}

function renderStage14(container, data) {
    const rules = (data.system_instructions || []).map(r => `<li>✓ ${r}</li>`).join("");

    container.innerHTML = `
        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 14px;">
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">System Instructions Breakdown:</h4>
            <ul style="list-style: none; padding-left: 0; font-size: 12px; color: #475569;">${rules}</ul>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <h4 style="font-size: 13px; font-weight: 700;">Final Constructed Prompt (Sent to Gemini):</h4>
            <button class="btn-copy" onclick="copyText(document.getElementById('constructedPromptText').textContent)">
                📋 Copy Complete Prompt
            </button>
        </div>

        <div class="monospaced-text-box" id="constructedPromptText">${escapeHtml(data.constructed_prompt)}</div>
    `;
}

function renderStage15(container, data) {
    container.innerHTML = `
        <div style="display: flex; gap: 24px; font-size: 13px; margin-bottom: 14px;">
            <div><strong>Provider:</strong> ${data.provider}</div>
            <div><strong>Chat Model:</strong> <code>${data.chat_model}</code></div>
            <div><strong>Execution Latency:</strong> ⚡ ${data.execution_time_ms} ms</div>
            <div><strong>Status:</strong> <span style="color: var(--accent-green); font-weight: 700;">${data.response_status}</span></div>
        </div>

        <div style="background: white; border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
            <div style="font-size: 13px; font-weight: 700; margin-bottom: 6px;">Token & Ingestion Metrics:</div>
            <div style="font-size: 12px; color: var(--text-muted);">
                Prompt Length: <strong>${data.input_length}</strong> characters | Generated Output: <strong>${data.output_length}</strong> characters
            </div>
        </div>
    `;
}

function renderStage16(container, data) {
    let renderedAnswer = escapeHtml(data.final_answer);
    if (window.marked && window.DOMPurify) {
        renderedAnswer = DOMPurify.sanitize(marked.parse(data.final_answer || ""));
    }

    const sources = (data.sources || []).map((s, idx) => `
        <div class="source-item">
            <strong style="color: var(--primary);">Source #${idx + 1} | Page ${s.page}:</strong>
            <p style="margin-top: 2px;">"${escapeHtml(s.content)}"</p>
        </div>
    `).join("");

    container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="font-size: 12px; color: var(--text-muted);">Generated in <strong>${data.total_execution_time_ms} ms</strong></div>
            <button class="btn-copy" onclick="copyText(document.getElementById('rawAnsText').textContent)">
                📋 Copy Final Answer
            </button>
        </div>

        <div class="bot-message" style="margin: 0 0 16px 0;">
            <div class="message-content" style="box-shadow: none;">${renderedAnswer}</div>
        </div>

        <div id="rawAnsText" style="display: none;">${escapeHtml(data.final_answer)}</div>

        ${sources ? `
            <div class="sources-box">
                <h4>📚 Document Citations & Page References (${data.total_sources} Sources Cited):</h4>
                ${sources}
            </div>
        ` : ''}
    `;
}


// ==============================================================================
// ACTIONS & API HANDLERS
// ==============================================================================

window.handleFileUpload = handleFileUpload;
window.loadSampleDocument = loadSampleDocument;

async function handleFileUpload(file) {
    if (!file || appState.isProcessing) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("Please select a valid PDF file.");
        return;
    }

    appState.isProcessing = true;
    updateStatus("Processing PDF...", "loading");

    const upBtn = document.getElementById("uploadBtn");
    if (upBtn) upBtn.textContent = "Processing PDF...";

    const fnEl = document.getElementById("fileName");
    if (fnEl) fnEl.textContent = `Uploading and processing ${file.name}...`;

    const s1Fn = document.getElementById("stage1FileName");
    if (s1Fn) s1Fn.textContent = `Uploading and processing ${file.name}...`;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Upload failed");

        appState.pdfUploaded = true;
        sidebarFileName.textContent = result.filename;
        if (fileName) {
            fileName.textContent = `✓ ${result.filename} | ${result.chunks} chunks processed`;
        }

        updateStatus("Document Ready", "ready");
        await refreshPipelineData();
        selectStage(6); // Jump to Text Chunking
    } catch (err) {
        alert("Upload error: " + err.message);
        updateStatus("Upload Failed", "error");
        if (fileName) {
            fileName.textContent = "Upload failed: " + err.message;
        }
    } finally {
        appState.isProcessing = false;
        if (upBtn) upBtn.textContent = "Upload PDF Document";
        const gInput = document.getElementById("globalPdfInput");
        if (gInput) gInput.value = "";
        const pInput = document.getElementById("pdfInput");
        if (pInput) pInput.value = "";
    }
}

async function loadSampleDocument() {
    if (appState.isProcessing) return;
    appState.isProcessing = true;
    updateStatus("Loading sample ml.pdf...", "loading");

    try {
        const res = await fetch("/api/load-sample", { method: "POST" });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to load sample");

        appState.pdfUploaded = true;
        sidebarFileName.textContent = result.filename;
        updateStatus("Document Ready", "ready");
        await refreshPipelineData();
        selectStage(6); // Jump to Text Chunking
    } catch (err) {
        alert("Sample load error: " + err.message);
        updateStatus("Error", "error");
    } finally {
        appState.isProcessing = false;
    }
}

async function handleSendMessage() {
    const question = userInput.value.trim();
    if (!question || appState.isProcessing) return;

    if (!appState.pdfUploaded) {
        alert("Please upload a PDF document before asking questions.");
        return;
    }

    // Hide welcome screen in chat mode
    if (welcome) welcome.style.display = "none";

    // Add user bubble in chat mode
    addUserMessage(question);

    userInput.value = "";
    userInput.style.height = "auto";
    appState.isProcessing = true;
    sendBtn.disabled = true;

    updateStatus("Generating Answer...", "loading");
    const loadingBubble = addLoadingMessage();

    try {
        const res = await fetch("/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question })
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to generate answer");

        // Format bot answer in chat
        if (loadingBubble) {
            loadingBubble.classList.remove("loading-text");
            const answer = result.answer || "No answer generated.";
            if (window.marked && window.DOMPurify) {
                loadingBubble.innerHTML = DOMPurify.sanitize(marked.parse(answer));
            } else {
                loadingBubble.textContent = answer;
            }
            displaySources(result.sources);
        }

        updateStatus("Ready", "ready");
        await refreshPipelineData();

        // If in dashboard mode, jump to stage 16 (Final Answer)
        if (appState.viewMode === "dashboard") {
            selectStage(16);
        }
    } catch (err) {
        if (loadingBubble) {
            loadingBubble.classList.remove("loading-text");
            loadingBubble.textContent = "Error: " + err.message;
        }
        updateStatus("Request Failed", "error");
    } finally {
        appState.isProcessing = false;
        sendBtn.disabled = false;
        userInput.focus();
    }
}

function handleNewChat() {
    if (appState.isProcessing) return;
    if (chatArea) {
        chatArea.innerHTML = "";
        if (welcome) {
            chatArea.appendChild(welcome);
            welcome.style.display = "block";
        }
    }
    userInput.value = "";
    userInput.style.height = "auto";
    updateStatus(appState.pdfUploaded ? "Document Ready" : "Ready", "ready");
}

function updateStatus(message, stateName = "ready") {
    if (!statusElement) return;
    statusElement.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = "status-dot";
    statusElement.appendChild(dot);
    statusElement.appendChild(document.createTextNode(message));

    if (stateName === "loading") {
        statusElement.style.color = "#b7791f";
        dot.style.background = "#d69e2e";
    } else if (stateName === "error") {
        statusElement.style.color = "#dc2626";
        dot.style.background = "#dc2626";
    } else {
        statusElement.style.color = "#0b9b70";
        dot.style.background = "#10a37f";
    }
}


// ==============================================================================
// CHAT MESSAGES DOM HELPERS
// ==============================================================================

function addUserMessage(message) {
    if (!chatArea) return;
    const msg = document.createElement("div");
    msg.className = "message user-message";
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = message;
    msg.appendChild(content);
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function addLoadingMessage() {
    if (!chatArea) return null;
    const msg = document.createElement("div");
    msg.className = "message bot-message";
    const content = document.createElement("div");
    content.className = "message-content loading-text";
    content.textContent = "✦ Analyzing document and generating answer...";
    msg.appendChild(content);
    chatArea.appendChild(msg);
    chatArea.scrollTop = chatArea.scrollHeight;
    return content;
}

function displaySources(sources) {
    if (!chatArea || !sources || sources.length === 0) return;
    const box = document.createElement("div");
    box.className = "sources-box";
    const heading = document.createElement("h4");
    heading.textContent = "📚 Sources from your document:";
    box.appendChild(heading);

    sources.forEach((s, idx) => {
        const item = document.createElement("div");
        item.className = "source-item";
        item.innerHTML = `<strong>Source ${idx + 1} | Page ${s.page}:</strong><p>${escapeHtml(s.content)}</p>`;
        box.appendChild(item);
    });
    chatArea.appendChild(box);
    chatArea.scrollTop = chatArea.scrollHeight;
}


// ==============================================================================
// MODAL & UTILITY FUNCTIONS
// ==============================================================================

async function openFullVectorModal(chunkId) {
    const modal = document.getElementById("vectorModal");
    modal.classList.add("open");
    document.getElementById("vectorModalTitle").textContent = `Chunk ${chunkId} Embedding Vector (3,072 Dimensions)`;
    document.getElementById("vectorModalCode").textContent = "Loading 3072-dimensional vector...";

    try {
        const res = await fetch(`/api/pipeline/embeddings?chunk_id=${chunkId}`);
        const data = await res.json();
        if (data.selected_vector && data.selected_vector.vector) {
            document.getElementById("vectorModalDim").textContent = data.selected_vector.dimension;
            document.getElementById("vectorModalCode").textContent = JSON.stringify(data.selected_vector.vector, null, 2);
        } else {
            document.getElementById("vectorModalCode").textContent = "Vector data not available.";
        }
    } catch (err) {
        document.getElementById("vectorModalCode").textContent = "Error: " + err.message;
    }
}

function copyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
