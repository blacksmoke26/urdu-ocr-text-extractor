"""
MCP Server for End-to-End Urdu OCR Backend API.

Exposes all backend API endpoints as MCP tools, resources, and prompts.
Transport: stdio (for Claude Desktop / local hosts) or streamable-http (for remote).

Usage:
    # Local (stdio) — run directly
    uv run server.py

    # Local (streamable-http) — expose as HTTP endpoint
    uv run server.py --transport streamable-http --port 8000

Configuration:
    Set OCR_API_BASE_URL environment variable to point at the backend.
    Defaults to http://localhost:8000/api/v2
"""

import argparse
import base64
import io
import json
import logging
import os
import sys
from typing import Any, Optional

import httpx
from mcp.server.fastmcp import FastMCP
from mcp.types import PromptMessage, ResourceContents

# ── Logging (stderr for stdio, safe for MCP) ───────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("urdu-ocr-mcp")

# ── Constants ──────────────────────────────────────────────────────

API_BASE = os.environ.get(
    "OCR_API_BASE_URL",
    "http://localhost:8000/api/v2",
)

# Whitelisted resource URIs that clients can read directly
RESOURCE_URIS = [
    "urdu-ocr://config",
    "urdu-ocr://health",
    "urdu-ocr://spell-info",
]

mcp = FastMCP(
    "urdu-ocr",
    instructions=(
        "This MCP server provides tools for Urdu document OCR, spell checking, "
        "PDF processing, export, and analysis. Use these tools to extract text from "
        "images/PDFs, correct Urdu spelling, analyze documents, and export results."
    ),
)


# ── HTTP Helper ────────────────────────────────────────────────────

async def _request(
    method: str,
    path: str,
    files: dict | None = None,
    data: dict | None = None,
    json_body: dict | None = None,
) -> dict[str, Any]:
    """Make an HTTP request to the backend API.

    Args:
        method: HTTP method (GET, POST, etc.)
        path: API path (without /api/v2 prefix)
        files: Dict of file fields {field_name: (filename, file_bytes)}
        data: Form data dict
        json_body: JSON body dict

    Returns:
        Parsed JSON response as dict.
    """
    url = f"{API_BASE}{path}"
    timeout = 600.0  # 10 min for long PDF operations

    kwargs: dict[str, Any] = {"timeout": timeout}
    if files:
        kwargs["files"] = files
    if data:
        kwargs["data"] = data
    if json_body:
        kwargs["json"] = json_body

    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, **kwargs)
        resp.raise_for_status()
        return resp.json()


# ====================================================================
#  TOOLS — OCR
# ====================================================================

