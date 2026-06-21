"""PDF service — extraction, info, and reconstruction."""

from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("pdf_service")

import fitz  # PyMuPDF
from PIL import Image


class PDFService:
    """Stateless PDF operations."""

    @staticmethod
    def extract_pages(pdf_data: bytes, from_page: int = 1, to_page: Optional[int] = None,
                      dpi: int = 300) -> list[dict]:
        """Extract pages as PNG images. Returns list of dicts with page_number and image_b64.

        Thumbnails are always generated using config defaults.
        """
        from config import THUMB_WIDTH, THUMB_HEIGHT

        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        pg_start = max(1, from_page)
        pg_end = min(to_page if to_page is not None else total_pages, total_pages)
        tw = THUMB_WIDTH
        th = THUMB_HEIGHT

        pages = []
        for i in range(pg_start - 1, pg_end):
            page = doc[i]
            pix = page.get_pixmap(dpi=dpi)
            img_bytes = pix.tobytes("png")
            b64 = base64.b64encode(img_bytes).decode("utf-8")

            # Generate thumbnail
            import io as _io
            from PIL import Image as _Image
            thumb_pix = page.get_pixmap(dpi=dpi)
            img = _Image.frombytes("RGB", [thumb_pix.width, thumb_pix.height], thumb_pix.samples)
            img = img.resize((tw, th), _Image.Resampling.LANCZOS)
            thumb_buf = _io.BytesIO()
            img.save(thumb_buf, format="PNG")

            entry: dict = {
                "page_number": i + 1,
                "width": pix.width,
                "height": pix.height,
                "image_b64": b64,
                "image_raw": img_bytes,
                "thumb_image_b64": base64.b64encode(thumb_buf.getvalue()).decode("utf-8"),
                "thumb_width": tw,
                "thumb_height": th,
            }

            pages.append(entry)

        doc.close()
        return pages

    @staticmethod
    def get_info(pdf_data: bytes, light_mode: bool = True, max_pages: int = 500) -> dict:
        """Get PDF metadata with optional light mode for large files.
        
        Args:
            pdf_data: Raw PDF bytes
            light_mode: If True, skip per-page scanning (faster, less memory)
            max_pages: Max pages to scan in full mode
        """
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        info_obj = doc.metadata or {}

        result: dict = {
            "total_pages": total_pages,
            "file_size_bytes": len(pdf_data),
            "metadata": {
                "title": (info_obj.get("title") or "").strip() or None,
                "author": (info_obj.get("author") or "").strip() or None,
                "subject": (info_obj.get("subject") or "").strip() or None,
                "creator": (info_obj.get("creator") or "").strip() or None,
                "producer": (info_obj.get("producer") or "").strip() or None,
            },
        }

        if not light_mode and total_pages <= max_pages:
            pages_info = []
            for i in range(total_pages):
                page = doc[i]
                # Use rect instead of pixmap — no rendering needed for dimensions
                page_rect = page.rect
                pages_info.append({
                    "page_number": i + 1,
                    "title": (info_obj.get("title") or f"Page {i + 1}")[:80],
                    "width": round(page_rect.width, 2),
                    "height": round(page_rect.height, 2),
                    "rotation": page.rotation,
                })
            result["pages"] = pages_info
        elif not light_mode and total_pages > max_pages:
            # Return partial info for very large PDFs
            logger.info(f"PDF has {total_pages} pages (exceeds max_pages={max_pages}). Returning partial page list.")
            result["partial_page_scan"] = True
            result["partial_scan_count"] = max_pages
            result["pages"] = PDFService._get_partial_page_info_from_doc(doc, max_pages)
        
        # Clean up empty metadata fields
        result["metadata"] = {k: v for k, v in result["metadata"].items() if v is not None or k == "title"}
        _safe_close_doc(pdf_data) if hasattr(pdf_data, 'close') else None
        doc.close()

        return result

    @staticmethod
    def get_info_light(pdf_data: bytes, light_mode: bool = True, max_pages: int = 500) -> dict:
        """Lightweight version that skips rendering — just reads metadata."""
        return PDFService.get_info(pdf_data, light_mode=light_mode, max_pages=max_pages)

    @staticmethod
    def _get_partial_page_info_from_doc(doc: fitz.Document, limit: int) -> list[dict]:
        """Get page info for first N pages without rendering."""
        info_obj = doc.metadata or {}
        pages = []
        for i in range(min(limit, len(doc))):
            page = doc[i]
            page_rect = page.rect
            pages.append({
                "page_number": i + 1,
                "title": (info_obj.get("title") or f"Page {i + 1}")[:80],
                "width": round(page_rect.width, 2),
                "height": round(page_rect.height, 2),
                "rotation": page.rotation,
            })
        return pages

    @staticmethod
    def _safe_close_doc(doc_obj) -> None:
        """Safely close a document-like object."""
        try:
            if hasattr(doc_obj, 'close') and not getattr(doc_obj, 'is_closed', False):
                doc_obj.close()
        except Exception:
            pass

    @staticmethod
    def reconstruct(pdf_data: bytes, from_page: int = 1, to_page: Optional[int] = None) -> tuple[bytes, str]:
        """Extract a page range and return (pdf_bytes, suggested_filename)."""
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        pg_start = max(1, from_page)
        pg_end = min(to_page if to_page is not None else total_pages, total_pages)

        if pg_start > total_pages:
            doc.close()
            raise ValueError(f"from_page ({pg_start}) exceeds total pages ({total_pages}).")

        new_doc = fitz.open()
        for page_idx in range(pg_start - 1, pg_end):
            new_doc.insert_pdf(doc, from_page=page_idx, to_page=page_idx)

        pdf_bytes = bytearray()
        new_doc.save(pdf_bytes, garbage=4, deflate=True)
        new_doc.close()
        doc.close()

        stem = "document"
        filename = f"{stem}_pages_{pg_start}-{pg_end}.pdf"
        return bytes(pdf_bytes), filename
