
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename

from src.rag_pipeline import process_pdf, ask_question

import os

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# Home page
@app.route("/")
def home():
    return render_template("index.html")


# Check file extension
def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


# PDF upload API
@app.route("/upload", methods=["POST"])
def upload_pdf():

    if "file" not in request.files:
        return jsonify({"error": "No file selected"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "Please select a PDF"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "Only PDF files are allowed"}), 400

    try:
        filename = secure_filename(file.filename)

        file_path = os.path.join(
            app.config["UPLOAD_FOLDER"],
            filename
        )

        file.save(file_path)

        # Process PDF using LangChain
        chunks = process_pdf(file_path)

        return jsonify({
            "message": "PDF uploaded and processed successfully!",
            "filename": filename,
            "chunks": chunks
        })

    except Exception as e:
        app.logger.exception("PDF processing failed")
        return jsonify({"error": str(e)}), 500


# Ask question API
@app.route("/ask", methods=["POST"])
def ask():

    data = request.get_json(silent=True) or {}

    question = data.get("question", "").strip()

    if not question:
        return jsonify({"error": "Question cannot be empty"}), 400

    try:
        result = ask_question(question)

        return jsonify(result)

    except Exception as e:
        app.logger.exception("Question processing failed")
        return jsonify({"error": str(e)}), 500


# Handle large uploads
@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "PDF exceeds the 20 MB limit"}), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