@mcp.tool()
async def ocr_batch(
    files_description: str,
    file_data_list: list[dict],
    conf_threshold: float = 0.2,
    img_size: int = 1280,
    use_cache: bool = True,
    text_cleaning: str = "true",
) -> str:
    """Batch OCR — extract Urdu text from multiple image or PDF files.

    Args:
        files_description: Human-readable description of what files are being processed.
        file_data_list: List of dicts with keys 'filename' (str) and 'data_b64' (str, base64).
            Example: [{"filename": "doc.jpg", "data_b64": "/9j/..."}]
        conf_threshold: Detection confidence threshold (0.0-1.0). Default 0.2.
        img_size: Inference image size in pixels. Default 1280.
        use_cache: Use result caching. Default True.
        text_cleaning: "true", "false", or JSON dict of cleaning options. Default "true".

    Returns:
        JSON string with task_id, completed/failed counts, processing_time_ms, and results per file.
    """
    files_dict = {}
    for f in file_data_list:
        key = f["filename"]
        binary = base64.b64decode(f["data_b64"])
        files_dict[key] = (f["filename"], io.BytesIO(binary))

    data_out = {
        "conf_threshold": conf_threshold,
        "img_size": img_size,
        "use_cache": use_cache,
        "text_cleaning": text_cleaning,
    }
    result = await _request("POST", "/ocr", files=files_dict, data=data_out)

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def ocr_single(
    description: str,
    file_data: dict,
    conf_threshold: float = 0.2,
    img_size: int = 1280,
    text_cleaning: str = "true",
) -> str:
    """Single image OCR — extract Urdu text from one image with full details.

    Args:
        description: Human-readable description of the file being processed.
        file_data: Dict with 'filename' and 'data_b64' (base64-encoded image bytes).
        conf_threshold: Detection confidence threshold (0.0-1.0). Default 0.2.
        img_size: Inference image size in pixels. Default 1280.
        text_cleaning: "true", "false", or JSON dict of cleaning options. Default "true".

    Returns:
        JSON string with full_text, detected_lines, per-line details (text, confidence, bbox),
        annotated_image_b64, confidence_stats, thumb_image_b64, and auto AI analysis.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "image": (file_data["filename"] or "image", io.BytesIO(binary))}

    data_out = {
        "conf_threshold": conf_threshold,
        "img_size": img_size,
        "text_cleaning": text_cleaning,
    }
    result = await _request("POST", "/ocr/single", files=files_dict, data=data_out)

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def ocr_with_enhance(
    description: str,
    file_data: dict,
    conf_threshold: float = 0.2,
    img_size: int = 1280,
    auto_contrast: bool = False,
    sharpen: bool = False,
    denoise: bool = False,
    normalize_background: bool = False,
    brightness: Optional[float] = None,
    contrast: Optional[float] = None,
) -> str:
    """OCR with image enhancement — preprocess image before OCR.

    Use this for low-contrast, blurry, noisy, or poorly lit documents.

    Args:
        description: Human-readable description of the file being processed.
        file_data: Dict with 'filename' and 'data_b64'.
        conf_threshold: Detection confidence threshold (0.0-1.0). Default 0.2.
        img_size: Inference image size in pixels. Default 1280.
        auto_contrast: Equalize histogram for low-contrast images.
        sharpen: Apply sharpen filter for blurry text.
        denoise: Median filtering to remove noise.
        normalize_background: Histogram equalization per channel for uneven lighting.
        brightness: Manual brightness multiplier (0.5–2.0). None = auto.
        contrast: Manual contrast multiplier (0.5–2.0). None = auto.

    Returns:
        JSON string with OCR results after enhancement + AI analysis.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "image": (file_data["filename"] or "image", io.BytesIO(binary))}

    data_out = {
        "conf_threshold": conf_threshold,
        "img_size": img_size,
        "auto_contrast": auto_contrast,
        "sharpen": sharpen,
        "denoise": denoise,
        "normalize_background": normalize_background,
        "brightness": brightness,
        "contrast": contrast,
    }
    result = await _request("POST", "/ocr/with-enhance", files=files_dict, data=data_out)

    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def ocr_direct_tensor(
    description: str,
    file_data: dict,
    conf_threshold: float = 0.2,
    img_size: int = 1280,
) -> str:
    """Direct OCR with no caching or text cleaning — pure pipeline for programmatic use.

    Args:
        description: Human-readable description of the file being processed.
        file_data: Dict with 'filename' and 'data_b64'.
        conf_threshold: Detection confidence threshold (0.0-1.0). Default 0.2.
        img_size: Inference image size in pixels. Default 1280.

    Returns:
        JSON string with raw OCR output including full_text, lines, annotated_image_b64, etc.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "image": (file_data["filename"] or "image", io.BytesIO(binary))}

    data_out = {
        "conf_threshold": conf_threshold,
        "img_size": img_size,
    }
    result = await _request("POST", "/ocr/direct-tensor", files=files_dict, data=data_out)

    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  TOOLS — PDF
# ====================================================================

@mcp.tool()
async def pdf_info(description: str, file_data: dict) -> str:
    """Get PDF metadata — total pages, title, author, creator, per-page dimensions.

    Args:
        description: Human-readable description of the PDF being inspected.
        file_data: Dict with 'filename' and 'data_b64'.

    Returns:
        JSON string with filename, total_pages, titles, metadata fields.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "doc": (file_data["filename"] or "doc", io.BytesIO(binary))}

    result = await _request("POST", "/pdf/info", files=files_dict, data={})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def pdf_extract(
    description: str,
    file_data: dict,
    from_page: int = 1,
    to_page: Optional[int] = None,
    dpi: int = 300,
) -> str:
    """Extract PDF pages as PNG images with base64-encoded output.

    Args:
        description: Human-readable description of the extraction task.
        file_data: Dict with 'filename' and 'data_b64'.
        from_page: Starting page (1-based). Default 1.
        to_page: Ending page (1-based, inclusive). None = last page.
        dpi: Rendering DPI. Default 300.

    Returns:
        JSON string with pages array — each containing page_number, width, height,
        image_b64, and thumb_image_b64.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "doc": (file_data["filename"] or "doc", io.BytesIO(binary))}

    data_out = {
        "from_page": from_page,
        "to_page": to_page or "",
        "dpi": dpi,
    }
    result = await _request("POST", "/pdf/extract", files=files_dict, data=data_out)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def pdf_reconstruct(
    description: str,
    file_data: dict,
    from_page: int = 1,
    to_page: Optional[int] = None,
) -> str:
    """Extract a page range from a PDF and return as a new compressed PDF file.

    Args:
        description: Human-readable description of the reconstruction task.
        file_data: Dict with 'filename' and 'data_b64'.
        from_page: Starting page (1-based). Default 1.
        to_page: Ending page (1-based, inclusive). None = last page.

    Returns:
        JSON string with 'data_b64' containing the new PDF and its filename.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "doc": (file_data["filename"] or "doc", io.BytesIO(binary))}

    data_out = {
        "from_page": from_page,
        "to_page": to_page or "",
    }
    result = await _request("POST", "/pdf/reconstruct", files=files_dict, data=data_out)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def pdf_ocr(
    description: str,
    file_data: dict,
    from_page: int = 1,
    to_page: Optional[int] = None,
    conf_threshold: float = 0.2,
    img_size: int = 1280,
    text_cleaning: str = "true",
    use_cache: bool = False,
    device: str = "",
    det_type: str = "",
    det_conf: Optional[float] = None,
    mllm_model: str = "",
    layout_analysis: bool = False,
) -> str:
    """PDF OCR — extract text from all or selected pages with full line details.

    This is the primary PDF processing tool for Urdu document extraction.

    Args:
        description: Human-readable description of the OCR task.
        file_data: Dict with 'filename' and 'data_b64'.
        from_page: Starting page (1-based). Default 1.
        to_page: Ending page (1-based, inclusive). None = last page.
        conf_threshold: Detection confidence threshold (0.0-1.0). Default 0.2.
        img_size: Inference image size in pixels. Default 1280.
        text_cleaning: "true", "false", or JSON dict of cleaning options.
        use_cache: Enable result caching. Default False.
        device: Override compute device — 'cpu', 'cuda', or '' for auto.
        det_type: Detection type — 'yolo', 'detr', 'mllm'.
        det_conf: Custom detection confidence threshold.
        mllm_model: MLLM model name for enhanced detection.
        layout_analysis: Enable layout analysis. Default False.

    Returns:
        JSON string with per-page OCR results, each containing full_text, lines,
        detected_lines, confidence_stats, and more.
    """
    binary = base64.b64decode(file_data["data_b64"])
    files_dict = {file_data["filename"] or "doc": (file_data["filename"] or "doc", io.BytesIO(binary))}

    data_out = {
        "from_page": from_page,
        "to_page": to_page or "",
        "conf_threshold": conf_threshold,
        "img_size": img_size,
        "text_cleaning": text_cleaning,
        "use_cache": use_cache,
        "device": device,
        "det_type": det_type,
        "det_conf": det_conf if det_conf is not None else "",
        "mllm_model": mllm_model,
        "layout_analysis": layout_analysis,
    }
    result = await _request("POST", "/pdf/ocr", files=files_dict, data=data_out)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def cancel_pdf_task(task_id: str) -> str:
    """Cancel an ongoing PDF extraction or OCR operation.

    Args:
        task_id: The task ID returned by pdf_extract or pdf_ocr endpoints.

    Returns:
        JSON string with status 'cancelled' and all results from completed pages.
    """
    result = await _request("POST", f"/pdf/cancel/{task_id}", data={})
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  TOOLS — EXPORT
# ====================================================================

