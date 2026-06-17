"""Language detection and document classification for OCR inputs."""

from __future__ import annotations

import math
from typing import Any


# ── Unicode range helpers ───────────────────────────────────────

_URD_SPECIFIC = frozenset([
    "\u0679", "\u0686", "\u0698", "\u06A9", "\u06AF", "\u067E",
    "\u06BE", "\u0688", "\u069B", "\u06FA",
])


def _char_ranges(text: str) -> dict[str, int]:
    """Count characters in each Unicode block."""
    counts = {
        "urdu": 0, "arabic": 0, "persian": 0, "english": 0,
        "digit_urdu": 0, "digit_english": 0, "punctuation": 0,
        "diacritics": 0, "other": 0,
    }
    for ch in text:
        cp = ord(ch)
        if ch in _URD_SPECIFIC:
            counts["urdu"] += 1
        elif '\u0600' <= ch <= '\u06FF':
            counts["arabic"] += 1
        elif 'a' <= ch.lower() <= 'z':
            counts["english"] += 1
        elif '\u0660' <= ch <= '\u0669':
            counts["digit_urdu"] += 1
        elif '0' <= ch <= '9':
            counts["digit_english"] += 1
        elif '\u064B' <= ch <= '\u065F' or '\u0670' <= ch <= '\u0670':
            counts["diacritics"] += 1
        else:
            counts["other"] += 1
    return counts


# ── Language detection ────────────────────────────────────────

def detect_language(text: str) -> dict[str, Any]:
    """Detect the predominant language(s) in extracted text."""
    if not text or not text.strip():
        return {
            "primary": "unknown", "languages": [], "proportions": {},
            "is_mixed": False, "script_count": 0, "confidence": 0.0,
        }

    char_counts = _char_ranges(text)
    total = max(sum(char_counts.values()), 1)

    urdu_weight = char_counts["urdu"] + char_counts["digit_urdu"] * 0.5
    arabic_weight = char_counts["arabic"]
    english_weight = char_counts["english"]
    persian_weight = char_counts["persian"]

    languages_detected = []
    if urdu_weight > total * 0.15:
        languages_detected.append(("ur", urdu_weight))
    if arabic_weight > total * 0.15:
        languages_detected.append(("ar", arabic_weight))
    if english_weight > total * 0.15:
        languages_detected.append(("en", english_weight))
    if persian_weight > total * 0.15:
        languages_detected.append(("fa", persian_weight))

    languages_detected.sort(key=lambda x: -x[1])

    unique_scripts = sum(1 for w in [urdu_weight, arabic_weight, english_weight, persian_weight] if w > total * 0.1)
    is_mixed = unique_scripts >= 2

    lang_labels = {"ur": "Urdu", "ar": "Arabic", "en": "English", "fa": "Persian", "mixed": "Mixed"}

    if not languages_detected:
        return {
            "primary": "unknown", "languages": [], "proportions": {},
            "is_mixed": False, "script_count": 0, "confidence": 0.0,
        }

    if len(languages_detected) == 1:
        primary = languages_detected[0][0]
        confidence = min(languages_detected[0][1] / total * 2, 1.0)
    else:
        primary = "mixed" if is_mixed else languages_detected[0][0]
        confidence = min((languages_detected[0][1] - languages_detected[-1][1]) / max(total, 1) + 0.5, 1.0)

    return {
        "primary": primary,
        "languages": [{"code": c, "label": lang_labels.get(c, c), "proportion": round(p / total, 4)} for c, p in languages_detected],
        "proportions": {k: round(v / total, 4) for k, v in char_counts.items() if v > 0},
        "is_mixed": is_mixed,
        "script_count": unique_scripts,
        "confidence": round(confidence, 4),
    }


# ── Document type classification ──────────────────────────────

