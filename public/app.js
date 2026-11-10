const sessionId = crypto.randomUUID();
const pdfInput = document.querySelector("#pdf-input");
const dropZone = document.querySelector("#drop-zone");
const documentCard = document.querySelector("#document-card");
const documentName = document.querySelector("#document-name");
const documentPages = document.querySelector("#document-pages");
const messages = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const chatForm = document.querySelector("#chat-form");
const questionInput = document.querySelector("#question-input");
const sendButton = document.querySelector("#send-button");
const errorBanner = document.querySelector("#error-banner");
const chooseFileButton = document.querySelector("#choose-file");
const removeDocumentButton = document.querySelector("#remove-document");

let isBusy = false;
let hasDocument = false;

function setError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.remove("hidden");
}

function clearError() {
  errorBanner.textContent = "";
  errorBanner.classList.add("hidden");
}

function setBusy(busy) {
  isBusy = busy;
  questionInput.disabled = busy || !hasDocument;
  sendButton.disabled = busy || !hasDocument || !questionInput.value.trim();
  chooseFileButton.disabled = busy;
  removeDocumentButton.disabled = busy;
  document.querySelectorAll(".suggestion").forEach((button) => {
    button.disabled = busy || !hasDocument;
  });
}

function addMessage(role, text, options = {}) {
  welcome.classList.add("hidden");
  const message = document.createElement("div");
  message.className = `message ${role}${options.typing ? " typing" : ""}`;

  if (role === "assistant") {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "✦";
    message.append(avatar);
  }

  const content = document.createElement("div");
  content.className = "message-content";
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "YOU" : "PAPERTRAIL";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (options.typing) {
    for (let index = 0; index < 3; index += 1) {
      const dot = document.createElement("span");
      dot.className = "typing-dot";
      bubble.append(dot);
    }
  } else {
    bubble.textContent = text;
  }

  content.append(label, bubble);
  if (options.sources) {
    const sources = document.createElement("div");
    sources.className = "message-sources";
    sources.textContent = options.sources;
    content.append(sources);
  }
  message.append(content);
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

async function uploadPdf(file) {
  clearError();
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    setError("Please choose a PDF file.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setError("The PDF is too large. Maximum file size is 10 MB.");
    return;
  }

  setBusy(true);
  dropZone.classList.add("uploading");
  const previousUploadText = dropZone.querySelector("h2").textContent;
  dropZone.querySelector("h2").textContent = "Reading your PDF...";
  try {
    const formData = new FormData();
    formData.append("pdf", file);
    const response = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-session-id": sessionId },
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not read this PDF.");

    messages.querySelectorAll(".message").forEach((message) => message.remove());
    welcome.classList.remove("hidden");
    documentName.textContent = result.fileName;
    documentPages.textContent = `${result.pageCount} ${result.pageCount === 1 ? "page" : "pages"} · Ready to chat`;
    documentCard.classList.remove("hidden");
    dropZone.classList.add("hidden");
    hasDocument = true;
    questionInput.placeholder = "Ask anything about your PDF...";
    setBusy(false);
    questionInput.focus();
  } catch (error) {
    setError(error.message);
  } finally {
    dropZone.classList.remove("uploading");
    dropZone.querySelector("h2").textContent = previousUploadText;
    setBusy(false);
  }
}

async function askQuestion(question) {
  if (isBusy || !hasDocument || !question.trim()) return;
  clearError();
  addMessage("user", question.trim());
  questionInput.value = "";
  questionInput.style.height = "auto";
  const typingMessage = addMessage("assistant", "", { typing: true });
  setBusy(true);
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-session-id": sessionId,
      },
      body: JSON.stringify({ question: question.trim() }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not get an answer.");
    typingMessage.remove();
    const citedSources = [...new Set(result.answer.match(/\[Source \d+\]/g) || [])];
    addMessage(
      "assistant",
      result.answer,
      citedSources.length ? { sources: `Based on ${citedSources.join(", ")}` } : {},
    );
  } catch (error) {
    typingMessage.remove();
    setError(error.message);
  } finally {
    setBusy(false);
    questionInput.focus();
  }
}

chooseFileButton.addEventListener("click", () => pdfInput.click());
pdfInput.addEventListener("change", () => {
  uploadPdf(pdfInput.files[0]);
  pdfInput.value = "";
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", (event) => {
  if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag-over");
});
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("drag-over");
  uploadPdf(event.dataTransfer.files[0]);
});

removeDocumentButton.addEventListener("click", async () => {
  clearError();
  setBusy(true);
  try {
    const response = await fetch("/api/document", {
      method: "DELETE",
      headers: { "x-session-id": sessionId },
    });
    if (!response.ok) throw new Error("Could not remove the PDF. Please try again.");
    documentCard.classList.add("hidden");
    dropZone.classList.remove("hidden");
    messages.querySelectorAll(".message").forEach((message) => message.remove());
    welcome.classList.remove("hidden");
    hasDocument = false;
    questionInput.value = "";
    questionInput.placeholder = "Upload a PDF to start asking questions...";
  } catch (error) {
    setError(error.message);
  } finally {
    setBusy(false);
  }
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askQuestion(questionInput.value);
});

questionInput.addEventListener("input", () => {
  questionInput.style.height = "auto";
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 100)}px`;
  sendButton.disabled = isBusy || !hasDocument || !questionInput.value.trim();
});

questionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => askQuestion(button.dataset.question));
});

setBusy(false);