@mcp.tool()
async def export_json(ocr_result: dict) -> str:
    """Export OCR result as JSON string.

    Args:
        ocr_result: The full OCR result dict (from any OCR endpoint response).

    Returns:
        JSON string with 'format' and 'data' keys.
    """
    result = await _request("POST", "/export/json", json_body=ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_txt(ocr_result: dict) -> str:
    """Export OCR result as plain text.

    Args:
        ocr_result: The full OCR result dict (from any OCR endpoint response).

    Returns:
        JSON string with 'format' and 'data' keys containing raw text.
    """
    result = await _request("POST", "/export/txt", json_body=ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_csv(ocr_result: dict) -> str:
    """Export OCR result as CSV with columns: index, text, confidence, bounding_box.

    Args:
        ocr_result: The full OCR result dict (from any OCR endpoint response).

    Returns:
        JSON string with 'format' and 'data' keys containing CSV text.
    """
    result = await _request("POST", "/export/csv", json_body=ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_docx(ocr_result: dict) -> str:
    """Export OCR result as Word document (.docx).

    Args:
        ocr_result: The full OCR result dict (from any OCR endpoint response).

    Returns:
        JSON string with 'format' and 'data_b64' keys.
    """
    result = await _request("POST", "/export/docx", json_body=ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_searchable_pdf(ocr_result: dict) -> str:
    """Export OCR result as searchable PDF with invisible text layer.

    Args:
        ocr_result: The full OCR result dict (from any OCR endpoint response).

    Returns:
        JSON string with 'format' and 'data_b64' keys.
    """
    result = await _request("POST", "/export/searchable-pdf", json_body=ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


# PDF-specific export tools
@mcp.tool()
async def export_pdf_json(pdf_ocr_result: dict) -> str:
    """Export PDF OCR result as JSON with per-page aggregation.

    Args:
        pdf_ocr_result: The full PDF OCR result dict (from pdf_ocr endpoint).

    Returns:
        JSON string with 'format' and 'data' keys containing aggregated data.
    """
    result = await _request("POST", "/export/pdf-json", json_body=pdf_ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_pdf_txt(pdf_ocr_result: dict) -> str:
    """Export PDF OCR result as plain text with page separators.

    Args:
        pdf_ocr_result: The full PDF OCR result dict (from pdf_ocr endpoint).

    Returns:
        JSON string with 'format' and 'data' keys containing raw text.
    """
    result = await _request("POST", "/export/pdf-txt", json_body=pdf_ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_pdf_csv(pdf_ocr_result: dict) -> str:
    """Export PDF OCR result as CSV with page numbers for each line.

    Args:
        pdf_ocr_result: The full PDF OCR result dict (from pdf_ocr endpoint).

    Returns:
        JSON string with 'format' and 'data' keys containing CSV text.
    """
    result = await _request("POST", "/export/pdf-csv", json_body=pdf_ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def export_pdf_docx(pdf_ocr_result: dict) -> str:
    """Export PDF OCR result as Word document with per-page sections.

    Args:
        pdf_ocr_result: The full PDF OCR result dict (from pdf_ocr endpoint).

    Returns:
        JSON string with 'format' and 'data_b64' keys.
    """
    result = await _request("POST", "/export/pdf-docx", json_body=pdf_ocr_result)
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  TOOLS — SPELL CHECK
# ====================================================================

@mcp.tool()
async def spell_check(
    text: str = "",
    mode: str = "hybrid",
) -> str:
    """Check and auto-correct Urdu text using multi-strategy engine.

    Supports character confusion, Levenshtein distance, phonetic matching,
    compound word decomposition, n-gram context scoring, and UrduHack integration.

    Args:
        text: Urdu text to correct.
        mode: Correction mode — 'char', 'distance', 'hybrid', or 'aggressive'. Default 'hybrid'.
        confidence_threshold: Minimum correction score (0.0-1.0). Overrides env default.
        sentence_aware: Split by sentences before correcting. Default True.
        protect_english: Skip English words and URLs/emails. Default True.
        phonetic_enabled: Enable sound-alike character corrections. Default True.
        compound_decomposition: Decompose compound/misjoined words. Default True.

    Returns:
        JSON string with original, corrected text, corrections_applied count,
        mode used, and detailed words_corrected list.
    """
    data_out = {
        "text": text,
        "mode": mode,
        "confidence_threshold": None,
        "sentence_aware": True,
        "protect_english": True,
        "phonetic_enabled": True,
        "compound_decomposition": True,
    }
    result = await _request("POST", "/spell/check", json_body=data_out)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_analyze(text: str) -> str:
    """Analyze Urdu text for errors WITHOUT auto-correcting.

    Useful for UI highlighting with inline suggestions — returns error details per word.

    Args:
        text: Urdu text to analyze.

    Returns:
        JSON string with structured analysis including error locations, types, and suggestions.
    """
    result = await _request("POST", "/spell/analyze", json_body={"text": text})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_suggest(text: str, n: int = 3) -> str:
    """Get top-N correction candidates for each word in the text.

    Use when you want to let users pick their preferred correction manually.

    Args:
        text: Urdu text to get suggestions for.
        n: Number of suggestions per word. Default 3.

    Returns:
        JSON string with list of {word, suggestions} entries for each word with errors.
    """
    result = await _request("POST", "/spell/suggest", json_body={"text": text, "n": n})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_batch(texts: list[str] = None, mode: str = "hybrid") -> str:
    """Batch correct multiple Urdu texts in one request with aggregated stats.

    Args:
        texts: List of Urdu texts to correct.
        mode: Correction mode — 'char', 'distance', 'hybrid', or 'aggressive'. Default 'hybrid'.
        diff_mode: Return diff view between original and corrected. Default False.

    Returns:
        JSON string with per-text results and aggregate statistics.
    """
    data_out = {
        "texts": texts or [],
        "mode": mode,
        "diff_mode": False,
    }
    result = await _request("POST", "/spell/batch", json_body=data_out)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_romanize(text: str) -> str:
    """Get approximate Roman (Latin) transcription of Urdu text.

    Args:
        text: Urdu text to romanize.

    Returns:
        JSON string with 'original' and 'romanized' keys.
    """
    result = await _request("POST", "/spell/romanize", json_body={"text": text})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_add_user_word(word: str) -> str:
    """Add a word to the user dictionary — it will never be corrected.

    Args:
        word: Urdu word to protect from correction.

    Returns:
        JSON string with added word and new user_dict_size.
    """
    result = await _request("POST", "/spell/user-dict/add", json_body={"word": word})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_remove_user_word(word: str) -> str:
    """Remove a word from the user dictionary.

    Args:
        word: Urdu word to remove from protection.

    Returns:
        JSON string with removed word, success status, and new user_dict_size.
    """
    result = await _request("POST", "/spell/user-dict/remove", json_body={"word": word})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_list_user_dict() -> str:
    """List all words currently in the user dictionary.

    Returns:
        JSON string with 'words' array and 'total' count.
    """
    result = await _request("GET", "/spell/user-dict")
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_analytics(text: str = "", mode: str = "hybrid") -> str:
    """Get detailed spell-checking analytics for a text or current config.

    Includes correction rate, strategy usage breakdown, grammar flags,
    script detection confidence, and per-character correction distribution.

    Args:
        text: Optional Urdu text to analyze. Omit to get config only.
        mode: Correction mode for analytics. Default 'hybrid'.

    Returns:
        JSON string with detailed analytics or configuration info.
    """
    result = await _request("GET", "/spell/analytics", data={"text": text, "mode": mode})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def spell_info() -> str:
    """Get information about the loaded spell checker — dictionary size, config, flags.

    Returns:
        JSON string with spell_checker config and dictionary statistics.
    """
    result = await _request("GET", "/spell/info")
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  TOOLS — ANALYSIS
# ====================================================================

@mcp.tool()
async def analyze_document(
    text: str = "",
    lines: list[str] = None,
    image_quality: Optional[dict] = None,
) -> str:
    """AI-powered document analysis — detect language, classify type, analyze content.

    Args:
        text: Extracted text from OCR or raw input.
        lines: List of detected text lines (for table detection). Use OCR result's 'lines' field.
        image_quality: Optional dict with image metrics — contrast, sharpness, brightness, noise_level.

    Returns:
        JSON string with language_detection, document_classification, content_analysis, table_detection.
    """
    if lines is None:
        lines = text.split('\n') if text else []
    data_out = {
        "text": text,
        "image_quality": json.dumps(image_quality) if image_quality else "",
    }
    # Pass lines as query param since the endpoint expects Form fields
    result = await _request(
        "POST", "/analysis/document",
        data={"text": text, "lines": "\n".join(lines), "image_quality": data_out["image_quality"]},
    )
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def summarize_text(text: str, max_sentences: int = 3) -> str:
    """Generate an extractive summary with keywords and detected title/headline.

    Args:
        text: Text to summarize (typically from OCR output).
        max_sentences: Maximum sentences in summary. Default 3.

    Returns:
        JSON string with summary text, top keywords with scores, detected title, confidence.
    """
    result = await _request(
        "POST", "/analysis/summarize",
        data={"text": text, "max_sentences": max_sentences},
    )
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def recommend_enhancements(
    contrast: float = 50.0,
    sharpness: float = 100.0,
    brightness: float = 128.0,
    noise_level: float = 0.05,
) -> str:
    """Analyze image quality metrics and recommend optimal preprocessing.

    Args:
        contrast: Contrast value (0-255). Default 50.0.
        sharpness: Sharpness value (Laplacian variance). Default 100.0.
        brightness: Brightness value (mean intensity). Default 128.0.
        noise_level: Estimated noise level (standard deviation of noise). Default 0.05.

    Returns:
        JSON string with recommended enhancement parameters and scores.
    """
    result = await _request(
        "POST", "/analysis/recommend",
        data={
            "contrast": contrast,
            "sharpness": sharpness,
            "brightness": brightness,
            "noise_level": noise_level,
        },
    )
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def detect_table(lines: str) -> str:
    """Detect table structure in OCR output lines.

    Analyzes consecutive lines for tab/pipe-delimited cell patterns
    to identify table-like structures.

    Args:
        lines: Newline-separated OCR output lines to analyze.

    Returns:
        JSON string with table detection results — is_table flag, rows, cols, cells.
    """
    result = await _request(
        "POST", "/analysis/table-detect",
        data={"lines": lines},
    )
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def get_processing_history(
    limit: int = 50,
    operation: Optional[str] = None,
) -> str:
    """Get recent OCR processing operations with metadata.

    Args:
        limit: Number of recent entries to return (1-200). Default 50.
        operation: Filter by operation type — e.g., 'ocr_single', 'pdf_ocr', 'export'. None = all.

    Returns:
        JSON string with stats, entries array (newest first), and count.
    """
    params = {"limit": limit}
    if operation:
        params["operation"] = operation
    result = await _request("GET", "/analysis/history", data=params)
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def clear_processing_history() -> str:
    """Clear all tracked processing history entries."""
    result = await _request("POST", "/analysis/history/clear")
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  TOOLS — SYSTEM / MANAGEMENT
# ====================================================================

@mcp.tool()
async def health_check() -> str:
    """Check if OCR models are loaded and the service is healthy.

    Returns:
        JSON string with status, device info, cuda_available, models_loaded, gpu_memory_used_gb, etc.
    """
    result = await _request("GET", "/health")
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def get_stats() -> str:
    """Get live usage statistics — uptime, total requests/files/lines, GPU memory,
    latency percentiles (p50/p95/p99/max), per-API stats, CPU/RAM usage.

    Returns:
        JSON string with comprehensive live metrics.
    """
    result = await _request("GET", "/stats")
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def switch_device(device: str = "") -> str:
    """Hot-swap between CPU and CUDA at runtime with automatic model reload.

    Args:
        device: 'cpu', 'cuda', or '' for auto-detect.

    Returns:
        JSON string with status, new device label, vocabulary size, GPU memory.
    """
    result = await _request("POST", "/device/switch", data={"device": device})
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def get_cache_stats() -> str:
    """Get cache statistics — enabled status, TTL, entry count, hit/miss counts, hit rate %.

    Returns:
        JSON string with cache stats.
    """
    result = await _request("GET", "/cache/stats")
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def clear_cache() -> str:
    """Clear all cached OCR results (in-memory and disk-persisted).

    Returns:
        JSON string with status confirmation.
    """
    result = await _request("POST", "/cache/clear")
    return json.dumps(result, indent=2, ensure_ascii=False)


@mcp.tool()
async def get_config() -> str:
    """Get the complete running server configuration — server settings, model params,
    file limits, rate limiting, caching, text cleaning, autocorrect mode, spell check thresholds.

    Returns:
        JSON string with full configuration dump.
    """
    result = await _request("GET", "/config")
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  RESOURCES — Readable by MCP clients as URIs
# ====================================================================

@mcp.resource("urdu-ocr://health")
async def resource_health() -> list[ResourceContents]:
    """Read-only health check resource."""
    try:
        result = await _request("GET", "/health")
        return [ResourceContents(uri="urdu-ocr://health", name="Health Check",
                                mime_type="application/json", text=json.dumps(result, indent=2, ensure_ascii=False))]
    except Exception as e:
        return [ResourceContents(uri="urdu-ocr://health", name="Health Check",
                                mime_type="text/plain", text=f"Error: {e}")]


@mcp.resource("urdu-ocr://config")
async def resource_config() -> list[ResourceContents]:
    """Read-only server configuration resource."""
    try:
        result = await _request("GET", "/config")
        return [ResourceContents(uri="urdu-ocr://config", name="Server Config",
                                mime_type="application/json", text=json.dumps(result, indent=2, ensure_ascii=False))]
    except Exception as e:
        return [ResourceContents(uri="urdu-ocr://config", name="Server Config",
                                mime_type="text/plain", text=f"Error: {e}")]


@mcp.resource("urdu-ocr://spell-info")
async def resource_spell_info() -> list[ResourceContents]:
    """Read-only spell checker info resource."""
    try:
        result = await _request("GET", "/spell/info")
        return [ResourceContents(uri="urdu-ocr://spell-info", name="Spell Checker Info",
                                mime_type="application/json", text=json.dumps(result, indent=2, ensure_ascii=False))]
    except Exception as e:
        return [ResourceContents(uri="urdu-ocr://spell-info", name="Spell Checker Info",
                                mime_type="text/plain", text=f"Error: {e}")]


# ====================================================================
#  PROMPTS — Pre-written templates for common workflows
# ====================================================================

@mcp.prompt()
def ocr_workflow():
    """Prompt template for a complete OCR + analysis workflow."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to extract Urdu text from a document. Please use the following tools in order:\n\n"
                    "1. `ocr_single` or `ocr_batch` — Extract text from the image/PDF file.\n"
                    "2. `analyze_document` — Analyze the extracted text for language and document type.\n"
                    "3. `summarize_text` — Generate a summary of the extracted content.\n"
                    "4. `export_txt` or `export_csv` — Export the result in the desired format.\n\n"
                    "Provide a final report summarizing: detected language, document type, word count,\n"
                    "summary, and exported format."
                ),
            },
        ),
    ]


@mcp.prompt()
def spell_check_workflow():
    """Prompt template for Urdu text correction workflow."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to correct Urdu text spelling. Please use the following tools in order:\n\n"
                    "1. `spell_analyze` — Analyze the text for errors (do not auto-correct yet).\n"
                    "2. Show me the analysis results and error count.\n"
                    "3. `spell_suggest` — Get correction candidates for each misspelled word.\n"
                    "4. `spell_check` — Apply corrections using 'hybrid' mode.\n"
                    "5. Compare before/after and explain what was changed.\n\n"
                    "Provide a final corrected version and list of all changes made."
                ),
            },
        ),
    ]


@mcp.prompt()
def pdf_ocr_workflow():
    """Prompt template for PDF OCR workflow."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I have a PDF document with Urdu text. Please process it using:\n\n"
                    "1. `pdf_info` — Get metadata (pages, title, author).\n"
                    "2. `pdf_ocr` — Extract text from all pages.\n"
                    "3. `analyze_document` — Analyze the combined extracted text.\n"
                    "4. `export_pdf_txt` — Export as plain text.\n"
                    "5. `export_pdf_csv` — Export as CSV with page numbers.\n\n"
                    "Provide a summary: total pages, total lines extracted, language detected,\n"
                    "and the exported data in both formats."
                ),
            },
        ),
    ]


# ====================================================================
#  NEW PROMPTS — Additional workflow templates (12 total)
# ====================================================================

@mcp.prompt()
def document_quality_audit():
    """Prompt template for quality-assured OCR pipeline.
    Checks image quality first and applies enhancement if needed before extracting text."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to process an image for Urdu OCR, but I want to ensure high quality.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `recommend_enhancements` — Analyze the image quality and get recommendations.\n"
                    "2. If enhancement is recommended, use `ocr_with_enhance` instead of plain OCR.\n"
                    "3. `analyze_document` — Analyze the extracted text for language and document type.\n"
                    "4. `spell_check` — Auto-correct any spelling errors in the output.\n"
                    "5. `summarize_text` — Generate a summary of the content.\n\n"
                    "Provide a quality report: did enhancement help, what was corrected, and the final summary."
                ),
            },
        ),
    ]


