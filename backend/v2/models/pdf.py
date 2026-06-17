"""Pydantic schemas for the v2 PDF API."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class PDFExtractRequest(BaseModel):
    """Input for PDF page extraction."""
    from_page: int = Field(default=1, ge=1)
    to_page: Optional[int] = Field(default=None, ge=1)
    dpi: int = Field(default=300, ge=72, le=600)


class PDFInfoRequest(BaseModel):
    """Input for PDF info request."""
    pass  # No extra params needed — uses file upload


class PDFReconstructRequest(BaseModel):
    """Input for PDF page reconstruction."""
    from_page: int = Field(default=1, ge=1)
    to_page: Optional[int] = Field(default=None, ge=1)


class PDFPageInfo(BaseModel):
    """Metadata for a single PDF page."""
    page_number: int
    title: str
    width: Optional[int] = None
    height: Optional[int] = None
    rotation: int = 0


class PDFInfoResponse(BaseModel):
    """Response with PDF metadata."""
    filename: str
    total_pages: int
    pages: list[PDFPageInfo]
