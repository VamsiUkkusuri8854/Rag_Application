
import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

from src.rag_pipeline import (
    process_pdf,
    ask_question,
    get_pipeline_status,
    get_pipeline_stage_data,
    get_pipeline_chunks,
    get_pipeline_embeddings,
    get_pipeline_retrieval,
    get_pipeline_metrics
)

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"pdf"}

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0

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
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)

        # Process PDF using LangChain & ChromaDB
        chunks = process_pdf(file_path)

        return jsonify({
            "message": "PDF uploaded and processed successfully!",
            "filename": filename,
            "chunks": chunks,
            "status": get_pipeline_status()
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


# ==============================================================================
# PIPELINE DASHBOARD API ENDPOINTS
# ==============================================================================

@app.route("/api/pipeline/status", methods=["GET"])
def api_pipeline_status():
    try:
        return jsonify(get_pipeline_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pipeline/stage/<int:stage_id>", methods=["GET"])
def api_pipeline_stage(stage_id):
    try:
        data = get_pipeline_stage_data(stage_id)
        if not data:
            return jsonify({"error": f"Stage {stage_id} not found"}), 404
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pipeline/chunks", methods=["GET"])
def api_pipeline_chunks():
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 10))
        search = request.args.get("search", "").strip()
        return jsonify(get_pipeline_chunks(page=page, per_page=per_page, search=search))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pipeline/embeddings", methods=["GET"])
def api_pipeline_embeddings():
    try:
        chunk_id = request.args.get("chunk_id", None)
        return jsonify(get_pipeline_embeddings(chunk_id=chunk_id))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pipeline/retrieval", methods=["GET"])
def api_pipeline_retrieval():
    try:
        return jsonify(get_pipeline_retrieval())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pipeline/metrics", methods=["GET"])
def api_pipeline_metrics():
    try:
        return jsonify(get_pipeline_metrics())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/pdf/<path:filename>", methods=["GET"])
def serve_pdf(filename):
    try:
        return send_from_directory(
            app.config["UPLOAD_FOLDER"],
            filename,
            mimetype="application/pdf"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/load-sample", methods=["POST"])
def load_sample():
    try:
        sample_path = os.path.join(app.config["UPLOAD_FOLDER"], "ml.pdf")
        if not os.path.exists(sample_path):
            return jsonify({"error": "Sample ml.pdf not found in uploads"}), 404

        chunks = process_pdf(sample_path)
        return jsonify({
            "message": "Sample PDF (ml.pdf) loaded successfully!",
            "filename": "ml.pdf",
            "chunks": chunks,
            "status": get_pipeline_status()
        })
    except Exception as e:
        app.logger.exception("Sample loading failed")
        return jsonify({"error": str(e)}), 500


# Handle large uploads
@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "PDF exceeds the 20 MB limit"}), 413


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
