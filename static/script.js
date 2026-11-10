
// ============================================
// 1. GET HTML ELEMENTS
// ============================================

const chatArea = document.getElementById("chatArea");
const userInput = document.getElementById("userInput");
const pdfInput = document.getElementById("pdfInput");
const welcome = document.getElementById("welcome");

const uploadBtn = document.getElementById("uploadBtn");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");

const fileName = document.getElementById("fileName");
const sidebarFileName = document.getElementById("sidebarFileName");
const statusElement = document.getElementById("status");


// ============================================
// 2. APPLICATION STATE
// ============================================

let pdfUploaded = false;
let isProcessing = false;
let uploadedFileName = "";


// ============================================
// 3. STATUS UPDATE
// ============================================

function updateStatus(message, state = "ready") {

    statusElement.innerHTML = "";

    const dot = document.createElement("span");
    dot.className = "status-dot";

    statusElement.appendChild(dot);
    statusElement.appendChild(
        document.createTextNode(message)
    );

    if (state === "loading") {
        statusElement.style.color = "#b7791f";
        dot.style.background = "#d69e2e";
    } else if (state === "error") {
        statusElement.style.color = "#dc2626";
        dot.style.background = "#dc2626";
    } else {
        statusElement.style.color = "#0b9b70";
        dot.style.background = "#10a37f";
    }
}


// ============================================
// 4. PDF UPLOAD BUTTON
// ============================================

uploadBtn.addEventListener("click", () => {
    if (!uploadBtn.disabled) {
        pdfInput.click();
    }
});


// ============================================
// 5. PDF UPLOAD FUNCTION
// ============================================

pdfInput.addEventListener("change", async function () {

    const file = this.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
        alert("Please select a valid PDF file.");
        this.value = "";
        return;
    }

    if (file.size === 0) {
        alert("The selected PDF file is empty.");
        this.value = "";
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Processing PDF...";

    fileName.textContent = "Uploading and processing PDF...";
    updateStatus("Processing PDF", "loading");

    try {

        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "PDF upload failed."
            );
        }

        pdfUploaded = true;
        uploadedFileName = result.filename || file.name;

        fileName.textContent =
            "✓ " + uploadedFileName +
            " | " + result.chunks + " chunks processed";

        sidebarFileName.textContent = uploadedFileName;

        updateStatus("Document Ready", "ready");

        addSystemMessage(
            "Your PDF has been uploaded and processed successfully. You can now ask questions about the document."
        );

    } catch (error) {

        pdfUploaded = false;

        fileName.textContent = "Upload failed";

        updateStatus("Upload Failed", "error");

        addSystemMessage(
            "PDF upload failed: " + error.message
        );

    } finally {

        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload PDF Document";

        // Allow selecting the same file again if needed.
        pdfInput.value = "";

    }

});


// ============================================
// 6. ADD USER MESSAGE
// ============================================

function addUserMessage(message) {

    const messageDiv = document.createElement("div");
    messageDiv.className = "message user-message";

    const content = document.createElement("div");
    content.className = "message-content";

    content.textContent = message;

    messageDiv.appendChild(content);
    chatArea.appendChild(messageDiv);

    scrollToBottom();
}


// ============================================
// 7. ADD BOT MESSAGE WITH MARKDOWN
// ============================================

function addBotMessage(message) {

    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot-message";

    const content = document.createElement("div");
    content.className = "message-content";

    // Markdown formatting
    if (window.marked && window.DOMPurify) {

        const html = marked.parse(message || "");

        content.innerHTML = DOMPurify.sanitize(html);

    } else {

        // Safe fallback if CDN libraries are unavailable.
        content.textContent = message || "";

    }

    messageDiv.appendChild(content);
    chatArea.appendChild(messageDiv);

    scrollToBottom();

    return messageDiv;
}


// ============================================
// 8. ADD LOADING MESSAGE
// ============================================

function addLoadingMessage() {

    const messageDiv = document.createElement("div");
    messageDiv.className = "message bot-message";

    const content = document.createElement("div");

    content.className = "message-content loading-text";
    content.textContent = "✦ Analyzing your document...";

    messageDiv.appendChild(content);
    chatArea.appendChild(messageDiv);

    scrollToBottom();

    return content;
}


// ============================================
// 9. ADD SYSTEM MESSAGE
// ============================================