@mcp.prompt()
def export_pipeline():
    """Prompt template for multi-format document export.
    Takes OCR results and exports them into multiple standard formats."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to extract Urdu text from a document and export it in multiple formats.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `ocr_single` — Extract text from the image.\n"
                    "2. `export_json` — Export as structured JSON for programmatic use.\n"
                    "3. `export_txt` — Export as plain text for reading.\n"
                    "4. `export_csv` — Export as CSV with line-level bounding box data.\n"
                    "5. `export_docx` — Export as a formatted Word document.\n"
                    "6. `export_searchable_pdf` — Export as a searchable PDF.\n\n"
                    "Provide a summary of each output format and where it would be most useful."
                ),
            },
        ),
    ]


@mcp.prompt()
def pdf_to_structured_data():
    """Prompt template for converting PDF documents into structured tabular data."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I have a PDF document and need to convert its Urdu text into structured, analyzable data.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `pdf_info` — Understand the document structure first.\n"
                    "2. `pdf_ocr` — Extract all text from every page.\n"
                    "3. `detect_table` — Identify any tables within the OCR lines.\n"
                    "4. `export_pdf_json` — Get structured JSON output with page and line metadata.\n"
                    "5. `export_pdf_csv` — Get CSV output with page numbers for spreadsheet analysis.\n\n"
                    "Provide a summary: number of pages, detected tables, total lines, and\n"
                    "the key data points in tabular format where applicable."
                ),
            },
        ),
    ]


