"""PDF service — extraction, info, and reconstruction."""

from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Optional

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
    def get_info(pdf_data: bytes) -> dict:
        """Get PDF metadata."""
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        total_pages = len(doc)

        info_obj = doc.metadata or {}

        pages_info = []
        for i in range(total_pages):
            page = doc[i]
            pix = page.get_pixmap(dpi=72)
            pages_info.append({
                "page_number": i + 1,
                "title": info_obj.get("title", f"Page {i + 1}")[:80],
                "width": pix.width,
                "height": pix.height,
                "rotation": page.rotation,
            })
        doc.close()

        return {
            "total_pages": total_pages,
            "metadata": {
                "title": info_obj.get("title", ""),
                "author": info_obj.get("author", ""),
                "subject": info_obj.get("subject", ""),
                "creator": info_obj.get("creator", ""),
                "producer": info_obj.get("producer", ""),
            },
            "pages": pages_info,
        }

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
