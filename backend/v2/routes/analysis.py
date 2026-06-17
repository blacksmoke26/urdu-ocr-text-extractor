"""AI-powered analysis API routes for v2 backend."""

from __future__ import annotations

import re as _re
from typing import Any

from fastapi import APIRouter, File, Form, Query, UploadFile

from engine.loader import load_models
from services.language_detector import analyze_document, detect_table_structure
from services.processing_history import get_history, record_operation
from services.text_summary import recommend_enhancements, summarize_text

analysis_router = APIRouter(prefix="/api/v2", tags=["Analysis"])


# ── Document Analysis ─────────────────────────────────────────

@analysis_router.post(
    "/analysis/document",
    summary="Analyze document (language + type + content)",
    description="Detect language, classify document type, and analyze content structure.",
)
async def analyze_document_endpoint(
    file: UploadFile = File(None),
    text: str = Form(""),
    image_quality: str = Form(""),
):
    load_models()

    iq_data = None
    if image_quality:
        import json
        try:
            iq_data = json.loads(image_quality)
        except Exception:
            pass

    result = analyze_document(text=text, lines=text.split('\n') if text else [], image_quality=iq_data)

    return {"status": "success", "analysis": result}


# ── Text Summarization ────────────────────────────────────────

@analysis_router.post(
    "/analysis/summarize",
    summary="Summarize extracted text",
    description="Generate an extractive summary with keywords and title.",
)
async def summarize_endpoint(
    text: str = Form(...),
    max_sentences: int = Form(3),
):
    if not text or not text.strip():
        return {"status": "error", "detail": "No text provided for summarization."}

    summary_result = summarize_text(text, max_sentences=max_sentences)

    return {"status": "success", "summary": summary_result}


# ── Smart Enhancement Recommendations ────────────────────────

@analysis_router.post(
    "/analysis/recommend",
    summary="Recommend image enhancements",
    description="Analyze image quality metrics and recommend optimal preprocessing.",
)
async def recommend_enhancements_endpoint(
    contrast: float = Form(50.0),
    sharpness: float = Form(100.0),
    brightness: float = Form(128.0),
    noise_level: float = Form(0.05),
):
    quality = {
        "contrast": contrast,
        "sharpness": sharpness,
        "brightness": brightness,
        "noise_level": noise_level,
        "needs_contrast": contrast < 30,
        "needs_sharpen": sharpness < 50,
        "needs_brightness": brightness < 40 or brightness > 230,
        "needs_denoise": noise_level > 0.12,
    }

    recommendation = recommend_enhancements(quality)

    return {"status": "success", "recommendation": recommendation}


# ── Table Detection ───────────────────────────────────────────

@analysis_router.post(
    "/analysis/table-detect",
    summary="Detect table structure in OCR lines",
    description="Analyze OCR output lines to detect table-like structures.",
)
async def detect_table_endpoint(
    lines: str = Form(...),
):
    line_list = [l.strip() for l in lines.split('\n') if l.strip()]
    table_result = detect_table_structure(line_list)

    return {"status": "success", "table_detection": table_result}


# ── Processing History ────────────────────────────────────────

@analysis_router.get(
    "/analysis/history",
    summary="Processing history log",
    description="Get recent OCR processing operations with metadata.",
)
async def get_history_endpoint(
    limit: int = Query(50, ge=1, le=200),
    operation: str | None = Query(None, description="Filter by operation type"),
):
    history = get_history()

    if operation:
        entries = history.get_by_operation(operation, limit=limit)
    else:
        entries = history.get_recent(limit=limit)

    return {
        "status": "success",
        "stats": history.get_stats(),
        "entries": list(reversed(entries)),
        "count": len(entries),
    }


@analysis_router.post(
    "/analysis/history/clear",
    summary="Clear processing history",
    description="Clear all tracked processing history entries.",
)
async def clear_history_endpoint():
    get_history().clear()
    return {"status": "ok", "message": "Processing history cleared"}


# ── Combined Analysis (after OCR) — auto-record + analyze ────

def record_and_analyze(
    ocr_result: dict,
    operation: str = "ocr_single",
) -> dict[str, Any]:
    """Record in history and run analysis on the result."""
    filename = ocr_result.get("filename", "unknown")
    lines_count = ocr_result.get("detected_lines", 0)
    proc_time = ocr_result.get("processing_time_ms", 0)
    conf_stats = ocr_result.get("confidence_stats", {})
    full_text = ocr_result.get("full_text", "")
    result_lines = ocr_result.get("lines", [])

    record_operation(
        operation=operation,
        filename=filename,
        status=ocr_result.get("status", "success"),
        lines_detected=lines_count,
        processing_time_ms=proc_time,
        confidence_mean=conf_stats.get("mean"),
        confidence_min=conf_stats.get("min"),
    )

    analysis = None
    summary: Any = None
    recommendations = {"auto_optimize": False}
    table_detection = None

    if full_text and lines_count > 0:
        lines_list = [l.get("text", "") for l in result_lines]
        analysis = analyze_document(text=full_text, lines=lines_list)

        word_count = len(full_text.split())
        if word_count > 5:
            summary = summarize_text(full_text, max_sentences=3)

        if len(lines_list) >= 3:
            current_table: list[list[str]] | None = None
            for idx, line_txt in enumerate(lines_list):
                cells = _re.split(r'[\t|]+', line_txt.strip())
                cells = [c.strip() for c in cells if c.strip()]
                if len(cells) >= 2 and current_table is not None:
                    current_table.append(cells)
                elif len(cells) >= 2:
                    if idx + 1 < len(lines_list):
                        nc = _re.split(r'[\t|]+', lines_list[idx + 1].strip())
                        nc = [c.strip() for c in nc if c.strip()]
                        if len(nc) >= 2 and len(cells) == len(nc):
                            current_table = [cells, nc]
            if current_table and len(current_table) >= 2:
                table_detection = {
                    "is_table": True,
                    "tables": [{"rows": len(current_table), "cols": len(current_table[0]), "cells": current_table[:10]}],
                }

    return {
        "ai_analysis": analysis,
        "summary": summary,
        "recommendations": recommendations,
        "table_detection": table_detection,
    }