@mcp.prompt()
def spelling_audit_report():
    """Prompt template for comprehensive Urdu spelling analysis and correction."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need a thorough spelling audit of this Urdu text — analyze before correcting.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `spell_analyze` — Show the error breakdown without making changes.\n"
                    "2. Present the analysis results: total words, errors found, error types.\n"
                    "3. `spell_suggest(n=5)` — Get top-5 correction candidates per misspelled word.\n"
                    "4. `spell_check(mode='aggressive')` — Apply aggressive auto-correction.\n"
                    "5. Compare the before and after versions.\n\n"
                    "Provide a detailed report: which words were wrong, what was suggested, what was applied,\n"
                    "and the final corrected text."
                ),
            },
        ),
    ]


@mcp.prompt()
def large_document_batch():
    """Prompt template for processing a batch of documents with quality control."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to process multiple Urdu documents and build a custom vocabulary from the results.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `ocr_batch` — Extract text from all provided images at once.\n"
                    "2. `spell_analyze` on each result — Identify words that don't need correction.\n"
                    "3. `spell_add_user_word` — Add proper nouns and accepted variants to the user dictionary.\n"
                    "4. `spell_list_user_dict` — Show the complete custom dictionary built from this batch.\n"
                    "5. `spell_analytics` — Show correction statistics across the entire batch.\n\n"
                    "Provide a summary: total documents processed, unique words found, new dictionary entries,\n"
                    "and overall correction rate."
                ),
            },
        ),
    ]