function addSystemMessage(message) {

    const div = document.createElement("div");
    div.className = "message bot-message";

    const content = document.createElement("div");
    content.className = "message-content";

    content.textContent = message;

    div.appendChild(content);
    chatArea.appendChild(div);

    scrollToBottom();
}


// ============================================
// 10. DISPLAY SOURCE REFERENCES
// ============================================

function displaySources(sources) {

    if (!sources || sources.length === 0) {
        return;
    }

    const sourcesBox = document.createElement("div");
    sourcesBox.className = "sources-box";

    const heading = document.createElement("h4");
    heading.textContent = "📚 Sources from your document";

    sourcesBox.appendChild(heading);

    sources.forEach((source, index) => {

        const item = document.createElement("div");
        item.className = "source-item";

        const title = document.createElement("strong");

        title.textContent =
            "Source " + (index + 1) +
            " | Page " + source.page;

        const description = document.createElement("p");

        // Use textContent to safely display document text.
        description.textContent = source.content || "";

        item.appendChild(title);
        item.appendChild(description);

        sourcesBox.appendChild(item);

    });

    chatArea.appendChild(sourcesBox);

    scrollToBottom();
}


// ============================================
// 11. SEND QUESTION TO FLASK BACKEND
// ============================================

async function sendMessage() {

    const question = userInput.value.trim();

    if (!question || isProcessing) {
        return;
    }

    if (!pdfUploaded) {

        addSystemMessage(
            "Please upload a PDF document before asking questions."
        );

        return;
    }

    // Hide welcome screen
    welcome.style.display = "none";

    // Display user question
    addUserMessage(question);

    userInput.value = "";
    userInput.style.height = "auto";

    isProcessing = true;
    sendBtn.disabled = true;

    updateStatus("Generating Answer", "loading");

    const loadingMessage = addLoadingMessage();

    try {

        const response = await fetch("/ask", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                question: question
            })

        });

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.error || "Unable to generate answer."
            );

        }

        // Replace loading message with formatted answer.
        loadingMessage.classList.remove("loading-text");

        const answer = result.answer || "No answer was generated.";

        if (window.marked && window.DOMPurify) {

            loadingMessage.innerHTML = DOMPurify.sanitize(
                marked.parse(answer)
            );

        } else {

            loadingMessage.textContent = answer;

        }

        // Display source references
        displaySources(result.sources);

        updateStatus("Ready", "ready");

    } catch (error) {

        loadingMessage.classList.remove("loading-text");

        loadingMessage.textContent =
            "Sorry, something went wrong.\n\n" + error.message;

        updateStatus("Request Failed", "error");

    } finally {

        isProcessing = false;
        sendBtn.disabled = false;

        userInput.focus();

        scrollToBottom();

    }

}


// ============================================
// 12. ENTER KEY TO SEND MESSAGE
// ============================================

userInput.addEventListener("keydown", function (event) {

    if (
        event.key === "Enter" &&
        !event.shiftKey
    ) {

        event.preventDefault();

        sendMessage();

    }

});


// ============================================
// 13. AUTO RESIZE TEXTAREA
// ============================================

userInput.addEventListener("input", function () {

    this.style.height = "auto";

    this.style.height =
        Math.min(this.scrollHeight, 150) + "px";

});


// ============================================
// 14. NEW CHAT
// ============================================

newChatBtn.addEventListener("click", newChat);

function newChat() {

    if (isProcessing) {
        return;
    }

    // Clear previous conversation.
    chatArea.innerHTML = "";

    // Restore welcome screen.
    chatArea.appendChild(welcome);

    welcome.style.display = "block";

    userInput.value = "";
    userInput.style.height = "auto";

    updateStatus(
        pdfUploaded ? "Document Ready" : "Ready",
        "ready"
    );

    // Keep uploaded PDF available for new questions.
    scrollToBottom();

}


// ============================================
// 15. SCROLL TO LATEST MESSAGE
// ============================================

function scrollToBottom() {

    chatArea.scrollTop = chatArea.scrollHeight;

}


// ============================================
// 16. SUGGESTION CLICK HANDLERS
// ============================================

document.querySelectorAll(".suggestion").forEach(item => {

    item.addEventListener("click", function () {

        const suggestion = this.textContent.trim()
            .replace(/^✦\s*/, "");

        userInput.value = suggestion;

        userInput.focus();

    });

});


// ============================================
// 17. INITIALIZATION
// ============================================

updateStatus("Ready", "ready");

console.log("RAG Assistant frontend initialized successfully!");
