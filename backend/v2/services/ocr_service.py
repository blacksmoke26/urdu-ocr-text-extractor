"""OCR service — orchestrates pipeline execution with caching and text cleaning."""

from __future__ import annotations

import base64
import io
import threading
import time
from pathlib import Path
from typing import Optional

from PIL import Image
from config import (
    CACHE_ENABLED,
    CACHE_TTL_SECONDS,
    DEFAULT_CONF_THRESHOLD,
    DEFAULT_IMG_SIZE,
    TEXT_CLEANING_ENABLED,
    URDUTEXT_AUTOCORRECT_ENABLED,
    URDUTEXT_AUTOCORRECT_MODE,
)
from engine.pipeline import OCRResult, run_ocr_pipeline
from engine.text_cleaner import TextCleaner
from services.cache_service import ResultCache


class OCRService:
    """High-level OCR service with caching, text cleaning, and auto-correction."""

    def __init__(self, cache: Optional[ResultCache] = None):
        self._cache = cache or ResultCache(enabled=CACHE_ENABLED, ttl_seconds=CACHE_TTL_SECONDS)

    # ── Core methods ─────────────────────────────────────────────

    def ocr_image(self, image_bytes: bytes | io.BytesIO, filename: str,
                  conf_threshold: float = DEFAULT_CONF_THRESHOLD,
                  img_size: int = DEFAULT_IMG_SIZE,
                  text_cleaning: bool | dict = True,
                  use_cache: bool = True,
                  **kwargs: object) -> OCRResult:
        """Run OCR on a single image (raw bytes)."""
        image = Image.open(image_bytes).convert("RGB")

        # Check cache first
        if use_cache and isinstance(text_cleaning, bool):
            cached = self._cache.get(filename, conf_threshold, img_size, clean=text_cleaning)
            if cached:
                # Restore from dict to OCRResult
                return self._dict_to_ocr_result(cached, text_cleaning)

        result = run_ocr_pipeline(image, filename, "image", conf_threshold, img_size)

        # Apply text cleaning
        cleaned_result = self._apply_text_cleaning(result, text_cleaning)

        # Cache the result
        if use_cache:
            is_clean_bool = isinstance(text_cleaning, bool) and text_cleaning
            self._cache.set(filename, conf_threshold, img_size, clean=is_clean_bool, data=cleaned_result.to_dict())

        return cleaned_result

    def ocr_image_from_path(self, file_path: Path, conf_threshold: float = DEFAULT_CONF_THRESHOLD,
                            img_size: int = DEFAULT_IMG_SIZE,
                            text_cleaning: bool | dict = True,
                            use_cache: bool = True) -> OCRResult:
        """Run OCR on a single image from filesystem path."""
        with open(file_path, "rb") as f:
            data = f.read()
        return self.ocr_image(data, file_path.name, conf_threshold, img_size, text_cleaning, use_cache)

    def ocr_pdf_pages(self, pdf_data: bytes | io.BytesIO, filename: str,
                      from_page: int = 1, to_page: Optional[int] = None,
                      conf_threshold: float = DEFAULT_CONF_THRESHOLD,
                      img_size: int = DEFAULT_IMG_SIZE,
                      text_cleaning: bool | dict = True,
                      use_cache: bool = True,
                      interrupt_event: threading.Event | None = None,
                      **kwargs: object) -> list[OCRResult]:
        """Run OCR on all pages of a PDF. Stop if interrupt_event is set."""
        import fitz
        from config import THUMB_WIDTH, THUMB_HEIGHT

        stream = pdf_data if isinstance(pdf_data, bytes) else pdf_data.getvalue()
        doc = fitz.open(stream=stream, filetype="pdf")
        total_pages = len(doc)

        pg_start = max(1, from_page)
        pg_end = min(to_page if to_page is not None else total_pages, total_pages)

        # Always generate thumbnails using config defaults
        tw = THUMB_WIDTH
        th = THUMB_HEIGHT

        results = []
        for page_num in range(pg_start - 1, pg_end):
            # Check for interrupt between pages
            if interrupt_event is not None and interrupt_event.is_set():
                doc.close()
                raise KeyboardInterrupt(f"OCR process interrupted at page {page_num + 1}")

            page = doc[page_num]
            pix = page.get_pixmap(dpi=300)
            img_bytes = io.BytesIO(pix.tobytes("png"))
            page_filename = f"{filename}_page_{page_num + 1}"

            # Generate thumbnail
            thumb_pix = page.get_pixmap(dpi=300)
            img = Image.frombytes("RGB", [thumb_pix.width, thumb_pix.height], thumb_pix.samples)
            img = img.resize((tw, th), Image.Resampling.LANCZOS)
            thumb_buf = io.BytesIO()
            img.save(thumb_buf, format="PNG")
            page_thumb_b64 = base64.b64encode(thumb_buf.getvalue()).decode("utf-8")

            try:
                result = self.ocr_image(img_bytes, page_filename, conf_threshold, img_size, text_cleaning, use_cache)
                # Attach thumbnail info to the dict representation
                result._page_thumb_b64 = page_thumb_b64  # type: ignore
                results.append(result)
            except Exception as e:
                import time as _time
                import traceback
                results.append(OCRResult(
                    filename=page_filename, file_type="pdf_page", lines=[], full_text="",
                    processing_time_ms=0.0,
                ))

        doc.close()
        return results

    # ── Text cleaning helper ──────────────────────────────────────

    def _apply_text_cleaning(self, result: OCRResult, text_cleaning: bool | dict) -> OCRResult:
        """Apply text cleaning to all lines in the OCR result."""
        if not TEXT_CLEANING_ENABLED or not text_cleaning:
            return result

        # Determine autocorrect settings
        autocorrect_enabled = URDUTEXT_AUTOCORRECT_ENABLED
        autocorrect_mode = URDUTEXT_AUTOCORRECT_MODE

        if isinstance(text_cleaning, dict):
            options = {
                "diacritics": text_cleaning.get("remove_diacritics", False),
                "normalize_alef_chars": text_cleaning.get("normalize_alef", True),
                "normalize_tatil": text_cleaning.get("normalize_tatil", True),
                "reshape": text_cleaning.get("reshape", True),
                "normalize_whitespace": text_cleaning.get("normalize_whitespace", True),
            }
            # Allow per-request autocorrect override
            autocorrect_enabled = text_cleaning.get("autocorrect", autocorrect_enabled)
            if "autocorrect_mode" in text_cleaning:
                autocorrect_mode = text_cleaning["autocorrect_mode"]
        else:
            options = {
                "diacritics": False,
                "normalize_alef_chars": True,
                "normalize_tatil": True,
                "reshape": True,
                "normalize_whitespace": True,
            }

        cleaned_lines = []
        for line in result.lines:
            if autocorrect_enabled and autocorrect_mode:
                cleaned_text, correction_stats = TextCleaner.clean_and_autocorrect(
                    line.text, mode=autocorrect_mode, **options
                )
            else:
                cleaned_text = TextCleaner.clean(line.text, **options)
                correction_stats = None

            new_line = type(line)(
                index=line.index,
                text=cleaned_text,
                confidence=line.confidence,
                char_confidences=getattr(line, 'char_confidences', None),
                bounding_box=line.bounding_box,
                detection_confidence=line.detection_confidence,
            )
            new_line._correction_stats = correction_stats  # type: ignore
            cleaned_lines.append(new_line)

        full_cleaned = "\n".join(l.text for l in cleaned_lines)
        return OCRResult(
            filename=result.filename, file_type=result.file_type, lines=cleaned_lines,
            full_text=full_cleaned, annotated_image_b64=result.annotated_image_b64,
            processing_time_ms=result.processing_time_ms,
        )

    def _dict_to_ocr_result(self, d: dict, text_cleaning: bool | dict = False) -> OCRResult:
        """Convert a cached dict back to an OCRResult object."""
        class FakeLine:
            __slots__ = ("index", "text", "confidence", "char_confidences", "bounding_box", "detection_confidence")
            def __init__(self, d):
                self.index = d["index"]
                self.text = d["text"]
                self.confidence = d.get("confidence")
                self.char_confidences = d.get("char_confidences", None)
                self.bounding_box = d.get("bounding_box", [])
                self.detection_confidence = d.get("detection_confidence")

            def to_dict(self) -> dict:
                return {
                    "index": self.index,
                    "text": self.text,
                    "confidence": self.confidence,
                    "bounding_box": [round(v, 2) for v in self.bounding_box],
                    "detection_confidence": self.detection_confidence,
                }

        lines = [FakeLine(l) for l in d.get("lines", [])]
        return OCRResult(
            filename=d["filename"], file_type=d["file_type"], lines=lines,
            full_text=d["full_text"], annotated_image_b64=d.get("annotated_image_b64"),
            processing_time_ms=d.get("processing_time_ms", 0.0),
        )

    @property
    def cache(self) -> ResultCache:
        return self._cache


# Module-level singleton for convenience
_ocr_service: Optional[OCRService] = None


def get_ocr_service() -> OCRService:
    global _ocr_service
    if _ocr_service is None:
        _ocr_service = OCRService()
    return _ocr_service