@mcp.prompt()
def system_health_check():
    """Prompt template for full system diagnostics and health monitoring."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need a complete health check of the Urdu OCR service.\n\n"
                    "Please run the following diagnostics:\n"
                    "1. `health_check` — Verify models are loaded and service is running.\n"
                    "2. `get_stats` — Check live metrics (requests, latency, GPU usage).\n"
                    "3. `get_cache_stats` — Check cache performance (hit rate, memory usage).\n"
                    "4. `get_config` — Review the current configuration settings.\n\n"
                    "Provide a health summary: is everything operational, any performance concerns,\n"
                    "and any recommendations for optimization."
                ),
            },
        ),
    ]


@mcp.prompt()
def bilingual_comparative():
    """Prompt template for processing documents and creating bilingual output."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to process Urdu text and create a bilingual reference document.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `ocr_single` — Extract the Urdu text from the image.\n"
                    "2. `spell_check(mode='hybrid')` — Ensure the extracted text is correctly spelled.\n"
                    "3. `spell_romanize` — Get the Roman (Latin) transcription of the text.\n"
                    "4. `summarize_text` — Generate a concise summary in Urdu.\n\n"
                    "Provide output in three columns:\n"
                    "- Original Urdu text\n"
                    "- Roman transcription\n"
                    "- Summary of key points\n"
                    "Format as a clean reference table."
                ),
            },
        ),
    ]