def _analyze_document_type(text: str, lines: list[str] | None = None) -> dict[str, Any]:
    """Classify the document type based on text patterns and structure."""
    scores: dict[str, float] = {
        "receipt": 0.0, "letter": 0.0, "book_page": 0.0,
        "form": 0.0, "handwritten": 0.0, "table_document": 0.0,
    }

    if not text:
        return {"primary": "unknown", "confidence": 0.0, "scores": scores}

    lower = text.lower()
    num_lines = len(lines) if lines else (text.count('\n') + 1)

    # Receipt indicators
    receipt_keywords = ["total", "amount", "price", "receipt", "bill", "quantity",
                        "tax", "vat", "discount", "balance", "sub-total",
                        "\u0631\u0642\u0645", "\u06a9\u0644", "\u0642\u06cc\u0645\u062a",
                        "\u0628\u0644", "\u0631\u0633\u06cc\u062f"]
    receipt_score = sum(1 for kw in receipt_keywords if kw.lower() in lower) / len(receipt_keywords)
    if num_lines < 30:
        number_density = sum(1 for c in text if c.isdigit()) / max(len(text), 1)
        if number_density > 0.05:
            receipt_score += 0.3
    scores["receipt"] = min(receipt_score * 2, 1.0)

    # Letter indicators
    letter_keywords = ["\u0645\u062d\u0631\u0645", "\u0639\u0631\u0636 \u06c1\u06d2", "\u062e\u0637\u0627\u0628",
                       "dear", "sincerely", "regards", "respected"]
    letter_score = sum(1 for kw in letter_keywords if kw.lower() in lower) / len(letter_keywords)
    if num_lines > 5:
        letter_score += 0.2
    scores["letter"] = min(letter_score, 1.0)

    # Book page indicators
    book_keywords = ["chapter", "section", "page", "\u0635\u0641\u06c1", "\u0628\u0627\u0628", "\u0641\u0635\u0644"]
    book_score = sum(1 for kw in book_keywords if kw.lower() in lower) / len(book_keywords)
    if num_lines > 20:
        book_score += 0.3
    scores["book_page"] = min(book_score, 1.0)

    # Form indicators
    form_keywords = ["form", "field", "name:", "date:", "address:", "\u0641\u0631\u0645", "\u0646\u0627\u0645",
                     "\u062a\u0627\u0631\u06cc\u062e", "\u067e\u062a\u0627"]
    form_score = sum(1 for kw in form_keywords if kw.lower() in lower) / len(form_keywords)
    colon_lines = sum(1 for l in text.split('\n') if ':' in l) / max(num_lines, 1)
    if colon_lines > 0.3:
        form_score += 0.4
    scores["form"] = min(form_score * 2, 1.0)

    # Handwritten indicators
    if lines and len(lines) > 5:
        line_lengths = [len(l) for l in lines]
        mean_len = sum(line_lengths) / len(line_lengths)
        length_std = math.sqrt(sum((l - mean_len) ** 2 for l in line_lengths) / len(line_lengths))
        if length_std > 0:
            scores["handwritten"] = min(length_std / max(len(text), 1) * 5, 1.0)

    # Table document indicators
    if lines and len(lines) > 3:
        column_patterns = sum(1 for l in lines if '\t' in l or ' | ' in l)
        uniform_lines = sum(1 for l in lines if len(l.strip()) > 10) / max(len(lines), 1)
        if column_patterns > 0 and uniform_lines > 0.7:
            scores["table_document"] = min(column_patterns / max(len(lines), 1) + 0.3, 1.0)

    primary_type = max(scores, key=scores.get) if any(v > 0 for v in scores.values()) else "unknown"
    confidence = scores[primary_type] if primary_type != "unknown" and scores[primary_type] > 0 else 0.0

    return {
        "primary": primary_type,
        "confidence": round(confidence, 4),
        "scores": {k: round(v, 4) for k, v in sorted(scores.items(), key=lambda x: -x[1])},
    }


# ── Content analysis ─────────────────────────────────────────

def analyze_content(text: str) -> dict[str, Any]:
    """Analyze extracted text for additional insights."""
    if not text or not text.strip():
        return {"word_count": 0, "sentence_count": 0, "char_count": 0}

    import re as _re
    words = [w for w in _re.split(r'\s+', text) if w.strip()]
    sentences = [s.strip() for s in _re.split(r'[.\u200d\u200e\n\r]+', text) if s.strip()]

    avg_word_len = sum(len(w) for w in words) / max(len(words), 1)
    unique_words = set(w.lower() for w in words)
    uniqueness_ratio = len(unique_words) / max(len(words), 1)

    return {
        "word_count": len(words),
        "sentence_count": max(len(sentences), 1),
        "avg_word_length": round(avg_word_len, 2),
        "uniqueness_ratio": round(uniqueness_ratio, 4),
        "char_count": len(text),
        "line_count": text.count('\n') + 1 if text.strip() else 0,
        "has_numbers": bool(_re.search(r'\d', text)),
        "number_density": round(sum(1 for c in text if c.isdigit()) / max(len(text), 1), 4),
    }


# ── Table detection ───────────────────────────────────────────

def detect_table_structure(lines: list[str]) -> dict[str, Any]:
    """Detect table-like structure from OCR lines."""
    if len(lines) < 3:
        return {"is_table": False, "tables": []}

    tables = []
    current_table: list[list[str]] | None = None
    start_idx = 0

    for i, line in enumerate(lines):
        cells = _re.split(r'[\t|]+', line.strip()) if '\t' in line or '|' in line else None
        if cells is not None:
            cells = [c.strip() for c in cells if c.strip()]
        else:
            cells = None

        if cells and len(cells) >= 2 and current_table is not None:
            current_table.append(cells)
        elif cells and len(cells) >= 2:
            if i + 1 < len(lines):
                nc = _re.split(r'[\t|]+', lines[i + 1].strip())
                nc = [c.strip() for c in nc if c.strip()]
                if nc and len(nc) >= 2 and len(cells) == len(nc):
                    current_table = [cells, nc]
                    start_idx = i

    if current_table and len(current_table) >= 2:
        tables.append({
            "start_row": start_idx + 1,
            "rows": len(current_table),
            "cols": len(current_table[0]),
            "cells": current_table[:10],
        })

    return {"is_table": len(tables) > 0, "tables": tables}


# ── Combined analysis ─────────────────────────────────────────

def analyze_document(
    text: str,
    lines: list[str] | None = None,
    image_quality: dict | None = None,
) -> dict[str, Any]:
    """Run full document analysis pipeline."""
    import re as _re  # needed for content analysis

    lang_result = detect_language(text)
    doc_type = _analyze_document_type(text, lines or (text.split('\n') if text else []))
    content = analyze_content(text)

    recommendations: list[str] = []
    if lang_result["primary"] == "unknown":
        recommendations.append("Could not reliably detect language. Try a higher resolution image.")
    if doc_type["confidence"] < 0.3:
        recommendations.append("Document structure is unclear. Consider straightening or enhancing the image.")
    if content.get("avg_word_length", 0) > 8:
        recommendations.append("Long average word length detected — verify OCR accuracy for compound words.")
    if image_quality and image_quality.get("needs_sharpen"):
        recommendations.append("Image appears blurry. Enable sharpening enhancement for better results.")

    return {
        "language": lang_result,
        "document_type": doc_type,
        "content": content,
        "image_quality": image_quality or {},
        "recommendations": recommendations,
    }
