"""Text summarization for Urdu and mixed-language extracted text.

Provides rule-based summarization:
- Key sentence extraction based on position and frequency
- Title/headline detection
- Paragraph-level summarization
- Keyword extraction with TF-IDF-like scoring
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any


# ── Common Urdu stop words for filtering ───────────────────────

_URDU_STOP_WORDS = frozenset({
    "ہے", "ہیں", "کا", "کی", "کے", "اور", "بھی", "جو", "کہ", "یہ", "وہ",
    "تم", "آپ", "میں", "نے", "پر", "کو", "سے", "تک", "لائے", "گیا", "گئی",
    "گئے", "جا", "ات", "والا", "والی", "والے", "ہے", "رہا", "رہی", "رہے",
    "کرتا", "کرتی", "کرتے", "کرنا", "کیا", "کر", "ہو", "ہوئے", "ہونے",
    "یا", "جب", "جب", "تا", "تک", "لیکن", " لیکن", "حالانکہ", "لیکن",
    "لہذا", "اس لیے", "کیونکہ", "بس", "صرف", "بس", "تنہا",
})

_ENGLISH_STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "can", "shall", "it", "its", "this",
    "that", "these", "those", "i", "you", "he", "she", "we", "they", "me",
    "him", "her", "us", "them", "my", "your", "his", "their",
})

_STOP_WORDS = _URDU_STOP_WORDS | _ENGLISH_STOP_WORDS


# ── Sentence splitting ────────────────────────────────────────

def _split_sentences(text: str) -> list[str]:
    """Split text into sentences, respecting Urdu and English punctuation."""
    # Split on sentence-ending punctuation followed by space or end
    sentences = re.split(r'[۔\.\n\r]+', text)
    return [s.strip() for s in sentences if s.strip()]


# ── Keyword extraction ────────────────────────────────────────

def extract_keywords(text: str, top_k: int = 10) -> list[dict[str, Any]]:
    """Extract key terms/keywords from text using frequency-based scoring.

    Skips stop words and very short tokens. Returns scored keywords.
    """
    # Tokenize: split on whitespace + punctuation but keep multi-char Urdu words
    tokens = re.findall(r'[\u0600-\u06FF\u0750-\u077Fa-zA-Z\u0679\u0686\u0698\u06A9\u06AF\u067E\u06BE]{2,}', text)
    tokens = [t for t in tokens if t not in _STOP_WORDS and len(t) >= 2]

    freq = Counter(tokens)
    total = max(len(tokens), 1)

    scored = []
    for word, count in freq.most_common(top_k * 2):
        tf = count / total
        # Score: frequency * length factor (longer words are usually more meaningful)
        score = tf * (1 + len(word) * 0.05)
        scored.append({"word": word, "count": count, "score": round(score, 6)})

    return scored[:top_k]


# ── Summarization ─────────────────────────────────────────────

def summarize_text(
    text: str,
    max_sentences: int = 3,
    method: str = "extractive",
) -> dict[str, Any]:
    """Generate an extractive summary of the text.

    Uses positional scoring (first and last sentences are more important)
    combined with word frequency to select key sentences.
    """
    if not text or not text.strip():
        return {
            "summary": "",
            "method": method,
            "confidence": 0.0,
            "keywords": [],
            "title": "",
        }

    sentences = _split_sentences(text)
    if not sentences:
        return {"summary": "", "method": method, "confidence": 0.0, "keywords": [], "title": ""}

    # Calculate word frequencies (excluding stop words)
    all_words = re.findall(r'[\u0600-\u06FF\u0750-\u077Fa-zA-Z]{2,}', text)
    filtered_words = [w for w in all_words if w not in _STOP_WORDS]
    word_freq = Counter(filtered_words)
    total_words = max(len(filtered_words), 1)

    # Score each sentence
    scored_sentences: list[tuple[float, int, str]] = []
    for i, sent in enumerate(sentences):
        sent_words = re.findall(r'[\u0600-\u06FF\u0750-\u077Fa-zA-Z]{2,}', sent)
        sent_filtered = [w for w in sent_words if w not in _STOP_WORDS]

        # TF-IDF-like score: word frequency * inverse document frequency approximation
        tf_idf = sum(word_freq[w] / total_words for w in sent_filtered) / max(len(sent_filtered), 1)

        # Positional scoring: first sentence gets bonus, last few also valued
        pos_score = 0.0
        if i == 0:
            pos_score = 0.3  # First sentence is often the title/intro
        elif i >= len(sentences) - min(2, len(sentences)):
            pos_score = 0.15  # Last sentences may contain conclusions

        # Length score: prefer medium-length sentences (not too short, not too long)
        sent_len = len(sent_words)
        if 3 <= sent_len <= 20:
            len_score = 0.2
        elif sent_len > 20:
            len_score = 0.1
        else:
            len_score = -0.1

        total_score = tf_idf + pos_score + len_score
        scored_sentences.append((total_score, i, sent))

    # Sort by score descending, pick top sentences (maintain original order)
    scored_sentences.sort(key=lambda x: -x[0])
    selected_indices = sorted([s[1] for s in scored_sentences[:max_sentences]])
    summary_sentences = [sentences[i] for i in selected_indices]

    summary = " ".join(summary_sentences)
    confidence = min(abs(scored_sentences[0][0]), 1.0) if scored_sentences else 0.0

    # Extract title candidate (first meaningful sentence or key phrase)
    title = _extract_title(sentences)

    return {
        "summary": summary,
        "method": method,
        "confidence": round(confidence, 4),
        "keywords": extract_keywords(text, top_k=8),
        "title": title,
        "num_sentences_selected": len(summary_sentences),
        "total_sentences": len(sentences),
    }


def _extract_title(sentences: list[str]) -> str:
    """Extract a potential title/headline from the first few sentences."""
    for sent in sentences[:3]:
        # Title candidates: short (not too long), not containing common sentence starters
        if 10 <= len(re.findall(r'[\u0600-\u06FF\u0750-\u077Fa-zA-Z]{2,}', sent)) <= 15:
            # Check it's not just a number or very short
            alpha_words = [w for w in sent.split() if any(c.isalpha() or 0x0600 <= ord(c) <= 0x06FF for c in w)]
            if len(alpha_words) >= 2:
                # Remove trailing punctuation
                title = sent.strip('۔.!؟،;:')
                if title:
                    return title
    # Fallback to first sentence
    return sentences[0].strip('۔.!؟') if sentences else ""


# ── Smart auto-enhancement recommendations ────────────────────

def recommend_enhancements(text_quality: dict) -> dict[str, Any]:
    """Based on image quality metrics, recommend optimal preprocessing.

    text_quality comes from _detect_image_quality in pipeline.py
    """
    recommendations = []

    if text_quality.get("needs_contrast"):
        recommendations.append({
            "feature": "auto_contrast",
            "intensity": 1.2 if not text_quality.get("needs_brightness") else 1.5,
            "reason": "Low contrast detected — boosting contrast will improve OCR accuracy.",
        })

    if text_quality.get("needs_sharpen"):
        recommendations.append({
            "feature": "sharpen",
            "strength": "medium" if text_quality["sharpness"] > 30 else "strong",
            "reason": "Image appears blurry — sharpening will help character recognition.",
        })

    if text_quality.get("needs_denoise"):
        recommendations.append({
            "feature": "denoise",
            "kernel_size": 3 if text_quality["noise_level"] < 0.15 else 5,
            "reason": "Noise detected — denoising will reduce false character detection.",
        })

    if text_quality.get("needs_brightness"):
        brightness = text_quality.get("brightness", 128)
        recommendations.append({
            "feature": "auto_contrast",
            "brightness_adjust": round(abs(128 - brightness) / 10, 1),
            "reason": f"Image is too {'dark' if brightness < 128 else 'bright'} — adjusting brightness.",
        })

    return {
        "auto_optimize": len(recommendations) > 0,
        "recommendations": recommendations,
        "quality_score": _compute_quality_score(text_quality),
    }


def _compute_quality_score(q: dict) -> float:
    """Compute a 0-1 quality score from image metrics."""
    # Contrast component (higher std = better contrast)
    contrast_score = min(q.get("contrast", 0) / 50, 1.0)
    # Sharpness component (higher Laplacian var = sharper)
    sharpness_score = min(q.get("sharpness", 0) / 100, 1.0)
    # Brightness component (closer to 128 = better)
    brightness = q.get("brightness", 128)
    brightness_score = 1.0 - min(abs(brightness - 128) / 128, 1.0)
    # Noise component (lower noise = better)
    noise = q.get("noise_level", 0)
    noise_score = max(1.0 - noise * 5, 0.0)

    return round((contrast_score * 0.3 + sharpness_score * 0.3 + brightness_score * 0.2 + noise_score * 0.2), 4)