@mcp.prompt()
def pdf_reconstruction():
    """Prompt template for PDF page extraction and selective re-processing."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to extract specific pages from a large Urdu PDF and process them individually.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `pdf_info` — Get the page count and document metadata first.\n"
                    "2. `pdf_extract` — Extract selected pages as PNG images (base64).\n"
                    "3. For each extracted page, run `ocr_with_enhance` if quality is low.\n"
                    "4. `export_txt` — Combine all extracted text into a single plain text file.\n\n"
                    "Provide a summary: original page count, pages processed, total lines extracted,\n"
                    "and any pages that needed enhancement."
                ),
            },
        ),
    ]


@mcp.prompt()
def research_document():
    """Prompt template for processing academic/research documents with Urdu text."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to process an academic research document in Urdu and extract key findings.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `ocr_single` or `pdf_ocr` — Extract all text from the document.\n"
                    "2. `analyze_document` — Identify language, document type, and content category.\n"
                    "3. `summarize_text` — Generate an extractive summary with key terms.\n"
                    "4. `detect_table` — Find any tables, charts, or data structures in the OCR lines.\n"
                    "5. `export_json` — Export structured results for further analysis.\n\n"
                    "Provide a research briefing: document classification, extracted findings,\n"
                    "detected tables/figures, and key terms with frequencies."
                ),
            },
        ),
    ]


@mcp.prompt()
def real_time_monitoring():
    """Prompt template for monitoring active OCR/PDF tasks in real time."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I have a long-running PDF OCR task and need to monitor its progress.\n\n"
                    "Please follow this monitoring pattern:\n"
                    "1. `get_task_progress(task_id)` — Check current completion percentage.\n"
                    "2. If not complete, wait and check again (repeat 3-5 times).\n"
                    "3. Once complete, `pdf_info` to verify the output document.\n"
                    "4. `health_check` to ensure service is still stable.\n"
                    "5. If stuck or failed, `cancel_pdf_task(task_id)` and restart with `pdf_ocr`.\n\n"
                    "Provide a progress log: status at each check point, total time, and final result."
                ),
            },
        ),
    ]


@mcp.prompt()
def content_management():
    """Prompt template for document lifecycle management — process, correct, archive."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I need to manage the full lifecycle of Urdu documents — from raw image to archived output.\n\n"
                    "Please follow this pipeline:\n"
                    "1. `ocr_single` or `ocr_batch` — Extract text from incoming images/PDFs.\n"
                    "2. `spell_check(mode='hybrid')` — Auto-correct spelling in extracted text.\n"
                    "3. `analyze_document` — Classify and tag the content.\n"
                    "4. `summarize_text` — Generate content summaries for metadata.\n"
                    "5. Export as `export_txt`, `export_csv`, and `export_searchable_pdf`.\n\n"
                    "Provide a content management report: documents processed, corrections made,\n"
                    "classifications applied, formats exported, and storage recommendations."
                ),
            },
        ),
    ]


@mcp.prompt()
def performance_optimization():
    """Prompt template for optimizing OCR pipeline performance and resource usage."""
    return [
        PromptMessage(
            role="user",
            content={
                "type": "text",
                "text": (
                    "I want to optimize the Urdu OCR pipeline for better performance and lower latency.\n\n"
                    "Please follow this optimization audit:\n"
                    "1. `get_stats` — Check current throughput, latency percentiles, and GPU usage.\n"
                    "2. `get_cache_stats` — Evaluate cache hit rates and identify bottlenecks.\n"
                    "3. `health_check` — Verify the current device (CPU vs CUDA) is optimal.\n"
                    "4. If on CPU, suggest `switch_device(device='cuda')` for GPU acceleration.\n"
                    "5. `clear_cache` if hit rate is below 50% (indicates stale cache).\n\n"
                    "Provide an optimization report: current bottlenecks, recommended device settings,\n"
                    "expected improvements, and any config changes that would help."
                ),
            },
        ),
    ]


# ====================================================================
#  PROGRESS TOOL — Check task progress
# ====================================================================

@mcp.tool()
async def get_task_progress(task_id: str) -> str:
    """Check real-time progress of a long-running PDF extraction or OCR task.

    Args:
        task_id: The task ID from pdf_extract or pdf_ocr responses.

    Returns:
        JSON string with pages_completed, total_pages, percentage, and elapsed time per page.
    """
    result = await _request("GET", f"/progress/{task_id}")
    return json.dumps(result, indent=2, ensure_ascii=False)


# ====================================================================
#  MAIN — Entry point
# ====================================================================

def main():
    parser = argparse.ArgumentParser(description="Urdu OCR MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "streamable-http"],
        default="stdio",
        help="Transport mode (default: stdio)",
    )
    args = parser.parse_args()

    if args.transport == "streamable-http":
        mcp.run(transport="streamable-http")
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
